import logging

from fastapi import APIRouter, HTTPException

from app.copilot.schemas import CopilotAnswer, CopilotQuestion, CopilotStatusInfo
from app.copilot.service import ask
from app.core.config import copilot_settings
from app.db.session import SessionDep
from app.integrations.llm.anthropic_provider import AnthropicProvider
from app.integrations.llm.ollama_provider import OllamaProvider
from app.integrations.llm.provider import LLMError, LLMProvider

router = APIRouter(prefix="/copilot", tags=["copilot"])
logger = logging.getLogger("finance_copilot.copilot")


def llm() -> LLMProvider:
    try:
        settings = copilot_settings()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail="Copilot is not configured.") from exc
    if settings.provider == "anthropic":
        return AnthropicProvider(api_key=settings.api_key, model=settings.model)
    return OllamaProvider(model=settings.model, base_url=settings.base_url)


@router.get("/status", response_model=CopilotStatusInfo)
def copilot_status() -> CopilotStatusInfo:
    """Which model serves the Copilot and whether data leaves this machine for it.

    Configuration only: it does not call the model, so a local Ollama that is not
    running still reports as configured and fails on the first question instead.
    """
    try:
        settings = copilot_settings()
    except RuntimeError:
        return CopilotStatusInfo(configured=False, provider=None, model=None, local=False)
    return CopilotStatusInfo(
        configured=True, provider=settings.provider, model=settings.model, local=settings.local
    )


@router.post("/ask", response_model=CopilotAnswer)
async def ask_copilot(payload: CopilotQuestion, session: SessionDep) -> CopilotAnswer:
    """Answer a question about the user's finances using read-only, deterministic tools.

    The model selects queries and words the answer; it never computes money. An answer whose
    amounts are not all found in the tool results comes back with status "ungrounded" and
    without the model's text. `evidence` lists the queries that were actually executed.
    """
    try:
        return await ask(session, llm(), payload.question, payload.today)
    except LLMError as exc:
        # LLMError text is written by the adapter from status codes only.
        logger.warning("Copilot model call failed: %s", exc)
        status = 503 if exc.kind == "not_configured" else 502
        raise HTTPException(status_code=status, detail=str(exc)) from exc

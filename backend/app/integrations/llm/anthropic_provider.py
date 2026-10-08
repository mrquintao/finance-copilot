from __future__ import annotations

from typing import Any

import anthropic

from app.integrations.llm.provider import (
    ConversationItem,
    LLMError,
    LLMProvider,
    LLMTurn,
    StopReason,
    ToolCall,
    ToolResults,
    ToolSpec,
    UserMessage,
)

# Declined requests are re-run server-side on Anthropic's recommended fallback model.
FALLBACK_BETA = "server-side-fallback-2026-07-01"
MAX_TOKENS = 16000


class AnthropicProvider(LLMProvider):
    name = "anthropic"

    def __init__(
        self,
        *,
        api_key: str,
        model: str = "claude-opus-5-5",
        timeout_seconds: float = 60,
        client: anthropic.AsyncAnthropic | None = None,
    ) -> None:
        if not api_key and client is None:
            raise LLMError("Copilot model is not configured.", kind="not_configured")
        self._model = model
        self._client = client or anthropic.AsyncAnthropic(api_key=api_key, timeout=timeout_seconds)

    async def respond(
        self,
        *,
        system: str,
        tools: list[ToolSpec],
        conversation: list[ConversationItem],
    ) -> LLMTurn:
        try:
            response = await self._client.beta.messages.create(
                model=self._model,
                max_tokens=MAX_TOKENS,
                system=system,
                tools=[
                    {
                        "name": tool.name,
                        "description": tool.description,
                        "input_schema": tool.input_schema,
                    }
                    for tool in tools
                ],
                messages=[self._message(item) for item in conversation],
                # Thinking is adaptive on this model; effort is the only depth control.
                output_config={"effort": "medium"},
                betas=[FALLBACK_BETA],
                fallbacks="default",
            )
        except (anthropic.AuthenticationError, anthropic.PermissionDeniedError) as exc:
            raise LLMError(
                f"Copilot model rejected the credentials ({exc.status_code}).",
                kind="not_configured",
            ) from exc
        except anthropic.RateLimitError as exc:
            raise LLMError("Copilot model rate limit exceeded (429).", kind="unavailable") from exc
        except anthropic.APIStatusError as exc:
            # Status only: the error body may quote the prompt.
            raise LLMError(
                f"Copilot model request failed ({exc.status_code}).", kind="unavailable"
            ) from exc
        except anthropic.APIConnectionError as exc:
            raise LLMError("Copilot model is unreachable.", kind="unavailable") from exc

        text = "".join(block.text for block in response.content if block.type == "text")
        calls = tuple(
            # `input` is already parsed JSON; it is validated again before any tool runs.
            ToolCall(id=block.id, name=block.name, arguments=dict(block.input))
            for block in response.content
            if block.type == "tool_use"
        )
        return LLMTurn(
            text=text.strip(),
            tool_calls=calls,
            stop=self._stop(response.stop_reason),
            raw=response.content,
        )

    @staticmethod
    def _stop(reason: str | None) -> StopReason:
        if reason == "tool_use":
            return "tool_use"
        if reason == "refusal":
            return "refusal"
        if reason == "max_tokens":
            return "max_tokens"
        return "end"

    @staticmethod
    def _message(item: ConversationItem) -> dict[str, Any]:
        if isinstance(item, UserMessage):
            return {"role": "user", "content": item.text}
        if isinstance(item, ToolResults):
            # Every result of a turn goes back in a single user message.
            return {
                "role": "user",
                "content": [
                    {
                        "type": "tool_result",
                        "tool_use_id": result.call_id,
                        "content": result.content,
                        "is_error": result.is_error,
                    }
                    for result in item.results
                ],
            }
        # The model's own turn, including thinking blocks, goes back exactly as it came.
        return {"role": "assistant", "content": item.raw}

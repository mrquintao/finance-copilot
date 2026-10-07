from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.analytics.schemas import DateRange

# answered: the model's text, with every amount confirmed against tool results.
# ungrounded: the text had an amount no tool returned, so it is withheld.
# refused: the model declined. incomplete: no final answer within the step limit.
CopilotStatus = Literal["answered", "ungrounded", "refused", "incomplete"]


class CopilotQuestion(BaseModel):
    model_config = ConfigDict(extra="forbid")
    question: str = Field(min_length=1, max_length=500)
    # The user's local date: the backend never guesses what "today" or "last month" means.
    today: date


class ToolEvidence(BaseModel):
    """One deterministic query that was really executed for this answer."""

    tool: str
    arguments: dict[str, Any]
    period: DateRange | None
    result: dict[str, Any]


class CopilotAnswer(BaseModel):
    status: CopilotStatus
    answer: str
    # Periods actually queried, in the order they were used.
    periods: list[DateRange]
    evidence: list[ToolEvidence]

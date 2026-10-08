from datetime import date
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.analytics.schemas import DateRange
from app.core.money import Money

# answered: the model's text, with every amount confirmed against tool results.
# ungrounded: the text had an amount no tool returned, so it is withheld.
# refused: the model declined. incomplete: no final answer within the step limit.
CopilotStatus = Literal["answered", "ungrounded", "refused", "incomplete"]

# How a fact's value is to be read. Money values are exact decimal strings.
FactKind = Literal["money", "signed_money", "count", "signed_count", "percent"]


class CopilotQuestion(BaseModel):
    model_config = ConfigDict(extra="forbid")
    question: str = Field(min_length=1, max_length=500)
    # The user's local date: the backend never guesses what "today" or "last month" means.
    today: date


class TransactionsLink(BaseModel):
    """Filters for the Transactions screen that reproduce the query behind a fact."""

    start_date: date
    end_date: date
    q: str | None = None
    category_id: UUID | None = None
    type: Literal["debit", "credit", "transfer"] | None = None


class Fact(BaseModel):
    """One calculated value. It comes from a query result, never from the model's text."""

    label: str
    value: str
    kind: FactKind
    detail: str | None = None
    link: TransactionsLink | None = None


class EvidenceTransaction(BaseModel):
    id: UUID
    date: date
    title: str
    amount: Money
    type: Literal["debit", "credit", "transfer"]


class ToolEvidence(BaseModel):
    """One deterministic query that was really executed for this answer."""

    tool: str
    title: str
    # Which calculation produced the facts, in words.
    source: str
    arguments: dict[str, Any]
    period: DateRange | None
    comparison_period: DateRange | None = None
    # False when the query ran and found nothing: absence of data is stated, not hidden.
    has_data: bool
    facts: list[Fact]
    transactions_link: TransactionsLink | None = None
    transactions: list[EvidenceTransaction] = []
    result: dict[str, Any]


class CopilotAnswer(BaseModel):
    status: CopilotStatus
    # Text written by the model: wording and interpretation. Facts are in `evidence`.
    answer: str
    # Periods actually queried, in the order they were used.
    periods: list[DateRange]
    # True when queries ran and none of them found any data.
    no_data: bool = False
    evidence: list[ToolEvidence]

"""The only things the Copilot can do: read-only, deterministic queries.

Each tool validates its arguments, runs existing analytics or a plain SELECT, and returns
JSON with money as exact decimal strings. Tools never write, never call a provider and never
return account, item or provider identifiers. They do not depend on any model: the tests
call them directly.
"""

from __future__ import annotations

from calendar import monthrange
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.analytics.comparison import get_period_comparison
from app.analytics.queries import get_spending_by_category, get_spending_summary
from app.core.filters import Period
from app.db.models import Category, Transaction
from app.integrations.llm.provider import ToolSpec

MAX_TRANSACTIONS = 20
ZERO = Decimal("0.00")

Preset = Literal["current_month", "previous_month", "last_3_months"]


def resolve_preset(preset: Preset, today: date) -> tuple[date, date]:
    """Same presets as the web client, resolved from the user's local date."""

    def month_bounds(index: int) -> tuple[date, date]:
        year, month = index // 12, index % 12 + 1
        return date(year, month, 1), date(year, month, monthrange(year, month)[1])

    current = today.year * 12 + today.month - 1
    if preset == "current_month":
        return month_bounds(current)
    if preset == "previous_month":
        return month_bounds(current - 1)
    return month_bounds(current - 2)[0], month_bounds(current)[1]


class PeriodArg(BaseModel):
    """Either a named preset or explicit inclusive bounds, never both."""

    model_config = ConfigDict(extra="forbid")
    preset: Preset | None = None
    start_date: date | None = None
    end_date: date | None = None

    @model_validator(mode="after")
    def one_form(self) -> PeriodArg:
        explicit = self.start_date is not None or self.end_date is not None
        if self.preset is not None and explicit:
            raise ValueError("Use either preset or start_date/end_date, not both.")
        if self.preset is None:
            if self.start_date is None or self.end_date is None:
                raise ValueError("Provide preset, or both start_date and end_date.")
            if self.start_date > self.end_date:
                raise ValueError("start_date must be on or before end_date.")
        return self

    def resolve(self, today: date) -> tuple[date, date]:
        if self.preset is not None:
            return resolve_preset(self.preset, today)
        assert self.start_date is not None and self.end_date is not None
        return self.start_date, self.end_date


class PeriodOnly(BaseModel):
    model_config = ConfigDict(extra="forbid")
    period: PeriodArg


class NoArguments(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SearchArguments(BaseModel):
    model_config = ConfigDict(extra="forbid")
    period: PeriodArg
    text: str | None = Field(default=None, max_length=100)
    category: str | None = Field(default=None, max_length=80)
    type: Literal["debit", "credit", "transfer"] | None = None
    limit: int = Field(default=10, ge=1, le=MAX_TRANSACTIONS)


@dataclass(frozen=True, slots=True)
class ToolOutcome:
    result: dict[str, Any]
    arguments: dict[str, Any]
    period: tuple[date, date] | None = None
    is_error: bool = False


def _money(value: Decimal) -> str:
    return format(value, ".2f")


def _range(start: date, end: date) -> dict[str, str]:
    return {"start_date": start.isoformat(), "end_date": end.isoformat()}


def _escape_like(text: str) -> str:
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def spending_summary(session: Session, args: PeriodOnly, today: date) -> ToolOutcome:
    start, end = args.period.resolve(today)
    summary = get_spending_summary(session, Period(start, end))
    return ToolOutcome(
        result={
            "period": _range(start, end),
            "total_spending": _money(summary.total_spending),
            "total_income": _money(summary.total_income),
            "transaction_count": summary.transaction_count,
            "expense_count": summary.expense_count,
            "income_count": summary.income_count,
            "transfer_count": summary.transfer_count,
        },
        arguments=args.model_dump(mode="json", exclude_none=True),
        period=(start, end),
    )


def spending_by_category(session: Session, args: PeriodOnly, today: date) -> ToolOutcome:
    start, end = args.period.resolve(today)
    breakdown = get_spending_by_category(session, Period(start, end))
    return ToolOutcome(
        result={
            "period": _range(start, end),
            "categories": [
                {
                    "category": item.category,
                    "amount": _money(item.amount),
                    "transaction_count": item.transaction_count,
                }
                for item in breakdown.items
            ],
        },
        arguments=args.model_dump(mode="json", exclude_none=True),
        period=(start, end),
    )


def period_comparison(session: Session, args: PeriodOnly, today: date) -> ToolOutcome:
    start, end = args.period.resolve(today)
    comparison = get_period_comparison(session, start, end).model_dump(mode="json")
    for item in comparison["categories"]:
        item.pop("category_id")
    return ToolOutcome(
        result=comparison,
        arguments=args.model_dump(mode="json", exclude_none=True),
        period=(start, end),
    )


def list_categories(session: Session, args: NoArguments, today: date) -> ToolOutcome:
    names = list(session.scalars(select(Category.name).order_by(Category.name)))
    return ToolOutcome(result={"categories": names}, arguments={})


def search_transactions(session: Session, args: SearchArguments, today: date) -> ToolOutcome:
    """Matching transactions with their totals computed in SQL, so nothing is left to add up."""
    start, end = args.period.resolve(today)
    arguments = args.model_dump(mode="json", exclude_none=True)
    conditions = [Transaction.date >= start, Transaction.date <= end]
    if args.type is not None:
        conditions.append(Transaction.type == args.type)
    text = (args.text or "").strip()
    if text:
        pattern = f"%{_escape_like(text)}%"
        conditions.append(
            or_(
                Transaction.description.ilike(pattern, escape="\\"),
                Transaction.merchant.ilike(pattern, escape="\\"),
            )
        )
    if args.category is not None:
        name = args.category.strip()
        if name.lower() == "sem categoria":
            conditions.append(Transaction.category_id.is_(None))
        else:
            category_id = session.scalar(
                select(Category.id).where(func.lower(Category.name) == name.lower())
            )
            if category_id is None:
                return ToolOutcome(
                    result={"error": "Unknown category. Call list_categories for valid names."},
                    arguments=arguments,
                    is_error=True,
                )
            conditions.append(Transaction.category_id == category_id)

    totals = {
        kind: (amount, count)
        for kind, amount, count in session.execute(
            select(Transaction.type, func.sum(Transaction.amount), func.count())
            .where(*conditions)
            .group_by(Transaction.type)
        )
    }
    rows = session.scalars(
        select(Transaction)
        .options(joinedload(Transaction.category))
        .where(*conditions)
        .order_by(Transaction.date.desc(), Transaction.id.desc())
        .limit(args.limit)
    ).all()
    total_count = sum(count for _, count in totals.values())
    return ToolOutcome(
        result={
            "period": _range(start, end),
            "total_count": total_count,
            "totals_by_type": {
                kind: {
                    "amount": _money(totals.get(kind, (ZERO, 0))[0]),
                    "count": totals.get(kind, (ZERO, 0))[1],
                }
                for kind in ("debit", "credit", "transfer")
            },
            "transactions": [
                {
                    "id": str(row.id),
                    "date": row.date.isoformat(),
                    "description": row.description,
                    "merchant": row.merchant,
                    "amount": _money(row.amount),
                    "type": row.type,
                    "category": row.category.name if row.category else "Sem categoria",
                }
                for row in rows
            ],
            "listed": len(rows),
            "truncated": total_count > len(rows),
        },
        arguments=arguments,
        period=(start, end),
    )


PERIOD_SCHEMA: dict[str, Any] = {
    "type": "object",
    "description": (
        "Inclusive period. Prefer a preset when the user says 'this month', 'last month' or "
        "'last 3 months'; otherwise give both dates as YYYY-MM-DD. Never both forms."
    ),
    "properties": {
        "preset": {"type": "string", "enum": ["current_month", "previous_month", "last_3_months"]},
        "start_date": {"type": "string", "format": "date"},
        "end_date": {"type": "string", "format": "date"},
    },
    "additionalProperties": False,
}


def _period_only(description: str) -> dict[str, Any]:
    return {
        "type": "object",
        "description": description,
        "properties": {"period": PERIOD_SCHEMA},
        "required": ["period"],
        "additionalProperties": False,
    }


TOOLS = {
    "get_spending_summary": (
        ToolSpec(
            name="get_spending_summary",
            description=(
                "Total spending (debits), total income (credits) and transaction counts for a "
                "period. Transfers between own accounts are counted but are neither spending "
                "nor income. Use for 'how much did I spend / receive' questions."
            ),
            input_schema=_period_only("Totals for one period."),
        ),
        PeriodOnly,
        spending_summary,
    ),
    "get_spending_by_category": (
        ToolSpec(
            name="get_spending_by_category",
            description=(
                "Spending (debits only) per category for a period, largest first, with the "
                "number of expenses in each. Use for 'how much did I spend on <category>' and "
                "'where did my money go' questions."
            ),
            input_schema=_period_only("Category breakdown for one period."),
        ),
        PeriodOnly,
        spending_by_category,
    ),
    "get_period_comparison": (
        ToolSpec(
            name="get_period_comparison",
            description=(
                "Spending, income, transaction count and per-category spending for a period "
                "against the equivalent period right before it, with the exact difference and "
                "the percent change already computed (null when the previous value is zero). "
                "Use for 'more or less than before' questions; never compute differences "
                "yourself."
            ),
            input_schema=_period_only("The period to compare with the one before it."),
        ),
        PeriodOnly,
        period_comparison,
    ),
    "list_categories": (
        ToolSpec(
            name="list_categories",
            description="The names of the existing categories, to match what the user wrote.",
            input_schema={"type": "object", "properties": {}, "additionalProperties": False},
        ),
        NoArguments,
        list_categories,
    ),
    "search_transactions": (
        ToolSpec(
            name="search_transactions",
            description=(
                "Transactions in a period, optionally filtered by text in the description or "
                "merchant, by category name and by type. Returns the count and the totals per "
                "type for ALL matches, already summed, plus the most recent matches up to "
                "`limit`. Use for questions about a merchant or about specific purchases."
            ),
            input_schema={
                "type": "object",
                "properties": {
                    "period": PERIOD_SCHEMA,
                    "text": {"type": "string", "description": "Literal text to look for."},
                    "category": {
                        "type": "string",
                        "description": "Exact category name, or 'Sem categoria'.",
                    },
                    "type": {"type": "string", "enum": ["debit", "credit", "transfer"]},
                    "limit": {"type": "integer", "minimum": 1, "maximum": MAX_TRANSACTIONS},
                },
                "required": ["period"],
                "additionalProperties": False,
            },
        ),
        SearchArguments,
        search_transactions,
    ),
}

TOOL_SPECS = [spec for spec, _, _ in TOOLS.values()]


def run_tool(session: Session, name: str, arguments: dict[str, Any], today: date) -> ToolOutcome:
    """Validate and execute one tool call. Bad input comes back as an error result."""
    entry = TOOLS.get(name)
    if entry is None:
        return ToolOutcome(result={"error": "Unknown tool."}, arguments={}, is_error=True)
    _, model, function = entry
    try:
        parsed = model.model_validate(arguments)
    except ValidationError as exc:
        problems = [
            {"field": ".".join(str(part) for part in error["loc"]), "problem": error["type"]}
            for error in exc.errors()
        ]
        return ToolOutcome(
            result={"error": "Invalid arguments.", "problems": problems},
            arguments={},
            is_error=True,
        )
    return function(session, parsed, today)

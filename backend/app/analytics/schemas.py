from datetime import date
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, PlainSerializer

from app.core.money import Money


class SpendingSummary(BaseModel):
    currency: Literal["BRL"] = "BRL"
    period_start: date | None
    period_end: date | None
    total_spending: Money
    total_income: Money
    transaction_count: int
    expense_count: int
    income_count: int
    transfer_count: int


class CategorySpending(BaseModel):
    category_id: UUID | None
    category: str
    amount: Money
    transaction_count: int


class SpendingByCategory(BaseModel):
    currency: Literal["BRL"] = "BRL"
    period_start: date | None
    period_end: date | None
    items: list[CategorySpending]


def _signed(value: Decimal) -> str:
    # Avoid "-0.00" for a zero difference.
    return format(value if value else Decimal("0.00"), ".2f")


# A difference between two Money values: exact, two decimals, may be negative.
SignedMoney = Annotated[Decimal, PlainSerializer(_signed, return_type=str)]
# Percent change with one decimal ("12.5", "-100.0"), or null when the base is zero.
Percent = Annotated[Decimal, PlainSerializer(lambda value: format(value, ".1f"), return_type=str)]
Direction = Literal["up", "down", "equal"]


class DateRange(BaseModel):
    start_date: date
    end_date: date


class MoneyChange(BaseModel):
    current: Money
    previous: Money
    change: SignedMoney
    percent_change: Percent | None
    direction: Direction


class CountChange(BaseModel):
    current: int
    previous: int
    change: int
    percent_change: Percent | None
    direction: Direction


class CategoryChange(MoneyChange):
    category_id: UUID | None
    category: str


class PeriodComparison(BaseModel):
    currency: Literal["BRL"] = "BRL"
    period: DateRange
    previous_period: DateRange
    spending: MoneyChange
    income: MoneyChange
    transaction_count: CountChange
    categories: list[CategoryChange]


InsightKind = Literal[
    "category_increase",
    "category_decrease",
    "largest_category_change",
    "spending_change",
    "income_change",
    "recurring_growth",
]


class Insight(MoneyChange):
    """One rule that fired, with the numbers needed to check it by hand."""

    kind: InsightKind
    category_id: UUID | None = None
    category: str | None = None


class InsightThresholds(BaseModel):
    min_change: Money
    min_percent: Percent


class InsightList(BaseModel):
    currency: Literal["BRL"] = "BRL"
    period: DateRange
    previous_period: DateRange
    thresholds: InsightThresholds
    items: list[Insight]

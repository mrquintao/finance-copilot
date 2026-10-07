"""Deterministic comparison of a period with the equivalent period right before it."""

from calendar import monthrange
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID

from sqlalchemy.orm import Session

from app.analytics.queries import get_spending_by_category, get_spending_summary
from app.analytics.schemas import (
    CategoryChange,
    CountChange,
    DateRange,
    Direction,
    MoneyChange,
    PeriodComparison,
)
from app.core.filters import Period

ZERO = Decimal("0.00")
TENTH = Decimal("0.1")


def previous_period(start: date, end: date) -> tuple[date, date]:
    """The equivalent period immediately before [start, end], both inclusive.

    Whole calendar months compare with the same number of whole months before them, so
    September compares with August even though their lengths differ. Any other range compares
    with the same number of days ending the day before it starts.
    """
    whole_months = start.day == 1 and end.day == monthrange(end.year, end.month)[1]
    if whole_months:
        months = (end.year - start.year) * 12 + (end.month - start.month) + 1
        first = start.year * 12 + (start.month - 1) - months
        return date(first // 12, first % 12 + 1, 1), start - timedelta(days=1)
    days = (end - start).days + 1
    return start - timedelta(days=days), start - timedelta(days=1)


def percent_change(current: Decimal | int, previous: Decimal | int) -> Decimal | None:
    """Change relative to the previous value, or None when there is no base to divide by."""
    if previous == 0:
        return None
    ratio = (Decimal(current) - Decimal(previous)) / Decimal(previous)
    return (ratio * 100).quantize(TENTH, rounding=ROUND_HALF_UP)


def direction(current: Decimal | int, previous: Decimal | int) -> Direction:
    if current > previous:
        return "up"
    if current < previous:
        return "down"
    return "equal"


def money_change(current: Decimal, previous: Decimal) -> MoneyChange:
    return MoneyChange(
        current=current,
        previous=previous,
        change=current - previous,
        percent_change=percent_change(current, previous),
        direction=direction(current, previous),
    )


def get_period_comparison(session: Session, start: date, end: date) -> PeriodComparison:
    previous_start, previous_end = previous_period(start, end)
    current = Period(start, end)
    previous = Period(previous_start, previous_end)
    now = get_spending_summary(session, current)
    before = get_spending_summary(session, previous)

    # Spending by category in either period; a category missing from one side counts as zero.
    amounts: dict[UUID | None, list[Decimal]] = {}
    names: dict[UUID | None, str] = {}
    for index, period in enumerate((current, previous)):
        for item in get_spending_by_category(session, period).items:
            amounts.setdefault(item.category_id, [ZERO, ZERO])[index] = item.amount
            names[item.category_id] = item.category
    categories = [
        CategoryChange(
            category_id=category_id,
            category=names[category_id],
            **money_change(now_amount, before_amount).model_dump(),
        )
        for category_id, (now_amount, before_amount) in amounts.items()
    ]
    # Largest movement first; ties broken by size and name so the order is stable.
    categories.sort(key=lambda item: (-abs(item.change), -item.current, item.category))

    return PeriodComparison(
        period=DateRange(start_date=start, end_date=end),
        previous_period=DateRange(start_date=previous_start, end_date=previous_end),
        spending=money_change(now.total_spending, before.total_spending),
        income=money_change(now.total_income, before.total_income),
        transaction_count=CountChange(
            current=now.transaction_count,
            previous=before.transaction_count,
            change=now.transaction_count - before.transaction_count,
            percent_change=percent_change(now.transaction_count, before.transaction_count),
            direction=direction(now.transaction_count, before.transaction_count),
        ),
        categories=categories,
    )

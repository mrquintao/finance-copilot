"""Rule-based insights: fixed thresholds over the period comparison. No model, no heuristics.

Every insight is a comparison row (current, previous, exact change, percent) that passed a rule
below, so it can be reproduced from GET /analytics/period-comparison and the transactions.
"""

from datetime import date
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.analytics.comparison import get_period_comparison, money_change
from app.analytics.schemas import (
    Insight,
    InsightKind,
    InsightList,
    InsightThresholds,
    MoneyChange,
)
from app.core.filters import Period
from app.db.models import Transaction

# A change is "relevant" when it is at least this large in absolute terms AND, when there is
# a previous value to compare with, at least this large relative to it. The percentage used
# is the reported one (one decimal), so the rule can be checked from the response alone.
MIN_CHANGE = Decimal("50.00")
MIN_PERCENT = Decimal("20.0")
ZERO = Decimal("0.00")


def is_relevant(metric: MoneyChange) -> bool:
    if abs(metric.change) < MIN_CHANGE:
        return False
    # No previous value: there is no percentage, and the absolute size alone decides.
    return metric.percent_change is None or abs(metric.percent_change) >= MIN_PERCENT


def recurring_spending(session: Session, period: Period) -> Decimal:
    """Debits flagged as recurring. Transfers and income are never part of it."""
    total = session.scalar(
        select(func.sum(Transaction.amount)).where(
            Transaction.type == "debit",
            Transaction.is_recurring.is_(True),
            *period.conditions(Transaction.date),
        )
    )
    return total if total is not None else ZERO


def get_insights(session: Session, start: date, end: date) -> InsightList:
    comparison = get_period_comparison(session, start, end)
    previous = comparison.previous_period
    items: list[Insight] = []

    def add(kind: InsightKind, metric: MoneyChange, **category: object) -> None:
        # Only the compared values: a category row also carries its own id and name.
        values = metric.model_dump(include=set(MoneyChange.model_fields))
        items.append(Insight(kind=kind, **values, **category))

    # 1. Totals that moved in a relevant way.
    if is_relevant(comparison.spending):
        add("spending_change", comparison.spending)
    if is_relevant(comparison.income):
        add("income_change", comparison.income)

    # 2. The single category that moved the most, whatever its size. The comparison already
    #    orders categories by absolute change with a stable tie-break.
    movers = [item for item in comparison.categories if item.direction != "equal"]
    if movers:
        top = movers[0]
        add("largest_category_change", top, category_id=top.category_id, category=top.category)

    # 3. Every category with a relevant increase or decrease.
    for item in comparison.categories:
        if is_relevant(item):
            kind: InsightKind = (
                "category_increase" if item.direction == "up" else "category_decrease"
            )
            add(kind, item, category_id=item.category_id, category=item.category)

    # 4. Recurring spending that grew in a relevant way. A drop is not reported here.
    recurring = money_change(
        recurring_spending(session, Period(start, end)),
        recurring_spending(session, Period(previous.start_date, previous.end_date)),
    )
    if recurring.direction == "up" and is_relevant(recurring):
        add("recurring_growth", recurring)

    return InsightList(
        period=comparison.period,
        previous_period=previous,
        thresholds=InsightThresholds(min_change=MIN_CHANGE, min_percent=MIN_PERCENT),
        items=items,
    )

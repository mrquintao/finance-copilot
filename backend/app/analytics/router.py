from fastapi import APIRouter, HTTPException

from app.analytics.comparison import get_period_comparison
from app.analytics.insights import get_insights
from app.analytics.queries import get_spending_by_category, get_spending_summary
from app.analytics.schemas import (
    InsightList,
    PeriodComparison,
    SpendingByCategory,
    SpendingSummary,
)
from app.core.filters import PeriodDep
from app.db.session import SessionDep

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/spending-summary", response_model=SpendingSummary)
def spending_summary(session: SessionDep, period: PeriodDep) -> SpendingSummary:
    """Gross debit spending and credit income; internal transfers are excluded."""
    return get_spending_summary(session, period)


@router.get("/spending-by-category", response_model=SpendingByCategory)
def spending_by_category(session: SessionDep, period: PeriodDep) -> SpendingByCategory:
    """Debits only, including a distinct uncategorized bucket."""
    return get_spending_by_category(session, period)


@router.get("/period-comparison", response_model=PeriodComparison)
def period_comparison(session: SessionDep, period: PeriodDep) -> PeriodComparison:
    """Spending, income, count and categories against the equivalent previous period.

    Whole calendar months are compared with the same number of whole months before them; any
    other range with the same number of days right before it. Percentages are null when the
    previous value is zero.
    """
    if period.start_date is None or period.end_date is None:
        raise HTTPException(422, "start_date and end_date are required.")
<<<<<<< HEAD
    return get_period_comparison(session, period.start_date, period.end_date)


@router.get("/insights", response_model=InsightList)
def insights(session: SessionDep, period: PeriodDep) -> InsightList:
    """Rule-based observations about the period against the equivalent previous period.

    A change is relevant when it is at least `thresholds.min_change` in absolute value and,
    if a previous value exists, at least `thresholds.min_percent` relative to it. Each item
    repeats the compared values, so it can be checked against /analytics/period-comparison.
    """
    if period.start_date is None or period.end_date is None:
        raise HTTPException(422, "start_date and end_date are required.")
    try:
        return get_insights(session, period.start_date, period.end_date)
    except (ValueError, OverflowError) as exc:
        raise HTTPException(422, "The period has no previous equivalent period.") from exc
=======
    try:
        return get_period_comparison(session, period.start_date, period.end_date)
    except (ValueError, OverflowError) as exc:
        # The equivalent previous period would start before the first representable date.
        raise HTTPException(422, "The period has no previous equivalent period.") from exc
>>>>>>> feat/9-monthly-comparison

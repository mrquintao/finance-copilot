from fastapi import APIRouter

from app.analytics.queries import get_spending_by_category, get_spending_summary
from app.analytics.schemas import SpendingByCategory, SpendingSummary
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

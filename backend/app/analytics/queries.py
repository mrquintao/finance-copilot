from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.analytics.schemas import CategorySpending, SpendingByCategory, SpendingSummary
from app.core.filters import Period
from app.db.models import Category, Transaction


def get_spending_summary(session: Session, period: Period) -> SpendingSummary:
    rows = session.execute(
        select(Transaction.type, func.sum(Transaction.amount), func.count())
        .where(*period.conditions(Transaction.date))
        .group_by(Transaction.type)
    )
    totals = {kind: (amount, count) for kind, amount, count in rows}
    spending, expenses = totals.get("debit", (Decimal("0.00"), 0))
    income, credits = totals.get("credit", (Decimal("0.00"), 0))
    transfers = totals.get("transfer", (Decimal("0.00"), 0))[1]
    return SpendingSummary(
        period_start=period.start_date,
        period_end=period.end_date,
        total_spending=spending,
        total_income=income,
        transaction_count=expenses + credits + transfers,
        expense_count=expenses,
        income_count=credits,
        transfer_count=transfers,
    )


def get_spending_by_category(session: Session, period: Period) -> SpendingByCategory:
    amount = func.sum(Transaction.amount).label("amount")
    rows = session.execute(
        select(Category.id, Category.name, amount, func.count())
        .select_from(Transaction)
        .outerjoin(Category, Transaction.category_id == Category.id)
        .where(Transaction.type == "debit", *period.conditions(Transaction.date))
        .group_by(Category.id, Category.name)
        .order_by(amount.desc(), Category.name.asc().nulls_last(), Category.id.asc())
    )
    return SpendingByCategory(
        period_start=period.start_date,
        period_end=period.end_date,
        items=[
            CategorySpending(
                category_id=category_id,
                category=name or "Sem categoria",
                amount=total,
                transaction_count=count,
            )
            for category_id, name, total, count in rows
        ],
    )

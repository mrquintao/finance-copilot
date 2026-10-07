from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import joinedload

from app.core.filters import PeriodDep
from app.db.models import Transaction
from app.db.session import SessionDep
from app.transactions.schemas import TransactionPage, TransactionRead

router = APIRouter(prefix="/transactions", tags=["transactions"])


def escape_like(text: str) -> str:
    """Make user text literal inside a LIKE pattern (%, _ and the escape character itself)."""
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def transaction_query() -> Select[tuple[Transaction]]:
    return select(Transaction).options(
        joinedload(Transaction.account), joinedload(Transaction.category)
    )


@router.get("", response_model=TransactionPage)
def list_transactions(
    session: SessionDep,
    period: PeriodDep,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0, le=1_000_000)] = 0,
    category_id: UUID | None = None,
    account_id: UUID | None = None,
    type: Annotated[Literal["debit", "credit", "transfer"] | None, Query()] = None,
    q: Annotated[
        str | None,
        Query(max_length=100, description="Case-insensitive text in description or merchant"),
    ] = None,
) -> TransactionPage:
    """Newest first, with a stable UUID tie-breaker. Date bounds are inclusive.

    Filters combine with AND. The text search is a plain substring match, not a pattern.
    """
    conditions = period.conditions(Transaction.date)
    if category_id is not None:
        conditions.append(Transaction.category_id == category_id)
    if account_id is not None:
        conditions.append(Transaction.account_id == account_id)
    if type is not None:
        conditions.append(Transaction.type == type)
    text = (q or "").strip()
    if text:
        pattern = f"%{escape_like(text)}%"
        conditions.append(
            or_(
                Transaction.description.ilike(pattern, escape="\\"),
                Transaction.merchant.ilike(pattern, escape="\\"),
            )
        )
    total = session.scalar(select(func.count()).select_from(Transaction).where(*conditions))
    records = session.scalars(
        transaction_query()
        .where(*conditions)
        .order_by(Transaction.date.desc(), Transaction.id.desc())
        .offset(offset)
        .limit(limit)
    )
    return TransactionPage(
        items=[TransactionRead.model_validate(record) for record in records],
        total=total or 0,
        limit=limit,
        offset=offset,
    )


@router.get("/{transaction_id}", response_model=TransactionRead)
def get_transaction(transaction_id: UUID, session: SessionDep) -> TransactionRead:
    record = session.scalar(transaction_query().where(Transaction.id == transaction_id))
    if record is None:
        raise HTTPException(404, "Transaction not found.")
    return TransactionRead.model_validate(record)

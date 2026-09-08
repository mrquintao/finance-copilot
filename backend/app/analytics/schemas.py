from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel

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

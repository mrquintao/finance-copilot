from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.categories.schemas import CategoryRead
from app.core.money import Money


class AccountRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    institution: str
    currency: Literal["BRL"]


class TransactionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    external_id: str | None
    account_id: UUID
    account: AccountRead
    date: date
    description: str
    merchant: str | None
    amount: Money
    currency: Literal["BRL"]
    type: Literal["debit", "credit", "transfer"]
    category: CategoryRead | None
    subcategory: str | None
    is_recurring: bool
    created_at: datetime
    updated_at: datetime


class TransactionPage(BaseModel):
    items: list[TransactionRead]
    total: int
    limit: int
    offset: int

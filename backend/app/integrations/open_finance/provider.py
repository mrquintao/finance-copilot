from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Literal


TransactionKind = Literal["debit", "credit", "transfer"]


@dataclass(frozen=True, slots=True)
class ProviderAccount:
    external_id: str
    item_id: str
    name: str
    institution: str
    currency: str


@dataclass(frozen=True, slots=True)
class ProviderTransaction:
    external_id: str
    account_external_id: str
    date: date
    description: str
    merchant: str | None
    amount: Decimal
    currency: str
    type: TransactionKind
    category: str | None
    subcategory: str | None


class FinancialDataProvider(ABC):
    name: str

    @abstractmethod
    async def create_connect_token(self, *, item_id: str | None = None) -> str:
        raise NotImplementedError

    @abstractmethod
    async def get_accounts(self, *, item_id: str) -> list[ProviderAccount]:
        raise NotImplementedError

    @abstractmethod
    async def get_transactions(
        self,
        *,
        account_id: str,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> list[ProviderTransaction]:
        raise NotImplementedError

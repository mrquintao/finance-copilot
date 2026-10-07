from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel

# How the account's data source is doing, derived from the latest sync run of its item:
# connected = last run succeeded, failing = last run failed, syncing = a run is in progress,
# never_synced = imported account without any run, local = not linked to a provider.
ConnectionState = Literal["connected", "failing", "syncing", "never_synced", "local"]


class AccountLastSync(BaseModel):
    status: Literal["running", "succeeded", "failed"]
    started_at: datetime
    finished_at: datetime | None


class AccountSummary(BaseModel):
    """What the app knows about an account. Provider item/account ids are never exposed."""

    id: UUID
    name: str
    institution: str
    currency: Literal["BRL"]
    provider: str | None
    connection: ConnectionState
    last_sync: AccountLastSync | None
    last_successful_sync_at: datetime | None
    transaction_count: int
    last_transaction_date: date | None


class AccountGroup(BaseModel):
    institution: str
    accounts: list[AccountSummary]


class AccountList(BaseModel):
    total: int
    groups: list[AccountGroup]

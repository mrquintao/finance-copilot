from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ConnectTokenRequest(BaseModel):
    item_id: str | None = Field(default=None, min_length=1, max_length=100)


class ConnectTokenResponse(BaseModel):
    connect_token: str


class SyncRequest(BaseModel):
    item_id: str = Field(min_length=1, max_length=100)
    start_date: date | None = None
    end_date: date | None = None


class SyncRunRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    provider: str
    item_id: str
    started_at: datetime
    finished_at: datetime | None
    status: str
    accounts_received: int
    transactions_received: int
    transactions_created: int
    transactions_updated: int
    error: str | None


class SyncList(BaseModel):
    items: list[SyncRunRead]

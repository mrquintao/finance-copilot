from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ConnectTokenRequest(BaseModel):
    item_id: str | None = Field(default=None, min_length=1, max_length=100)


class ConnectTokenResponse(BaseModel):
    connect_token: str


class SyncRequest(BaseModel):
    item_id: str = Field(min_length=1, max_length=100)
    start_date: date | None = None
    end_date: date | None = None

    @model_validator(mode="after")
    def validate_period(self) -> "SyncRequest":
        if self.start_date and self.end_date and self.start_date > self.end_date:
            raise ValueError("start_date must be before or equal to end_date.")
        return self


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

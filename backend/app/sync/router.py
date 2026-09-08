from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from app.core.config import pluggy_settings
from app.db.models import SyncRun
from app.db.session import SessionDep
from app.integrations.open_finance.pluggy import PluggyProvider
from app.integrations.open_finance.provider import ProviderError
from app.sync.schemas import (
    ConnectTokenRequest,
    ConnectTokenResponse,
    SyncList,
    SyncRequest,
    SyncRunRead,
)
from app.sync.service import SyncService

router = APIRouter(prefix="/sync", tags=["sync"])


def provider() -> PluggyProvider:
    try:
        settings = pluggy_settings()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail="Open Finance provider is not configured.") from exc
    return PluggyProvider(
        client_id=settings.client_id,
        client_secret=settings.client_secret,
        base_url=settings.base_url,
    )


@router.post("/connect-token", response_model=ConnectTokenResponse)
async def create_connect_token(payload: ConnectTokenRequest) -> ConnectTokenResponse:
    try:
        token = await provider().create_connect_token(item_id=payload.item_id)
    except ProviderError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return ConnectTokenResponse(connect_token=token)


@router.post("", response_model=SyncRunRead)
async def synchronize(payload: SyncRequest, session: SessionDep) -> SyncRunRead:
    if payload.start_date and payload.end_date and payload.start_date > payload.end_date:
        raise HTTPException(status_code=422, detail="start_date must be before or equal to end_date.")
    try:
        run = await SyncService(provider()).synchronize(
            session,
            item_id=payload.item_id,
            start_date=payload.start_date,
            end_date=payload.end_date,
        )
    except ProviderError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return SyncRunRead.model_validate(run)


@router.get("/runs", response_model=SyncList)
def list_sync_runs(session: SessionDep) -> SyncList:
    runs = session.scalars(select(SyncRun).order_by(SyncRun.started_at.desc()).limit(50))
    return SyncList(items=[SyncRunRead.model_validate(run) for run in runs])

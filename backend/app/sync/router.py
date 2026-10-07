import logging

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
logger = logging.getLogger("finance_copilot.sync")


def provider_failure(exc: ProviderError) -> HTTPException:
    # ProviderError text is written by the adapter (status code plus a validated error constant),
    # never copied from a response body, so it is safe to log and return.
    logger.warning("Provider call failed: %s", exc)
    return HTTPException(status_code=502, detail=str(exc))


def provider() -> PluggyProvider:
    try:
        settings = pluggy_settings()
    except RuntimeError as exc:
        raise HTTPException(
            status_code=503, detail="Open Finance provider is not configured."
        ) from exc
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
        raise provider_failure(exc) from exc
    return ConnectTokenResponse(connect_token=token)


@router.post("", response_model=SyncRunRead)
async def synchronize(payload: SyncRequest, session: SessionDep) -> SyncRunRead:
    try:
        run = await SyncService(provider()).synchronize(
            session,
            item_id=payload.item_id,
            start_date=payload.start_date,
            end_date=payload.end_date,
        )
    except ProviderError as exc:
        raise provider_failure(exc) from exc
    return SyncRunRead.model_validate(run)


@router.post("/refresh", response_model=SyncList)
async def refresh_connected_accounts(session: SessionDep) -> SyncList:
    """Re-import every item this app has synchronized before, without a new login.

    Known items are the distinct item ids in sync_runs, including items whose only run failed.
    One item failing does not stop the others: its run comes back with status "failed".
    """
    item_ids = list(
        session.scalars(
            select(SyncRun.item_id)
            .where(SyncRun.provider == "pluggy")
            .distinct()
            .order_by(SyncRun.item_id)
        )
    )
    runs: list[SyncRunRead] = []
    service = SyncService(provider())
    for item_id in item_ids:
        run, error = await service.attempt(session, item_id=item_id)
        if isinstance(error, ProviderError):
            logger.warning("Provider call failed: %s", error)
        elif error is not None:
            raise error
        runs.append(SyncRunRead.model_validate(run))
    return SyncList(items=runs)


@router.get("/runs", response_model=SyncList)
def list_sync_runs(session: SessionDep) -> SyncList:
    runs = session.scalars(select(SyncRun).order_by(SyncRun.started_at.desc()).limit(50))
    return SyncList(items=[SyncRunRead.model_validate(run) for run in runs])

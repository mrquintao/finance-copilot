from fastapi import APIRouter
from sqlalchemy import func, select, tuple_

from app.accounts.schemas import (
    AccountGroup,
    AccountLastSync,
    AccountList,
    AccountSummary,
    ConnectionState,
)
from app.db.models import Account, SyncRun, Transaction
from app.db.session import SessionDep

router = APIRouter(prefix="/accounts", tags=["accounts"])

CONNECTION_BY_STATUS: dict[str, ConnectionState] = {
    "succeeded": "connected",
    "failed": "failing",
    "running": "syncing",
}


@router.get("", response_model=AccountList)
def list_accounts(session: SessionDep) -> AccountList:
    """Every account, grouped by institution, with its sync state and transaction count."""
    accounts = list(
        session.scalars(select(Account).order_by(Account.institution, Account.name, Account.id))
    )
    activity = {
        account_id: (count, last_date)
        for account_id, count, last_date in session.execute(
            select(Transaction.account_id, func.count(), func.max(Transaction.date)).group_by(
                Transaction.account_id
            )
        )
    }

    # Latest run and latest successful run per (provider, item), newest first.
    items = {
        (account.provider, account.provider_item_id)
        for account in accounts
        if account.provider and account.provider_item_id
    }
    latest: dict[tuple[str, str], SyncRun] = {}
    latest_success: dict[tuple[str, str], SyncRun] = {}
    if items:
        runs = session.scalars(
            select(SyncRun)
            .where(tuple_(SyncRun.provider, SyncRun.item_id).in_(items))
            .order_by(SyncRun.started_at.desc(), SyncRun.id.desc())
        )
        for run in runs:
            key = (run.provider, run.item_id)
            latest.setdefault(key, run)
            if run.status == "succeeded":
                latest_success.setdefault(key, run)

    groups: dict[str, list[AccountSummary]] = {}
    for account in accounts:
        key = (account.provider, account.provider_item_id)
        run = latest.get(key)
        success = latest_success.get(key)
        connection: ConnectionState
        if account.provider is None:
            connection = "local"
        elif run is None:
            connection = "never_synced"
        else:
            connection = CONNECTION_BY_STATUS[run.status]
        count, last_date = activity.get(account.id, (0, None))
        groups.setdefault(account.institution, []).append(
            AccountSummary(
                id=account.id,
                name=account.name,
                institution=account.institution,
                currency=account.currency,
                provider=account.provider,
                connection=connection,
                last_sync=AccountLastSync.model_validate(run, from_attributes=True)
                if run
                else None,
                last_successful_sync_at=(success.finished_at or success.started_at)
                if success
                else None,
                transaction_count=count,
                last_transaction_date=last_date,
            )
        )

    return AccountList(
        total=len(accounts),
        groups=[
            AccountGroup(institution=institution, accounts=rows)
            for institution, rows in groups.items()
        ],
    )

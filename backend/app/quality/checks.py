"""Read-only checks for import inconsistencies.

Nothing here writes, deletes or repairs anything: every check counts rows and reports
metadata. Findings never contain descriptions, merchants, amounts or provider identifiers,
only counts, dates and the app's own account ids, so a report is safe to paste elsewhere.
"""

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import Account, SyncRun, Transaction

# An item is expected to be synchronized at least this often.
MAX_SYNC_GAP = timedelta(days=7)
# Transactions dated before this are treated as implausible for this application.
EARLIEST_PLAUSIBLE_DATE = date(2000, 1, 1)
# A value date may legitimately be a little ahead of "today" across time zones.
FUTURE_TOLERANCE = timedelta(days=1)

Severity = Literal["warning", "info"]


@dataclass(frozen=True, slots=True)
class Finding:
    check: str
    severity: Severity
    count: int
    summary: str
    # Per-account or per-item metadata; never transaction content.
    details: tuple[dict[str, object], ...] = ()


@dataclass(slots=True)
class QualityReport:
    generated_at: datetime
    accounts: int
    transactions: int
    sync_runs: int
    findings: list[Finding] = field(default_factory=list)

    @property
    def clean(self) -> bool:
        return not self.findings


def possible_duplicates(session: Session) -> Finding | None:
    """Same account, date, amount, type and description more than once.

    Two identical purchases on one day are legitimate, so these are candidates to look at,
    not errors. Synchronization itself cannot create them: it upserts by external id.
    """
    description = func.lower(func.btrim(Transaction.description))
    groups = session.execute(
        select(Transaction.account_id, func.count())
        .group_by(
            Transaction.account_id,
            Transaction.date,
            Transaction.amount,
            Transaction.type,
            description,
        )
        .having(func.count() > 1)
    ).all()
    if not groups:
        return None
    per_account: dict[object, list[int]] = defaultdict(lambda: [0, 0])
    for account_id, size in groups:
        per_account[account_id][0] += 1
        per_account[account_id][1] += size - 1
    extra = sum(values[1] for values in per_account.values())
    return Finding(
        check="possible_duplicates",
        severity="warning",
        count=extra,
        summary=(
            f"{extra} transaction(s) repeat another one in the same account "
            f"(same date, amount, type and description), in {len(groups)} group(s)."
        ),
        details=tuple(
            {"account_id": str(account_id), "groups": values[0], "repeated_rows": values[1]}
            for account_id, values in sorted(per_account.items(), key=lambda item: str(item[0]))
        ),
    )


def missing_external_ids(session: Session) -> Finding | None:
    """Imported transactions without the id that deduplication relies on."""
    count = session.scalar(
        select(func.count())
        .select_from(Transaction)
        .join(Account, Transaction.account_id == Account.id)
        .where(Account.provider.is_not(None), Transaction.external_id.is_(None))
    )
    if not count:
        return None
    return Finding(
        check="missing_external_ids",
        severity="warning",
        count=count,
        summary=f"{count} imported transaction(s) have no external id and cannot be deduplicated.",
    )


def sync_gaps(session: Session, now: datetime) -> list[Finding]:
    """Items that never synchronized successfully, went stale, or had a long silent stretch."""
    successes: dict[tuple[str, str], list[datetime]] = defaultdict(list)
    known: set[tuple[str, str]] = set()
    for provider, item_id, status, started_at in session.execute(
        select(SyncRun.provider, SyncRun.item_id, SyncRun.status, SyncRun.started_at).order_by(
            SyncRun.started_at
        )
    ):
        known.add((provider, item_id))
        if status == "succeeded":
            successes[(provider, item_id)].append(started_at)

    # Items are numbered in a stable order instead of being named by their provider id.
    labels = {key: f"item {index}" for index, key in enumerate(sorted(known), start=1)}
    never, stale, gaps = [], [], []
    for key in sorted(known):
        times = successes.get(key, [])
        if not times:
            never.append({"item": labels[key]})
            continue
        since_last = now - times[-1]
        if since_last > MAX_SYNC_GAP:
            stale.append({"item": labels[key], "days_since_last_success": since_last.days})
        longest = max((later - earlier for earlier, later in zip(times, times[1:])), default=None)
        if longest is not None and longest > MAX_SYNC_GAP:
            gaps.append({"item": labels[key], "longest_gap_days": longest.days})

    limit = MAX_SYNC_GAP.days
    findings = []
    if never:
        findings.append(
            Finding(
                check="item_never_synchronized",
                severity="warning",
                count=len(never),
                summary=f"{len(never)} item(s) have sync runs but none succeeded.",
                details=tuple(never),
            )
        )
    if stale:
        findings.append(
            Finding(
                check="stale_synchronization",
                severity="warning",
                count=len(stale),
                summary=f"{len(stale)} item(s) had no successful sync in the last {limit} days.",
                details=tuple(stale),
            )
        )
    if gaps:
        findings.append(
            Finding(
                check="historical_sync_gap",
                severity="info",
                count=len(gaps),
                summary=(
                    f"{len(gaps)} item(s) once went more than {limit} days "
                    "between successful syncs."
                ),
                details=tuple(gaps),
            )
        )
    return findings


def accounts_without_transactions(session: Session) -> Finding | None:
    """Imported accounts that are still empty although their item synchronized successfully."""
    synchronized = (
        select(SyncRun.item_id)
        .where(SyncRun.provider == Account.provider, SyncRun.status == "succeeded")
        .where(SyncRun.item_id == Account.provider_item_id)
        .exists()
    )
    has_transactions = select(Transaction.id).where(Transaction.account_id == Account.id).exists()
    account_ids = list(
        session.scalars(
            select(Account.id)
            .where(Account.provider.is_not(None), synchronized, ~has_transactions)
            .order_by(Account.id)
        )
    )
    if not account_ids:
        return None
    return Finding(
        check="account_without_transactions",
        severity="warning",
        count=len(account_ids),
        summary=(
            f"{len(account_ids)} imported account(s) have no transactions after a successful sync."
        ),
        details=tuple({"account_id": str(account_id)} for account_id in account_ids),
    )


def invalid_values(session: Session, today: date) -> list[Finding]:
    """Values the schema accepts but that are unlikely to be right. They are only flagged."""
    checks = (
        (
            "zero_amount",
            Transaction.amount == 0,
            "transaction(s) have a zero amount.",
        ),
        (
            "future_date",
            Transaction.date > today + FUTURE_TOLERANCE,
            "transaction(s) are dated in the future.",
        ),
        (
            "implausibly_old_date",
            Transaction.date < EARLIEST_PLAUSIBLE_DATE,
            f"transaction(s) are dated before {EARLIEST_PLAUSIBLE_DATE.isoformat()}.",
        ),
        (
            "blank_description",
            func.btrim(Transaction.description) == "",
            "transaction(s) have a blank description.",
        ),
    )
    findings = []
    for name, condition, text in checks:
        rows = session.execute(
            select(Transaction.account_id, func.count())
            .where(condition)
            .group_by(Transaction.account_id)
            .order_by(Transaction.account_id)
        ).all()
        if not rows:
            continue
        total = sum(count for _, count in rows)
        findings.append(
            Finding(
                check=name,
                severity="warning",
                count=total,
                summary=f"{total} {text}",
                details=tuple(
                    {"account_id": str(account_id), "rows": count} for account_id, count in rows
                ),
            )
        )
    return findings


def run_checks(session: Session, *, now: datetime | None = None) -> QualityReport:
    now = now or datetime.now(UTC)
    report = QualityReport(
        generated_at=now,
        accounts=session.scalar(select(func.count()).select_from(Account)) or 0,
        transactions=session.scalar(select(func.count()).select_from(Transaction)) or 0,
        sync_runs=session.scalar(select(func.count()).select_from(SyncRun)) or 0,
    )
    single = (
        possible_duplicates(session),
        missing_external_ids(session),
        accounts_without_transactions(session),
    )
    report.findings.extend(finding for finding in single if finding is not None)
    report.findings.extend(sync_gaps(session, now))
    report.findings.extend(invalid_values(session, now.date()))
    return report


def render(report: QualityReport) -> str:
    """Plain-text report: counts and metadata only."""
    lines = [
        f"Data quality report ({report.generated_at:%Y-%m-%d %H:%M} UTC)",
        f"Checked {report.accounts} account(s), {report.transactions} transaction(s) "
        f"and {report.sync_runs} sync run(s). Nothing was modified.",
    ]
    if report.clean:
        lines.append("No findings.")
        return "\n".join(lines)
    lines.append(f"{len(report.findings)} finding(s):")
    for finding in report.findings:
        lines.append(f"  [{finding.severity}] {finding.check}: {finding.summary}")
        for detail in finding.details:
            lines.append("      " + ", ".join(f"{key}={value}" for key, value in detail.items()))
    return "\n".join(lines)

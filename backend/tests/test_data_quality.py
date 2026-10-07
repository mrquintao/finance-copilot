from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import func, select

from app.db.models import Account, SyncRun, Transaction
from app.quality.checks import render, run_checks

NOW = datetime(2026, 10, 7, 12, tzinfo=UTC)
SENSITIVE = ("PADARIA SEGREDO", "Loja Sigilosa", "1234.56", "secret-item", "secret-account")


def pluggy_account(name: str, item: str = "secret-item-1") -> Account:
    return Account(
        name=name,
        institution="MeuPluggy",
        provider="pluggy",
        provider_item_id=item,
        provider_account_id=f"secret-account-{name}",
    )


def tx(account: Account, external_id: str | None, day: str, amount: str = "1234.56", **extra):
    values = {
        "description": "PADARIA SEGREDO",
        "merchant": "Loja Sigilosa",
        "type": "debit",
        **extra,
    }
    return Transaction(
        external_id=external_id,
        account=account,
        date=date.fromisoformat(day),
        amount=Decimal(amount),
        currency="BRL",
        **values,
    )


def success(item: str, days_ago: float) -> SyncRun:
    started = NOW - timedelta(days=days_ago)
    return SyncRun(
        provider="pluggy",
        item_id=item,
        status="succeeded",
        started_at=started,
        finished_at=started + timedelta(seconds=5),
    )


def findings(session) -> dict:
    return {finding.check: finding for finding in run_checks(session, now=NOW).findings}


def snapshot(session) -> tuple[int, int, int]:
    return tuple(
        session.scalar(select(func.count()).select_from(model))
        for model in (Account, Transaction, SyncRun)
    )


def test_empty_database_is_clean(session):
    report = run_checks(session, now=NOW)

    assert report.clean
    assert (report.accounts, report.transactions, report.sync_runs) == (0, 0, 0)
    assert render(report).endswith("No findings.")


def test_healthy_data_has_no_findings(session):
    account = pluggy_account("Conta")
    session.add_all(
        [
            account,
            tx(account, "a", "2026-10-01"),
            tx(account, "b", "2026-10-02"),
            tx(account, "c", "2026-10-02", amount="10.00"),
            success("secret-item-1", 10),
            success("secret-item-1", 4),
            success("secret-item-1", 0.5),
        ]
    )
    session.flush()

    assert run_checks(session, now=NOW).clean


def test_possible_duplicates_are_counted_per_account(session):
    first = pluggy_account("Conta")
    second = pluggy_account("Cartão")
    session.add_all(
        [
            first,
            second,
            # Three identical rows: one original and two repeats.
            tx(first, "a", "2026-10-01"),
            tx(first, "b", "2026-10-01"),
            tx(first, "c", "2026-10-01", description="  padaria segredo "),
            # A second group in the same account.
            tx(first, "d", "2026-10-03", amount="5.00"),
            tx(first, "e", "2026-10-03", amount="5.00"),
            # Not duplicates: different date, amount, type or account.
            tx(first, "f", "2026-10-02"),
            tx(first, "g", "2026-10-01", amount="1234.57"),
            tx(first, "h", "2026-10-01", type="credit"),
            tx(second, "i", "2026-10-01"),
            success("secret-item-1", 1),
        ]
    )
    session.flush()

    finding = findings(session)["possible_duplicates"]

    assert finding.count == 3
    assert finding.details == ({"account_id": str(first.id), "groups": 2, "repeated_rows": 3},)


def test_imported_transactions_without_external_id(session):
    imported = pluggy_account("Conta")
    local = Account(name="Carteira", institution="Dinheiro")
    session.add_all(
        [
            imported,
            local,
            tx(imported, None, "2026-10-01"),
            tx(imported, "a", "2026-10-02"),
            tx(local, None, "2026-10-01"),  # local accounts have no external ids by nature
            success("secret-item-1", 1),
        ]
    )
    session.flush()

    assert findings(session)["missing_external_ids"].count == 1


def test_sync_gaps(session):
    session.add_all(
        [
            # Item 1: healthy now, but once silent for 20 days.
            success("secret-item-1", 30),
            success("secret-item-1", 10),
            success("secret-item-1", 5),
            success("secret-item-1", 1),
            # Item 2: last success 9 days ago, and a failure since.
            success("secret-item-2", 12),
            success("secret-item-2", 9),
            SyncRun(
                provider="pluggy",
                item_id="secret-item-2",
                status="failed",
                started_at=NOW - timedelta(days=1),
                error="Pluggy service unavailable (503).",
            ),
            # Item 3: never succeeded.
            SyncRun(
                provider="pluggy",
                item_id="secret-item-3",
                status="failed",
                started_at=NOW - timedelta(days=2),
            ),
        ]
    )
    session.flush()

    found = findings(session)

    assert found["historical_sync_gap"].details == ({"item": "item 1", "longest_gap_days": 20},)
    assert found["historical_sync_gap"].severity == "info"
    assert found["stale_synchronization"].details == (
        {"item": "item 2", "days_since_last_success": 9},
    )
    assert found["item_never_synchronized"].details == ({"item": "item 3"},)


def test_a_gap_of_exactly_the_limit_is_not_reported(session):
    session.add_all([success("secret-item-1", 14), success("secret-item-1", 7)])
    session.flush()

    assert run_checks(session, now=NOW).clean


def test_empty_imported_account_after_a_successful_sync(session):
    empty = pluggy_account("Conta vazia")
    full = pluggy_account("Conta com dados")
    not_synced = pluggy_account("Conta de item sem sucesso", item="secret-item-2")
    local = Account(name="Carteira", institution="Dinheiro")
    session.add_all(
        [
            empty,
            full,
            not_synced,
            local,
            tx(full, "a", "2026-10-01"),
            success("secret-item-1", 1),
            SyncRun(
                provider="pluggy",
                item_id="secret-item-2",
                status="failed",
                started_at=NOW - timedelta(days=1),
            ),
        ]
    )
    session.flush()

    finding = findings(session)["account_without_transactions"]

    # Empty local accounts and accounts whose item never synchronized are not suspicious.
    assert finding.details == ({"account_id": str(empty.id)},)


def test_invalid_values_and_dates_are_flagged(session):
    account = pluggy_account("Conta")
    session.add_all(
        [
            account,
            tx(account, "zero", "2026-10-01", amount="0.00"),
            tx(account, "future", "2026-10-20", amount="2.00"),
            tx(account, "tomorrow", "2026-10-08", amount="3.00"),  # within tolerance
            tx(account, "old", "1999-12-31", amount="4.00"),
            tx(account, "oldest-ok", "2000-01-01", amount="5.00"),
            tx(account, "blank", "2026-10-02", amount="6.00", description="   "),
            success("secret-item-1", 1),
        ]
    )
    session.flush()

    found = findings(session)

    for check in ("zero_amount", "future_date", "implausibly_old_date", "blank_description"):
        assert found[check].count == 1, check
        assert found[check].details == ({"account_id": str(account.id), "rows": 1},)


def test_report_contains_only_counts_and_metadata(session):
    account = pluggy_account("Conta")
    session.add_all(
        [
            account,
            tx(account, "a", "2026-10-01"),
            tx(account, "b", "2026-10-01"),
            tx(account, None, "2026-12-31", amount="0.00"),
            SyncRun(
                provider="pluggy",
                item_id="secret-item-1",
                status="failed",
                started_at=NOW - timedelta(days=1),
                error="Pluggy service unavailable (503).",
            ),
        ]
    )
    session.flush()

    report = run_checks(session, now=NOW)
    text = render(report)

    assert len(report.findings) >= 4
    for value in SENSITIVE:
        assert value not in text
        assert value not in repr(report)
    assert "Nothing was modified." in text
    assert str(account.id) in text


def test_checks_never_modify_data(session):
    account = pluggy_account("Conta")
    session.add_all(
        [
            account,
            tx(account, "a", "2026-10-01"),
            tx(account, "b", "2026-10-01"),
            tx(account, "zero", "2030-01-01", amount="0.00"),
            success("secret-item-1", 30),
        ]
    )
    session.flush()
    before = snapshot(session)

    assert not run_checks(session, now=NOW).clean
    session.expire_all()

    assert snapshot(session) == before
    assert not session.dirty and not session.new and not session.deleted


@pytest.mark.parametrize("flag", ["warning", "info"])
def test_render_lists_each_finding_with_its_severity(session, flag):
    session.add_all([success("secret-item-1", 30), success("secret-item-1", 1)])
    if flag == "warning":
        session.add(
            SyncRun(
                provider="pluggy",
                item_id="secret-item-2",
                status="failed",
                started_at=NOW - timedelta(days=1),
            )
        )
    session.flush()

    text = render(run_checks(session, now=NOW))

    assert f"[{flag}]" in text

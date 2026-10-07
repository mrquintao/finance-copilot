"""Sync history: filtering, per-item account names and safe error classification."""

import logging
from datetime import UTC, datetime

import httpx
import pytest

from app.db.models import Account, SyncRun
from app.integrations.open_finance.pluggy import PluggyProvider
from app.sync.diagnostics import classify_error
from tests.test_sync import API_KEY, CLIENT_SECRET, ITEM, FakePluggy, account, transaction


def at(hour: int) -> datetime:
    return datetime(2026, 9, 30, hour, tzinfo=UTC)


@pytest.fixture
def pluggy(monkeypatch) -> FakePluggy:
    fake = FakePluggy()
    monkeypatch.setattr("app.sync.router.provider", fake.provider)
    return fake


@pytest.fixture
def history(session):
    session.add_all(
        [
            Account(
                name="Conta corrente",
                institution="MeuPluggy",
                provider="pluggy",
                provider_item_id="item-a",
                provider_account_id="acc-1",
            ),
            Account(
                name="Cartão",
                institution="MeuPluggy",
                provider="pluggy",
                provider_item_id="item-a",
                provider_account_id="acc-2",
            ),
            Account(name="Carteira", institution="Dinheiro"),
        ]
    )
    rows = [
        ("item-a", "succeeded", 8, 9, None),
        ("item-a", "failed", 10, 11, "Pluggy service unavailable (503)."),
        ("item-b", "failed", 12, 13, "Pluggy is unreachable."),
        ("item-a", "succeeded", 14, 15, None),
        ("item-b", "running", 16, None, None),
    ]
    session.add_all(
        SyncRun(
            provider="pluggy",
            item_id=item_id,
            status=status,
            started_at=at(start),
            finished_at=at(end) if end else None,
            error=error,
            accounts_received=2,
            transactions_received=10,
            transactions_created=4,
            transactions_updated=6,
        )
        for item_id, status, start, end, error in rows
    )
    session.flush()


def runs(client, **params) -> list[dict]:
    response = client.get("/sync/runs", params=params)
    assert response.status_code == 200, response.text
    return response.json()["items"]


def test_history_lists_runs_newest_first_with_times_counts_and_accounts(client, history):
    items = runs(client)

    assert [item["started_at"] for item in items] == sorted(
        (item["started_at"] for item in items), reverse=True
    )
    assert [(item["item_id"], item["status"]) for item in items] == [
        ("item-b", "running"),
        ("item-a", "succeeded"),
        ("item-b", "failed"),
        ("item-a", "failed"),
        ("item-a", "succeeded"),
    ]
    latest_success = items[1]
    assert latest_success["started_at"] == "2026-09-30T14:00:00Z"
    assert latest_success["finished_at"] == "2026-09-30T15:00:00Z"
    assert latest_success["accounts"] == ["Cartão", "Conta corrente"]
    assert latest_success["error"] is None
    assert latest_success["error_kind"] is None
    assert (
        latest_success["accounts_received"],
        latest_success["transactions_received"],
        latest_success["transactions_created"],
        latest_success["transactions_updated"],
    ) == (2, 10, 4, 6)
    # An item whose accounts were never imported has no names to show.
    assert items[0]["accounts"] == []
    assert items[0]["finished_at"] is None
    assert items[0]["error_kind"] is None


@pytest.mark.parametrize(
    ("status", "expected"),
    [("succeeded", 2), ("failed", 2), ("running", 1)],
)
def test_history_filters_by_status(client, history, status, expected):
    items = runs(client, status=status)

    assert len(items) == expected
    assert {item["status"] for item in items} == {status}


def test_history_filters_by_item_and_combines_with_status(client, history):
    assert {item["item_id"] for item in runs(client, item_id="item-a")} == {"item-a"}
    assert len(runs(client, item_id="item-a")) == 3
    failed = runs(client, item_id="item-a", status="failed")
    assert [(item["error"], item["error_kind"]) for item in failed] == [
        ("Pluggy service unavailable (503).", "provider")
    ]
    assert runs(client, item_id="unknown") == []


def test_failed_runs_are_classified(client, history):
    kinds = {item["error"]: item["error_kind"] for item in runs(client, status="failed")}

    assert kinds == {
        "Pluggy service unavailable (503).": "provider",
        "Pluggy is unreachable.": "network",
    }


@pytest.mark.parametrize("params", [{"status": "ok"}, {"item_id": ""}, {"item_id": "x" * 101}])
def test_invalid_history_filters_are_rejected(client, params):
    assert client.get("/sync/runs", params=params).status_code == 422


@pytest.mark.parametrize(
    ("error", "kind"),
    [
        (None, None),
        ("", None),
        ("Pluggy is unreachable.", "network"),
        ("Open Finance provider is unreachable.", "network"),
        ("Pluggy rejected the client credentials (401).", "provider"),
        ("Pluggy authentication failed (401).", "provider"),
        ("Pluggy request forbidden (403, CLIENT_NOT_ALLOWED).", "provider"),
        ("Pluggy resource not found (404, ITEM_NOT_FOUND).", "provider"),
        ("Pluggy rate limit exceeded (429).", "provider"),
        ("Pluggy service unavailable (503).", "provider"),
        ("Pluggy request failed (400).", "provider"),
        ("Pluggy request failed.", "provider"),
        # Messages stored before the adapter named Pluggy explicitly.
        ("Open Finance provider request failed (403).", "provider"),
        ("Provider returned invalid JSON.", "validation"),
        ("Provider returned an invalid accounts response.", "validation"),
        ("Provider returned unsupported monetary precision.", "validation"),
        ("Provider returned an invalid transaction date.", "validation"),
        ("Provider authentication returned an invalid response.", "validation"),
        ("Synchronization failed (IntegrityError).", "database"),
        ("Synchronization failed (OperationalError).", "database"),
        ("Synchronization failed (DataError).", "database"),
        ("Synchronization failed (ValueError).", "validation"),
        ("Synchronization failed (ReadTimeout).", "network"),
        ("Synchronization failed (KeyError).", "unknown"),
        ("something this app never wrote", "unknown"),
    ],
)
def test_classify_error(error, kind):
    assert classify_error(error) == kind


def test_a_real_provider_failure_is_recorded_classified_and_safe(client, pluggy, caplog):
    pluggy.add_item(ITEM, [account("acc-1", "Conta")])
    leaky = {"codeDescription": "CLIENT_NOT_ALLOWED", "message": f"key {API_KEY} saldo 1234.56"}
    pluggy.queue("/accounts", httpx.Response(403, json=leaky))

    with caplog.at_level(logging.DEBUG):
        assert client.post("/sync", json={"item_id": ITEM}).status_code == 502
    failed = runs(client, status="failed")

    assert [(item["error"], item["error_kind"]) for item in failed] == [
        ("Pluggy request forbidden (403, CLIENT_NOT_ALLOWED).", "provider")
    ]
    assert failed[0]["finished_at"] is not None
    exposed = client.get("/sync/runs").text + caplog.text
    for secret in (API_KEY, CLIENT_SECRET, "1234.56"):
        assert secret not in exposed


def test_a_network_failure_is_classified_as_network(client, monkeypatch):
    fake = FakePluggy()

    def refuse(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused", request=request)

    monkeypatch.setattr(
        "app.sync.router.provider",
        lambda: PluggyProvider(
            client_id="client-id",
            client_secret=CLIENT_SECRET,
            transport=httpx.MockTransport(refuse),
            sleep=fake.sleep,
        ),
    )

    assert client.post("/sync", json={"item_id": ITEM}).status_code == 502

    assert [(item["error"], item["error_kind"]) for item in runs(client)] == [
        ("Pluggy is unreachable.", "network")
    ]


def test_rejected_provider_data_is_classified_as_validation(client, pluggy):
    pluggy.add_item(ITEM, [account("acc-1", "Conta")])
    pluggy.pages["acc-1"] = [[transaction("t1", "10.123")]]

    assert client.post("/sync", json={"item_id": ITEM}).status_code == 502

    assert [(item["error"], item["error_kind"]) for item in runs(client)] == [
        ("Provider returned unsupported monetary precision.", "validation")
    ]


def test_sync_response_includes_account_names_and_no_error_kind(client, pluggy):
    pluggy.add_item(ITEM, [account("acc-1", "Conta corrente"), account("acc-2", "Cartão")])

    run = client.post("/sync", json={"item_id": ITEM}).json()

    assert run["status"] == "succeeded"
    assert run["accounts"] == ["Cartão", "Conta corrente"]
    assert run["error_kind"] is None
    refreshed = client.post("/sync/refresh").json()["items"]
    assert [item["accounts"] for item in refreshed] == [["Cartão", "Conta corrente"]]

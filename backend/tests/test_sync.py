"""Pluggy synchronization, exercised through the HTTP API against a fake Pluggy server.

No test here reaches the network: the provider is always built on an httpx.MockTransport.
"""

import json
import logging
from decimal import Decimal

import httpx
import pytest
from sqlalchemy import func, select

from app.db.models import Account, SyncRun, Transaction
from app.integrations.open_finance.pluggy import PluggyProvider

CLIENT_SECRET = "client-secret-do-not-leak"
API_KEY = "api-key-do-not-leak"
CONNECT_TOKEN = "connect-token-do-not-leak"
ITEM = "11111111-1111-4111-8111-111111111111"
OTHER_ITEM = "22222222-2222-4222-8222-222222222222"


def account(account_id: str, name: str, *, currency: str = "BRL", provider_id: str | None = None):
    return {
        "id": account_id,
        "providerId": provider_id,
        "name": name,
        "marketingName": None,
        "currencyCode": currency,
        "type": "BANK",
    }


def transaction(
    transaction_id: str,
    amount: str,
    *,
    kind: str = "DEBIT",
    status: str = "POSTED",
    day: str = "2026-09-10T15:00:00.000Z",
    description: str = "Compra teste",
    category: str | None = None,
):
    return {
        "id": transaction_id,
        "providerId": None,
        "description": description,
        "amount": json.loads(amount),
        "currencyCode": "BRL",
        "date": day,
        "type": kind,
        "status": status,
        "category": category,
    }


class FakePluggy:
    """In-memory stand-in for api.pluggy.ai, limited to the endpoints the adapter calls."""

    def __init__(self) -> None:
        self.items: dict[str, dict] = {}
        self.accounts: dict[str, list[dict]] = {}
        # account id -> pages of transactions; page N is reached through the "after" cursor.
        self.pages: dict[str, list[list[dict]]] = {}
        # path -> queued responses that are served before the normal behavior.
        self.queued: dict[str, list[httpx.Response]] = {}
        self.calls: list[tuple[str, str]] = []
        self.requests: list[httpx.Request] = []
        self.sleeps: list[float] = []

    def add_item(self, item_id: str, accounts: list[dict], connector: str = "MeuPluggy") -> None:
        self.items[item_id] = {
            "id": item_id,
            "status": "UPDATED",
            "connector": {"id": 200, "name": connector},
        }
        self.accounts[item_id] = accounts

    def queue(self, path: str, *responses: httpx.Response) -> None:
        self.queued.setdefault(path, []).extend(responses)

    def count(self, path: str) -> int:
        return sum(1 for _, called in self.calls if called == path)

    async def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)

    def provider(self) -> PluggyProvider:
        return PluggyProvider(
            client_id="client-id",
            client_secret=CLIENT_SECRET,
            base_url="https://pluggy.test",
            transport=httpx.MockTransport(self),
            sleep=self.sleep,
        )

    def __call__(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path
        self.calls.append((request.method, path))
        self.requests.append(request)
        if self.queued.get(path):
            return self.queued[path].pop(0)

        if path == "/auth":
            body = json.loads(request.content)
            assert body == {"clientId": "client-id", "clientSecret": CLIENT_SECRET}
            return httpx.Response(200, json={"apiKey": API_KEY})

        assert request.headers["X-API-KEY"] == API_KEY
        if path == "/connect_token":
            return httpx.Response(200, json={"accessToken": CONNECT_TOKEN})
        if path.startswith("/items/"):
            item = self.items.get(path.removeprefix("/items/"))
            if item is None:
                return httpx.Response(
                    404, json={"code": 404, "message": "x", "codeDescription": "ITEM_NOT_FOUND"}
                )
            return httpx.Response(200, json=item)
        if path == "/accounts":
            rows = self.accounts[request.url.params["itemId"]]
            return httpx.Response(200, json={"total": len(rows), "results": rows})
        if path == "/v2/transactions":
            pages = self.pages.get(request.url.params["accountId"], [[]])
            index = int(request.url.params.get("after", "0"))
            payload: dict = {"results": pages[index]}
            if index + 1 < len(pages):
                payload["next"] = f"https://pluggy.test/v2/transactions?after={index + 1}"
            # Serialized by hand so amounts stay exact decimals on the wire.
            return httpx.Response(200, text=json.dumps(payload))
        raise AssertionError(f"Unexpected Pluggy call: {request.method} {path}")


@pytest.fixture
def pluggy(monkeypatch) -> FakePluggy:
    fake = FakePluggy()
    monkeypatch.setattr("app.sync.router.provider", fake.provider)
    return fake


@pytest.fixture
def meu_pluggy_item(pluggy) -> FakePluggy:
    """One MeuPluggy item aggregating accounts from three institutions, one of them not BRL."""
    pluggy.add_item(
        ITEM,
        [
            account("acc-nubank", "Nubank Conta"),
            account("acc-itau", "Itaú Corrente", provider_id="itau-stable-id"),
            account("acc-usd", "Conta Global", currency="USD"),
        ],
    )
    pluggy.pages["acc-nubank"] = [
        [
            transaction("n1", "37.90", category="Transport", description="UBER *TRIP"),
            transaction("n2", "8150.00", kind="CREDIT", description="SALARIO"),
        ],
        [
            transaction("n3", "0.10"),
            transaction("n4", "12.00", status="PENDING"),
        ],
    ]
    pluggy.pages["acc-itau"] = [
        # 02:30 UTC on the 8th is still the 7th in São Paulo.
        [transaction("i1", "1234567890.12", day="2026-09-08T02:30:00.000Z")],
    ]
    pluggy.pages["acc-usd"] = [[transaction("u1", "5.00")]]
    return pluggy


def sync(client, item_id: str = ITEM):
    return client.post("/sync", json={"item_id": item_id})


def test_connect_token_is_created_with_server_side_credentials(client, pluggy):
    response = client.post("/sync/connect-token", json={})

    assert response.status_code == 200
    assert response.json() == {"connect_token": CONNECT_TOKEN}
    assert pluggy.calls == [("POST", "/auth"), ("POST", "/connect_token")]
    assert json.loads(pluggy.requests[1].content) == {"options": {"avoidDuplicates": True}}


def test_connect_token_for_an_existing_item_requests_update_mode(client, pluggy):
    client.post("/sync/connect-token", json={"item_id": ITEM})

    assert json.loads(pluggy.requests[1].content)["itemId"] == ITEM


@pytest.mark.parametrize("route", ["/sync/connect-token", "/sync", "/sync/refresh"])
def test_missing_pluggy_configuration_returns_503(client, monkeypatch, route):
    # Empty values win over the developer's .env, so this never uses real credentials.
    monkeypatch.setenv("PLUGGY_CLIENT_ID", "")
    monkeypatch.setenv("PLUGGY_CLIENT_SECRET", "")

    response = client.post(route, json={"item_id": ITEM})

    assert response.status_code == 503
    assert response.json() == {"detail": "Open Finance provider is not configured."}


def test_meu_pluggy_item_imports_every_brl_account_and_posted_transaction(
    client, session, meu_pluggy_item
):
    response = sync(client)

    assert response.status_code == 200
    run = response.json()
    assert run["status"] == "succeeded"
    assert run["item_id"] == ITEM
    assert run["accounts_received"] == 3
    assert run["transactions_received"] == 4
    assert run["transactions_created"] == 4
    assert run["transactions_updated"] == 0
    assert run["error"] is None

    accounts = {a.name: a for a in session.scalars(select(Account))}
    assert set(accounts) == {"Nubank Conta", "Itaú Corrente"}
    assert {a.provider_item_id for a in accounts.values()} == {ITEM}
    assert {a.institution for a in accounts.values()} == {"MeuPluggy"}
    # The provider's stable id is preferred; Pluggy's own id is the fallback.
    assert accounts["Itaú Corrente"].provider_account_id == "itau-stable-id"
    assert accounts["Nubank Conta"].provider_account_id == "acc-nubank"

    rows = {t.external_id: t for t in session.scalars(select(Transaction))}
    assert set(rows) == {"n1", "n2", "n3", "i1"}  # PENDING and non-BRL are left out
    assert rows["n1"].amount == Decimal("37.90")
    assert rows["n1"].type == "debit"
    assert rows["n1"].category.name == "Transporte"
    assert rows["n2"].type == "credit"
    assert rows["n2"].category.name == "Receita"
    assert rows["n3"].amount == Decimal("0.10")
    assert rows["i1"].amount == Decimal("1234567890.12")
    assert rows["i1"].date.isoformat() == "2026-09-07"
    assert rows["i1"].account_id == accounts["Itaú Corrente"].id

    # The imported data is what the dashboard reads.
    summary = client.get(
        "/analytics/spending-summary", params={"start_date": "2026-09-01", "end_date": "2026-09-30"}
    ).json()
    assert summary["total_spending"] == "1234567928.12"
    assert summary["total_income"] == "8150.00"
    assert summary["transaction_count"] == 4


def test_syncing_again_updates_in_place_without_duplicates(client, session, meu_pluggy_item):
    sync(client)
    meu_pluggy_item.pages["acc-nubank"][0][0]["amount"] = json.loads("40.00")
    meu_pluggy_item.pages["acc-nubank"][1].append(transaction("n5", "9.99"))

    run = sync(client).json()

    assert run["transactions_received"] == 5
    assert run["transactions_created"] == 1
    assert run["transactions_updated"] == 4
    assert session.scalar(select(func.count()).select_from(Account)) == 2
    assert session.scalar(select(func.count()).select_from(Transaction)) == 5
    session.expire_all()
    updated = session.scalar(select(Transaction).where(Transaction.external_id == "n1"))
    assert updated.amount == Decimal("40.00")


def test_refresh_reuses_known_items_without_a_new_connection(client, session, meu_pluggy_item):
    sync(client)
    first_calls = len(meu_pluggy_item.calls)

    response = client.post("/sync/refresh")

    assert response.status_code == 200
    runs = response.json()["items"]
    assert [run["item_id"] for run in runs] == [ITEM]
    assert runs[0]["status"] == "succeeded"
    assert runs[0]["transactions_created"] == 0
    assert runs[0]["transactions_updated"] == 4
    refresh_calls = meu_pluggy_item.calls[first_calls:]
    assert ("GET", f"/items/{ITEM}") in refresh_calls
    assert ("POST", "/connect_token") not in refresh_calls
    assert session.scalar(select(func.count()).select_from(Account)) == 2
    assert session.scalar(select(func.count()).select_from(Transaction)) == 4


def test_refresh_without_any_known_item_does_nothing(client, pluggy):
    response = client.post("/sync/refresh")

    assert response.json() == {"items": []}
    assert pluggy.calls == []


def test_refresh_retries_an_item_whose_first_sync_failed(client, session, meu_pluggy_item):
    meu_pluggy_item.queue("/accounts", *[httpx.Response(503)] * 3)
    assert sync(client).status_code == 502

    runs = client.post("/sync/refresh").json()["items"]

    assert [(run["item_id"], run["status"]) for run in runs] == [(ITEM, "succeeded")]
    assert session.scalar(select(func.count()).select_from(Transaction)) == 4


def test_refresh_keeps_going_when_one_item_fails(client, session, meu_pluggy_item):
    sync(client)
    sync(client, OTHER_ITEM)  # unknown to Pluggy: recorded as a failed run

    response = client.post("/sync/refresh")

    assert response.status_code == 200
    by_item = {run["item_id"]: run for run in response.json()["items"]}
    assert by_item[ITEM]["status"] == "succeeded"
    assert by_item[OTHER_ITEM]["status"] == "failed"
    assert by_item[OTHER_ITEM]["error"] == "Pluggy resource not found (404, ITEM_NOT_FOUND)."


def test_expired_api_key_is_renewed_once(client, meu_pluggy_item):
    meu_pluggy_item.queue(f"/items/{ITEM}", httpx.Response(401))

    assert sync(client).status_code == 200
    assert meu_pluggy_item.count("/auth") == 2
    assert meu_pluggy_item.count(f"/items/{ITEM}") == 2


@pytest.mark.parametrize("status", [429, 500, 503])
def test_transient_failure_is_retried(client, meu_pluggy_item, status):
    meu_pluggy_item.queue("/accounts", httpx.Response(status))

    assert sync(client).status_code == 200
    assert meu_pluggy_item.count("/accounts") == 2
    assert meu_pluggy_item.sleeps == [0.5]


@pytest.mark.parametrize(
    ("status", "message"),
    [
        (429, "Pluggy rate limit exceeded (429)."),
        (503, "Pluggy service unavailable (503)."),
    ],
)
def test_persistent_failure_stops_after_three_attempts(
    client, session, meu_pluggy_item, status, message
):
    meu_pluggy_item.queue("/accounts", *[httpx.Response(status)] * 10)

    response = sync(client)

    assert response.status_code == 502
    assert response.json() == {"detail": message}
    assert meu_pluggy_item.count("/accounts") == 3
    assert meu_pluggy_item.sleeps == [0.5, 1.0]
    run = session.scalar(select(SyncRun))
    assert (run.status, run.error) == ("failed", message)
    assert run.finished_at is not None
    assert session.scalar(select(func.count()).select_from(Transaction)) == 0


@pytest.mark.parametrize(
    ("path", "status", "message"),
    [
        ("/auth", 401, "Pluggy rejected the client credentials (401)."),
        ("/auth", 403, "Pluggy rejected the client credentials (403)."),
        ("/connect_token", 403, "Pluggy request forbidden (403)."),
        ("/connect_token", 400, "Pluggy request failed (400)."),
    ],
)
def test_connect_token_failures_are_described_by_status(client, pluggy, path, status, message):
    pluggy.queue(path, *[httpx.Response(status)] * 3)

    response = client.post("/sync/connect-token", json={})

    assert response.status_code == 502
    assert response.json() == {"detail": message}


def test_provider_errors_never_expose_secrets_or_response_bodies(
    client, session, meu_pluggy_item, caplog
):
    leaky = {
        "code": 403,
        "codeDescription": "CLIENT_NOT_ALLOWED",
        "message": f"key {API_KEY} secret {CLIENT_SECRET} saldo 1234.56 CPF 123.456.789-00",
    }
    meu_pluggy_item.queue("/accounts", httpx.Response(403, json=leaky))

    with caplog.at_level(logging.DEBUG):
        response = sync(client)

    assert response.json() == {"detail": "Pluggy request forbidden (403, CLIENT_NOT_ALLOWED)."}
    exposed = response.text + caplog.text + (session.scalar(select(SyncRun.error)) or "")
    for secret in (API_KEY, CLIENT_SECRET, CONNECT_TOKEN, "1234.56", "123.456.789-00"):
        assert secret not in exposed
    assert "Pluggy request forbidden (403, CLIENT_NOT_ALLOWED)." in caplog.text


def test_error_code_is_dropped_unless_it_is_a_plain_constant(client, meu_pluggy_item):
    body = {"codeDescription": f"leaked {CLIENT_SECRET}"}
    meu_pluggy_item.queue("/accounts", httpx.Response(403, json=body))

    assert sync(client).json() == {"detail": "Pluggy request forbidden (403)."}


def test_item_id_cannot_address_another_pluggy_endpoint(client, pluggy):
    response = sync(client, "../auth?x=1")

    assert response.status_code == 502
    assert pluggy.requests[-1].url.raw_path == b"/items/..%2Fauth%3Fx%3D1"


def test_unreachable_pluggy_is_reported_without_details(client, monkeypatch):
    fake = FakePluggy()

    def refuse(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused to 10.0.0.1", request=request)

    monkeypatch.setattr(
        "app.sync.router.provider",
        lambda: PluggyProvider(
            client_id="client-id",
            client_secret=CLIENT_SECRET,
            transport=httpx.MockTransport(refuse),
            sleep=fake.sleep,
        ),
    )

    response = client.post("/sync/connect-token", json={})

    assert response.status_code == 502
    assert response.json() == {"detail": "Pluggy is unreachable."}
    assert fake.sleeps == [0.5, 1.0]

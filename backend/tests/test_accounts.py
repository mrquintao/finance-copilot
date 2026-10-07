from datetime import UTC, date, datetime
from decimal import Decimal

from app.db.models import Account, SyncRun, Transaction


def at(hour: int) -> datetime:
    return datetime(2026, 9, 30, hour, tzinfo=UTC)


def add_transactions(session, account: Account, *days: str) -> None:
    session.add_all(
        Transaction(
            external_id=f"{account.name}-{day}",
            account=account,
            date=date.fromisoformat(day),
            description="Compra teste",
            amount=Decimal("10.00"),
            currency="BRL",
            type="debit",
        )
        for day in days
    )


def pluggy_account(name: str, institution: str, item: str) -> Account:
    return Account(
        name=name,
        institution=institution,
        provider="pluggy",
        provider_item_id=item,
        provider_account_id=f"secret-account-id-{name}",
    )


def test_no_accounts(client):
    assert client.get("/accounts").json() == {"total": 0, "groups": []}


def test_accounts_are_grouped_by_institution_with_activity_and_sync_state(client, session):
    checking = pluggy_account("Conta corrente", "MeuPluggy", "secret-item-1")
    card = pluggy_account("Cartão", "MeuPluggy", "secret-item-1")
    broken = pluggy_account("Conta antiga", "Banco Fake", "secret-item-2")
    pending = pluggy_account("Conta nova", "Banco Fake", "secret-item-3")
    wallet = Account(name="Carteira", institution="Dinheiro")
    session.add_all([checking, card, broken, pending, wallet])
    add_transactions(session, checking, "2026-09-01", "2026-09-28", "2026-09-10")
    add_transactions(session, wallet, "2026-08-15")
    session.add_all(
        [
            SyncRun(
                provider="pluggy",
                item_id="secret-item-1",
                status="succeeded",
                started_at=at(8),
                finished_at=at(9),
            ),
            SyncRun(
                provider="pluggy",
                item_id="secret-item-1",
                status="succeeded",
                started_at=at(12),
                finished_at=at(13),
            ),
            SyncRun(
                provider="pluggy",
                item_id="secret-item-2",
                status="succeeded",
                started_at=at(7),
                finished_at=at(8),
            ),
            SyncRun(
                provider="pluggy",
                item_id="secret-item-2",
                status="failed",
                started_at=at(14),
                finished_at=at(15),
                error="Pluggy service unavailable (503).",
            ),
        ]
    )
    session.flush()

    response = client.get("/accounts")

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 5
    assert [group["institution"] for group in body["groups"]] == [
        "Banco Fake",
        "Dinheiro",
        "MeuPluggy",
    ]
    by_name = {a["name"]: a for group in body["groups"] for a in group["accounts"]}
    assert [a["name"] for a in body["groups"][2]["accounts"]] == ["Cartão", "Conta corrente"]

    assert by_name["Conta corrente"] == {
        "id": str(checking.id),
        "name": "Conta corrente",
        "institution": "MeuPluggy",
        "currency": "BRL",
        "provider": "pluggy",
        "connection": "connected",
        "last_sync": {
            "status": "succeeded",
            "started_at": "2026-09-30T12:00:00Z",
            "finished_at": "2026-09-30T13:00:00Z",
        },
        "last_successful_sync_at": "2026-09-30T13:00:00Z",
        "transaction_count": 3,
        "last_transaction_date": "2026-09-28",
    }
    # Both accounts of the same item share its sync state.
    assert by_name["Cartão"]["connection"] == "connected"
    assert by_name["Cartão"]["transaction_count"] == 0
    assert by_name["Cartão"]["last_transaction_date"] is None

    # The latest run failed, but the last good import is still reported.
    assert by_name["Conta antiga"]["connection"] == "failing"
    assert by_name["Conta antiga"]["last_sync"]["status"] == "failed"
    assert by_name["Conta antiga"]["last_successful_sync_at"] == "2026-09-30T08:00:00Z"

    assert by_name["Conta nova"]["connection"] == "never_synced"
    assert by_name["Conta nova"]["last_sync"] is None
    assert by_name["Conta nova"]["last_successful_sync_at"] is None

    assert by_name["Carteira"]["provider"] is None
    assert by_name["Carteira"]["connection"] == "local"
    assert by_name["Carteira"]["transaction_count"] == 1


def test_running_sync_is_reported(client, session):
    session.add(pluggy_account("Conta", "MeuPluggy", "secret-item-1"))
    session.add(SyncRun(provider="pluggy", item_id="secret-item-1", status="running"))
    session.flush()

    account = client.get("/accounts").json()["groups"][0]["accounts"][0]

    assert account["connection"] == "syncing"
    assert account["last_sync"]["finished_at"] is None


def test_provider_identifiers_and_errors_are_not_exposed(client, session):
    session.add(pluggy_account("Conta", "MeuPluggy", "secret-item-1"))
    session.add(
        SyncRun(
            provider="pluggy",
            item_id="secret-item-1",
            status="failed",
            started_at=at(10),
            error="Pluggy request forbidden (403).",
        )
    )
    session.flush()

    response = client.get("/accounts")

    assert "secret-item" not in response.text
    assert "secret-account-id" not in response.text
    assert "403" not in response.text
    assert "item_id" not in response.text

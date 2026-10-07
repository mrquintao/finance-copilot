from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest

from app.db.models import Account, Category, Transaction


@pytest.fixture
def ledger(session):
    checking = Account(name="Conta corrente", institution="Banco Fake")
    card = Account(name="Cartão", institution="Banco Fake")
    food = Category(name="Alimentação")
    transport = Category(name="Transporte")
    session.add_all([checking, card, food, transport])
    rows = [
        # key, account, day, description, merchant, amount, type, category
        ("uber-1", card, "2026-09-03", "UBER *TRIP", "Uber", "27.90", "debit", transport),
        ("uber-2", card, "2026-09-20", "Uber do Brasil", None, "31.10", "debit", transport),
        ("ifood", card, "2026-09-05", "Pedido", "iFood", "62.45", "debit", food),
        ("uber-eats", checking, "2026-08-10", "UBER EATS", "Uber Eats", "40.00", "debit", food),
        ("salary", checking, "2026-09-01", "SALARIO", None, "8150.00", "credit", None),
        ("refund", card, "2026-09-12", "Estorno Uber", "Uber", "27.90", "credit", transport),
        ("transfer", checking, "2026-09-15", "Transferência", None, "500.00", "transfer", None),
        ("percent", checking, "2026-09-18", "Desconto 100% aplicado", None, "1.00", "debit", None),
        ("underscore", checking, "2026-09-19", "ref_2026", None, "2.00", "debit", None),
        ("plain", checking, "2026-09-21", "ref 2026 total 1000", None, "3.00", "debit", None),
    ]
    session.add_all(
        Transaction(
            external_id=key,
            account=account,
            date=date.fromisoformat(day),
            description=description,
            merchant=merchant,
            amount=Decimal(amount),
            currency="BRL",
            type=kind,
            category=category,
        )
        for key, account, day, description, merchant, amount, kind, category in rows
    )
    session.flush()
    return {"checking": checking, "card": card, "food": food, "transport": transport}


def keys(client, **params) -> set[str]:
    response = client.get("/transactions", params={"limit": 100, **params})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == len(body["items"])
    return {item["external_id"] for item in body["items"]}


def test_search_matches_description_or_merchant_ignoring_case(client, ledger):
    assert keys(client, q="uber") == {"uber-1", "uber-2", "uber-eats", "refund"}
    assert keys(client, q="IFOOD") == {"ifood"}  # merchant only
    assert keys(client, q="salario") == {"salary"}  # description only
    assert keys(client, q="  uber eats ") == {"uber-eats"}
    assert keys(client, q="inexistente") == set()


def test_blank_search_is_ignored(client, ledger):
    assert len(keys(client, q="   ")) == 10
    assert len(keys(client, q="")) == 10


def test_search_text_is_literal_not_a_pattern(client, ledger):
    assert keys(client, q="100%") == {"percent"}
    assert keys(client, q="%") == {"percent"}
    assert keys(client, q="ref_2026") == {"underscore"}
    assert keys(client, q="_") == {"underscore"}
    assert keys(client, q="ref 2026") == {"plain"}
    assert keys(client, q="\\") == set()


def test_filter_by_account(client, ledger):
    assert keys(client, account_id=str(ledger["card"].id)) == {
        "uber-1",
        "uber-2",
        "ifood",
        "refund",
    }
    assert keys(client, account_id=str(uuid4())) == set()


@pytest.mark.parametrize(
    ("kind", "expected"),
    [
        ("credit", {"salary", "refund"}),
        ("transfer", {"transfer"}),
        ("debit", {"uber-1", "uber-2", "ifood", "uber-eats", "percent", "underscore", "plain"}),
    ],
)
def test_filter_by_type(client, ledger, kind, expected):
    assert keys(client, type=kind) == expected


def test_filters_combine_with_and(client, ledger):
    card = str(ledger["card"].id)
    transport = str(ledger["transport"].id)
    september = {"start_date": "2026-09-01", "end_date": "2026-09-30"}

    assert keys(client, q="uber", **september) == {"uber-1", "uber-2", "refund"}
    assert keys(client, q="uber", type="debit", **september) == {"uber-1", "uber-2"}
    assert keys(client, q="uber", category_id=str(ledger["food"].id)) == {"uber-eats"}
    assert keys(client, account_id=card, category_id=transport, type="credit") == {"refund"}
    assert keys(
        client,
        q="uber",
        account_id=card,
        category_id=transport,
        type="debit",
        start_date="2026-09-10",
        end_date="2026-09-30",
    ) == {"uber-2"}
    assert keys(client, account_id=str(ledger["checking"].id), type="credit", q="uber") == set()


def test_pagination_stays_stable_under_filters(client, ledger):
    params = {"type": "debit", "limit": 3}
    pages = [
        client.get("/transactions", params={**params, "offset": offset}).json()
        for offset in (0, 3, 6, 9)
    ]

    assert [page["total"] for page in pages] == [7, 7, 7, 7]
    assert [len(page["items"]) for page in pages] == [3, 3, 1, 0]
    seen = [item["external_id"] for page in pages for item in page["items"]]
    assert len(seen) == len(set(seen)) == 7
    dates = [item["date"] for page in pages for item in page["items"]]
    assert dates == sorted(dates, reverse=True)


@pytest.mark.parametrize(
    "params",
    [
        {"type": "expense"},
        {"account_id": "not-a-uuid"},
        {"q": "x" * 101},
    ],
)
def test_invalid_filters_are_rejected_without_echoing_input(client, params):
    response = client.get("/transactions", params=params)

    assert response.status_code == 422
    assert response.json()["detail"] == "Invalid request parameters."
    assert "x" * 50 not in response.text

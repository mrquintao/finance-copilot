from decimal import Decimal
from uuid import UUID

import pytest
from sqlalchemy.exc import OperationalError

from app.db.session import get_session

MAY = {"start_date": "2026-05-01", "end_date": "2026-05-31"}
PERIOD_ROUTES = ["/transactions", "/analytics/spending-summary", "/analytics/spending-by-category"]


def test_health_checks_database(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}
    assert response.headers["cache-control"] == "no-store"


def test_listing_and_detail(client, records):
    response = client.get("/transactions")
    assert response.status_code == 200
    page = response.json()
    assert (page["total"], page["limit"], page["offset"]) == (8, 50, 0)
    keys = [(row["date"], row["id"]) for row in page["items"]]
    assert keys == sorted(keys, reverse=True)
    for row in page["items"]:
        assert isinstance(row["amount"], str)
        assert row["currency"] == "BRL"
        assert row["created_at"].endswith(("Z", "+00:00", "-03:00"))
        detail = client.get(f"/transactions/{row['id']}")
        assert detail.status_code == 200
        assert detail.json() == row
        assert row["account"]["name"] == "Conta de teste"


def test_missing_transaction(client):
    response = client.get(f"/transactions/{UUID(int=999)}")
    assert response.status_code == 404
    assert response.json() == {"detail": "Transaction not found."}


def test_inclusive_date_filter(client, records):
    page = client.get("/transactions", params=MAY).json()
    assert page["total"] == 6
    assert {row["date"] for row in page["items"]} == {
        "2026-05-01",
        "2026-05-15",
        "2026-05-20",
        "2026-05-21",
        "2026-05-31",
    }
    same_day = client.get(
        "/transactions",
        params={
            "start_date": "2026-05-01",
            "end_date": "2026-05-01",
        },
    ).json()
    assert same_day["total"] == 2
    assert client.get("/transactions", params={"start_date": "2026-06-01"}).json()["total"] == 1
    assert client.get("/transactions", params={"end_date": "2026-04-30"}).json()["total"] == 1


def test_pagination_is_stable_without_gaps(client, records):
    expected = client.get("/transactions").json()["items"]
    actual = []
    for offset in range(0, 8, 2):
        page = client.get("/transactions", params={"limit": 2, "offset": offset}).json()
        assert (page["limit"], page["offset"], page["total"]) == (2, offset, 8)
        actual.extend(page["items"])
    assert actual == expected
    assert client.get("/transactions", params={"offset": 100}).json()["items"] == []


def test_categories_and_category_filter(client, records):
    categories = client.get("/categories")
    assert categories.status_code == 200
    assert [c["name"] for c in categories.json()] == ["Alimentação", "Transporte"]
    result = client.get("/transactions", params={**MAY, "category_id": str(UUID(int=2))}).json()
    assert result["total"] == 3
    assert all(row["category"]["id"] == str(UUID(int=2)) for row in result["items"])
    assert (
        client.get("/transactions", params={"category_id": str(UUID(int=999))}).json()["items"]
        == []
    )


def test_summary_excludes_income_and_transfers_from_spending(client, records):
    response = client.get("/analytics/spending-summary", params=MAY)
    assert response.status_code == 200
    assert response.json() == {
        "currency": "BRL",
        "period_start": "2026-05-01",
        "period_end": "2026-05-31",
        "total_spending": "25.50",
        "total_income": "1000.00",
        "transaction_count": 6,
        "expense_count": 4,
        "income_count": 1,
        "transfer_count": 1,
    }


def test_category_spending_and_precision(client, records):
    response = client.get("/analytics/spending-by-category", params=MAY)
    assert response.status_code == 200
    items = response.json()["items"]
    assert items == [
        {
            "category_id": str(UUID(int=3)),
            "category": "Transporte",
            "amount": "20.15",
            "transaction_count": 1,
        },
        {
            "category_id": None,
            "category": "Sem categoria",
            "amount": "5.05",
            "transaction_count": 1,
        },
        {
            "category_id": str(UUID(int=2)),
            "category": "Alimentação",
            "amount": "0.30",
            "transaction_count": 2,
        },
    ]
    assert sum((Decimal(item["amount"]) for item in items), Decimal("0.00")) == Decimal("25.50")


@pytest.mark.parametrize("period", [{}, {"start_date": "2040-01-01", "end_date": "2040-12-31"}])
def test_empty_database_and_period(client, period):
    assert client.get("/transactions", params=period).json()["items"] == []
    summary = client.get("/analytics/spending-summary", params=period).json()
    assert summary["total_spending"] == summary["total_income"] == "0.00"
    assert summary["transaction_count"] == 0
    assert summary["period_start"] == period.get("start_date")
    assert client.get("/analytics/spending-by-category", params=period).json()["items"] == []


def test_nonempty_database_empty_period(client, records):
    params = {"start_date": "2040-01-01"}
    assert (
        client.get("/analytics/spending-summary", params=params).json()["total_spending"] == "0.00"
    )
    assert client.get("/analytics/spending-by-category", params=params).json()["items"] == []


@pytest.mark.parametrize(
    "day,spending,income,transfers",
    [
        ("2026-05-20", "0.00", "1000.00", 0),
        ("2026-05-21", "0.00", "0.00", 1),
    ],
)
def test_credit_only_and_transfer_only_period(client, records, day, spending, income, transfers):
    params = {"start_date": day, "end_date": day}
    summary = client.get("/analytics/spending-summary", params=params).json()
    assert summary["total_spending"] == spending
    assert summary["total_income"] == income
    assert summary["transfer_count"] == transfers
    assert client.get("/analytics/spending-by-category", params=params).json()["items"] == []


@pytest.mark.parametrize("route", PERIOD_ROUTES)
@pytest.mark.parametrize(
    "params",
    [
        {"start_date": "2026-05-31", "end_date": "2026-05-01"},
        {"start_date": "2026-02-30"},
        {"end_date": "invalid-sensitive-input"},
    ],
)
def test_invalid_periods(client, route, params):
    response = client.get(route, params=params)
    assert response.status_code == 422
    assert "invalid-sensitive-input" not in response.text


@pytest.mark.parametrize(
    "params",
    [
        {"limit": 0},
        {"limit": 101},
        {"limit": "abc"},
        {"offset": -1},
        {"offset": 1_000_001},
        {"category_id": "bad-id"},
    ],
)
def test_invalid_pagination_and_category(client, params):
    assert client.get("/transactions", params=params).status_code == 422


def test_invalid_id_and_unsupported_method(client):
    assert client.get("/transactions/not-a-uuid").status_code == 422
    assert client.post("/transactions", json={"amount": "10.00"}).status_code == 405


def test_openapi_decimal_contract(client):
    response = client.get("/openapi.json")
    assert response.status_code == 200
    schemas = response.json()["components"]["schemas"]
    assert schemas["TransactionRead"]["properties"]["amount"]["type"] == "string"
    assert schemas["SpendingSummary"]["properties"]["total_spending"]["type"] == "string"
    assert client.get("/docs").status_code == 200


def test_database_error_does_not_leak_query_or_values(client, caplog):
    def unavailable():
        raise OperationalError("SELECT secret_financial_data", {}, Exception("private-details"))

    client.app.dependency_overrides[get_session] = unavailable
    response = client.get("/health")
    assert response.status_code == 503
    assert response.json() == {"detail": "Database unavailable."}
    assert "private-details" not in response.text + caplog.text
    assert "secret_financial_data" not in response.text + caplog.text


def test_unexpected_errors_are_private(client, caplog):
    def broken():
        raise RuntimeError("sensitive transaction data")

    client.app.dependency_overrides[get_session] = broken
    response = client.get("/transactions")
    assert response.status_code == 500
    assert response.json() == {"detail": "Internal server error."}
    assert "sensitive transaction data" not in response.text + caplog.text

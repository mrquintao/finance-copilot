from datetime import date
from decimal import Decimal

import pytest

from app.analytics.comparison import percent_change, previous_period
from app.db.models import Account, Category, Transaction

ROUTE = "/analytics/period-comparison"
SEPTEMBER = {"start_date": "2026-09-01", "end_date": "2026-09-30"}


def d(text: str) -> date:
    return date.fromisoformat(text)


@pytest.mark.parametrize(
    ("start", "end", "expected"),
    [
        # Whole months compare with whole months, whatever their length.
        ("2026-09-01", "2026-09-30", ("2026-08-01", "2026-08-31")),
        ("2026-03-01", "2026-03-31", ("2026-02-01", "2026-02-28")),
        ("2024-03-01", "2024-03-31", ("2024-02-01", "2024-02-29")),
        ("2026-01-01", "2026-01-31", ("2025-12-01", "2025-12-31")),
        ("2026-08-01", "2026-10-31", ("2026-05-01", "2026-07-31")),
        ("2026-01-01", "2026-12-31", ("2025-01-01", "2025-12-31")),
        ("2026-01-01", "2026-02-28", ("2025-11-01", "2025-12-31")),
        # Anything else compares with the same number of days right before.
        ("2026-09-01", "2026-09-15", ("2026-08-17", "2026-08-31")),
        ("2026-09-10", "2026-09-30", ("2026-08-20", "2026-09-09")),
        ("2026-09-15", "2026-09-15", ("2026-09-14", "2026-09-14")),
        ("2026-01-02", "2026-01-08", ("2025-12-26", "2026-01-01")),
    ],
)
def test_previous_equivalent_period(start, end, expected):
    assert previous_period(d(start), d(end)) == (d(expected[0]), d(expected[1]))


@pytest.mark.parametrize(
    ("current", "previous", "expected"),
    [
        ("150.00", "100.00", "50.0"),
        ("50.00", "100.00", "-50.0"),
        ("100.00", "100.00", "0.0"),
        ("0.00", "100.00", "-100.0"),
        ("100.00", "0.00", None),
        ("0.00", "0.00", None),
        # Half-up at one decimal, from exact decimals: 1.25% and -1.25%.
        ("101.25", "100.00", "1.3"),
        ("98.75", "100.00", "-1.3"),
        ("100.04", "100.00", "0.0"),
        ("1.00", "3.00", "-66.7"),
    ],
)
def test_percent_change(current, previous, expected):
    result = percent_change(Decimal(current), Decimal(previous))
    assert result == (Decimal(expected) if expected is not None else None)


@pytest.fixture
def ledger(session):
    account = Account(name="Conta de teste", institution="Banco Fake")
    food = Category(name="Alimentação")
    transport = Category(name="Transporte")
    housing = Category(name="Moradia")
    session.add_all([account, food, transport, housing])

    def add(day: str, amount: str, kind: str = "debit", category: Category | None = None):
        session.add(
            Transaction(
                external_id=f"t-{day}-{amount}-{kind}",
                account=account,
                date=d(day),
                description="Compra teste",
                amount=Decimal(amount),
                currency="BRL",
                type=kind,
                category=category,
            )
        )

    return add, {"food": food, "transport": transport, "housing": housing}


def test_month_is_compared_with_the_previous_month(client, session, ledger):
    add, categories = ledger
    # August (previous)
    add("2026-08-01", "100.00", category=categories["food"])
    add("2026-08-31", "40.00", category=categories["transport"])
    add("2026-08-15", "60.00", category=categories["housing"])
    add("2026-08-10", "1000.00", kind="credit")
    add("2026-08-11", "500.00", kind="transfer")
    # September (current)
    add("2026-09-01", "0.10", category=categories["food"])
    add("2026-09-02", "0.20", category=categories["food"])
    add("2026-09-30", "149.70", category=categories["food"])
    add("2026-09-05", "40.00", category=categories["transport"])
    add("2026-09-06", "25.00")
    add("2026-09-10", "1500.00", kind="credit")
    # Outside both periods
    add("2026-07-31", "999.00", category=categories["food"])
    add("2026-10-01", "999.00", category=categories["food"])
    session.flush()

    body = client.get(ROUTE, params=SEPTEMBER).json()

    assert body["currency"] == "BRL"
    assert body["period"] == SEPTEMBER
    assert body["previous_period"] == {"start_date": "2026-08-01", "end_date": "2026-08-31"}
    assert body["spending"] == {
        "current": "215.00",
        "previous": "200.00",
        "change": "15.00",
        "percent_change": "7.5",
        "direction": "up",
    }
    assert body["income"] == {
        "current": "1500.00",
        "previous": "1000.00",
        "change": "500.00",
        "percent_change": "50.0",
        "direction": "up",
    }
    # Transfers count as transactions but never as spending or income.
    assert body["transaction_count"] == {
        "current": 6,
        "previous": 5,
        "change": 1,
        "percent_change": "20.0",
        "direction": "up",
    }
    by_name = {item["category"]: item for item in body["categories"]}
    assert [item["category"] for item in body["categories"]] == [
        "Moradia",  # -60.00
        "Alimentação",  # +50.00
        "Sem categoria",  # +25.00
        "Transporte",  # 0.00
    ]
    assert by_name["Alimentação"]["current"] == "150.00"  # 0.10 + 0.20 + 149.70, exactly
    assert by_name["Alimentação"]["change"] == "50.00"
    assert by_name["Alimentação"]["percent_change"] == "50.0"
    assert by_name["Moradia"] == {
        "category_id": str(categories["housing"].id),
        "category": "Moradia",
        "current": "0.00",
        "previous": "60.00",
        "change": "-60.00",
        "percent_change": "-100.0",
        "direction": "down",
    }
    # New in this period: there is no base, so no percentage is invented.
    assert by_name["Sem categoria"]["category_id"] is None
    assert by_name["Sem categoria"]["previous"] == "0.00"
    assert by_name["Sem categoria"]["percent_change"] is None
    assert by_name["Sem categoria"]["direction"] == "up"
    assert by_name["Transporte"]["change"] == "0.00"
    assert by_name["Transporte"]["percent_change"] == "0.0"
    assert by_name["Transporte"]["direction"] == "equal"


def test_empty_previous_period_has_no_percentage(client, session, ledger):
    add, categories = ledger
    add("2026-09-10", "80.00", category=categories["food"])
    add("2026-09-11", "300.00", kind="credit")
    session.flush()

    body = client.get(ROUTE, params=SEPTEMBER).json()

    for metric in ("spending", "income", "transaction_count"):
        assert body[metric]["percent_change"] is None
        assert body[metric]["direction"] == "up"
    assert body["spending"]["change"] == "80.00"
    assert body["spending"]["previous"] == "0.00"
    assert body["transaction_count"]["previous"] == 0
    assert body["categories"][0]["percent_change"] is None


def test_equal_values_report_zero_change(client, session, ledger):
    add, categories = ledger
    add("2026-08-20", "0.30", category=categories["food"])
    add("2026-09-01", "0.10", category=categories["food"])
    add("2026-09-02", "0.20", category=categories["food"])
    session.flush()

    body = client.get(ROUTE, params=SEPTEMBER).json()

    assert body["spending"] == {
        "current": "0.30",
        "previous": "0.30",
        "change": "0.00",
        "percent_change": "0.0",
        "direction": "equal",
    }
    assert body["income"]["change"] == "0.00"
    assert body["income"]["percent_change"] is None
    assert body["income"]["direction"] == "equal"


def test_decrease_is_negative(client, session, ledger):
    add, _ = ledger
    add("2026-08-20", "300.00")
    add("2026-09-01", "100.00")
    session.flush()

    spending = client.get(ROUTE, params=SEPTEMBER).json()["spending"]

    assert spending["change"] == "-200.00"
    assert spending["percent_change"] == "-66.7"
    assert spending["direction"] == "down"


def test_both_periods_empty(client):
    body = client.get(ROUTE, params=SEPTEMBER).json()

    assert body["spending"]["change"] == "0.00"
    assert body["spending"]["percent_change"] is None
    assert body["spending"]["direction"] == "equal"
    assert body["transaction_count"]["change"] == 0
    assert body["categories"] == []


def test_partial_range_uses_the_same_number_of_days(client, session, ledger):
    add, _ = ledger
    add("2026-08-31", "10.00")  # in the previous 15 days
    add("2026-08-16", "99.00")  # one day too early
    add("2026-09-15", "30.00")
    session.flush()

    body = client.get(ROUTE, params={"start_date": "2026-09-01", "end_date": "2026-09-15"}).json()

    assert body["previous_period"] == {"start_date": "2026-08-17", "end_date": "2026-08-31"}
    assert body["spending"]["previous"] == "10.00"
    assert body["spending"]["change"] == "20.00"
    assert body["spending"]["percent_change"] == "200.0"


def test_money_is_serialized_as_strings_never_floats(client, session, ledger):
    add, _ = ledger
    add("2026-08-20", "1234567890.12")
    add("2026-09-01", "1234567890.13")
    session.flush()

    spending = client.get(ROUTE, params=SEPTEMBER).json()["spending"]

    assert spending["current"] == "1234567890.13"
    assert spending["change"] == "0.01"
    assert all(isinstance(spending[key], str) for key in ("current", "previous", "change"))


@pytest.mark.parametrize(
    "params",
    [
        {},
        {"start_date": "2026-09-01"},
        {"end_date": "2026-09-30"},
        {"start_date": "2026-09-30", "end_date": "2026-09-01"},
    ],
)
def test_both_bounds_are_required_and_ordered(client, params):
    assert client.get(ROUTE, params=params).status_code == 422

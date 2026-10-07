from datetime import date
from decimal import Decimal

import pytest

from app.db.models import Account, Category, Transaction

ROUTE = "/analytics/insights"
SEPTEMBER = {"start_date": "2026-09-01", "end_date": "2026-09-30"}


@pytest.fixture
def add(session):
    account = Account(name="Conta de teste", institution="Banco Fake")
    session.add(account)
    categories: dict[str, Category] = {}
    counter = iter(range(10_000))

    def _add(
        day: str,
        amount: str,
        category: str | None = None,
        *,
        kind: str = "debit",
        recurring: bool = False,
    ) -> None:
        if category and category not in categories:
            categories[category] = Category(name=category)
            session.add(categories[category])
        session.add(
            Transaction(
                external_id=f"t-{next(counter)}",
                account=account,
                date=date.fromisoformat(day),
                description="Compra teste",
                amount=Decimal(amount),
                currency="BRL",
                type=kind,
                category=categories.get(category) if category else None,
                is_recurring=recurring,
            )
        )
        session.flush()

    _add.categories = categories
    return _add


def insights(client, **params) -> dict:
    response = client.get(ROUTE, params=params or SEPTEMBER)
    assert response.status_code == 200, response.text
    return response.json()


def of_kind(body: dict, kind: str) -> list[dict]:
    return [item for item in body["items"] if item["kind"] == kind]


def test_no_data_means_no_insights_but_the_basis_is_always_stated(client):
    body = insights(client)

    assert body == {
        "currency": "BRL",
        "period": SEPTEMBER,
        "previous_period": {"start_date": "2026-08-01", "end_date": "2026-08-31"},
        "thresholds": {"min_change": "50.00", "min_percent": "20.0"},
        "items": [],
    }


def test_relevant_category_increase_and_decrease(client, add):
    add("2026-08-10", "200.00", "Alimentação")
    add("2026-09-10", "300.00", "Alimentação")  # +100.00, +50.0%
    add("2026-08-11", "400.00", "Lazer")
    add("2026-09-11", "100.00", "Lazer")  # -300.00, -75.0%

    body = insights(client)

    increase = of_kind(body, "category_increase")
    assert increase == [
        {
            "kind": "category_increase",
            "category_id": str(add.categories["Alimentação"].id),
            "category": "Alimentação",
            "current": "300.00",
            "previous": "200.00",
            "change": "100.00",
            "percent_change": "50.0",
            "direction": "up",
        }
    ]
    decrease = of_kind(body, "category_decrease")
    assert [(i["category"], i["change"], i["percent_change"]) for i in decrease] == [
        ("Lazer", "-300.00", "-75.0")
    ]


@pytest.mark.parametrize(
    ("previous", "current", "fires"),
    [
        ("100.00", "150.00", True),  # exactly +50.00 and +50.0%
        ("100.00", "149.99", False),  # one cent short of the minimum change
        ("250.00", "300.00", True),  # exactly +20.0%
        # The rule reads the percentage as reported (one decimal): 19.99% shows as 20.0%.
        ("250.01", "300.01", True),
        ("251.50", "301.50", False),  # +50.00 but 19.9%
        ("1000.00", "1100.00", False),  # large in reais, only +10%
        ("10.00", "40.00", False),  # +300% but only R$ 30
        ("100.00", "100.00", False),
        ("150.00", "100.00", True),  # -50.00, -33.3%
    ],
)
def test_relevance_thresholds_are_exact(client, add, previous, current, fires):
    add("2026-08-10", previous, "Mercado")
    add("2026-09-10", current, "Mercado")

    body = insights(client)

    relevant = of_kind(body, "category_increase") + of_kind(body, "category_decrease")
    assert bool(relevant) is fires


def test_a_new_category_is_relevant_by_size_alone_and_has_no_percentage(client, add):
    add("2026-09-10", "80.00", "Viagens")
    add("2026-09-11", "20.00", "Farmácia")

    body = insights(client)

    assert [(i["category"], i["percent_change"]) for i in of_kind(body, "category_increase")] == [
        ("Viagens", None)
    ]


def test_largest_category_change_is_the_biggest_mover_whatever_its_size(client, add):
    add("2026-08-10", "100.00", "Mercado")
    add("2026-09-10", "110.00", "Mercado")  # +10.00
    add("2026-08-11", "60.00", "Lazer")
    add("2026-09-11", "45.00", "Lazer")  # -15.00: the largest movement
    add("2026-08-12", "30.00", "Transporte")
    add("2026-09-12", "30.00", "Transporte")  # unchanged

    body = insights(client)

    assert of_kind(body, "largest_category_change") == [
        {
            "kind": "largest_category_change",
            "category_id": str(add.categories["Lazer"].id),
            "category": "Lazer",
            "current": "45.00",
            "previous": "60.00",
            "change": "-15.00",
            "percent_change": "-25.0",
            "direction": "down",
        }
    ]
    # Too small to be "relevant", so it is reported only as the largest mover.
    assert of_kind(body, "category_decrease") == []


def test_no_largest_change_when_nothing_moved(client, add):
    add("2026-08-10", "100.00", "Mercado")
    add("2026-09-10", "100.00", "Mercado")

    assert insights(client)["items"] == []


def test_total_spending_and_income_changes(client, add):
    add("2026-08-10", "1000.00", "Moradia")
    add("2026-09-10", "1300.00", "Moradia")
    add("2026-08-05", "5000.00", kind="credit")
    add("2026-09-05", "3000.00", kind="credit")
    # Transfers never count as spending or income.
    add("2026-09-06", "9000.00", kind="transfer")

    body = insights(client)

    (spending,) = of_kind(body, "spending_change")
    assert (spending["current"], spending["previous"], spending["change"]) == (
        "1300.00",
        "1000.00",
        "300.00",
    )
    assert spending["percent_change"] == "30.0"
    assert spending["category"] is None
    (income,) = of_kind(body, "income_change")
    assert (income["change"], income["percent_change"], income["direction"]) == (
        "-2000.00",
        "-40.0",
        "down",
    )


def test_recurring_growth(client, add):
    add("2026-08-05", "100.00", "Assinaturas", recurring=True)
    add("2026-09-05", "100.00", "Assinaturas", recurring=True)
    add("2026-09-06", "60.00", "Assinaturas", recurring=True)
    # Not recurring, a recurring credit and a recurring transfer: none of them count.
    add("2026-09-07", "500.00", "Mercado")
    add("2026-09-08", "500.00", kind="credit", recurring=True)
    add("2026-09-09", "500.00", kind="transfer", recurring=True)

    body = insights(client)

    assert of_kind(body, "recurring_growth") == [
        {
            "kind": "recurring_growth",
            "category_id": None,
            "category": None,
            "current": "160.00",
            "previous": "100.00",
            "change": "60.00",
            "percent_change": "60.0",
            "direction": "up",
        }
    ]


@pytest.mark.parametrize(
    ("previous", "current"),
    [
        ("100.00", "140.00"),  # below the minimum change
        ("160.00", "100.00"),  # a drop is not "growth"
        ("100.00", "100.00"),
    ],
)
def test_recurring_growth_does_not_fire(client, add, previous, current):
    add("2026-08-05", previous, recurring=True)
    add("2026-09-05", current, recurring=True)

    assert of_kind(insights(client), "recurring_growth") == []


def test_insights_match_the_period_comparison_and_are_reproducible(client, add):
    add("2026-08-10", "200.00", "Alimentação")
    add("2026-09-10", "0.10", "Alimentação")
    add("2026-09-11", "0.20", "Alimentação")
    add("2026-09-12", "299.70", "Alimentação")

    first = insights(client)
    second = insights(client)
    comparison = client.get("/analytics/period-comparison", params=SEPTEMBER).json()

    assert first == second
    (increase,) = of_kind(first, "category_increase")
    row = comparison["categories"][0]
    for key in ("current", "previous", "change", "percent_change", "direction", "category"):
        assert increase[key] == row[key]
    assert increase["current"] == "300.00"  # exact, from cents
    assert first["previous_period"] == comparison["previous_period"]


def test_partial_range_states_its_own_comparison_period(client, add):
    add("2026-08-31", "10.00", "Mercado")
    add("2026-09-15", "90.00", "Mercado")

    body = insights(client, start_date="2026-09-01", end_date="2026-09-15")

    assert body["previous_period"] == {"start_date": "2026-08-17", "end_date": "2026-08-31"}
    assert of_kind(body, "category_increase")[0]["change"] == "80.00"


@pytest.mark.parametrize(
    "params",
    [{}, {"start_date": "2026-09-01"}, {"start_date": "2026-09-30", "end_date": "2026-09-01"}],
)
def test_both_bounds_are_required(client, params):
    assert client.get(ROUTE, params=params).status_code == 422

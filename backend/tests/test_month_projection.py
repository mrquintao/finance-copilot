from datetime import date
from decimal import Decimal

import pytest

from app.db.models import Account, Transaction

ROUTE = "/analytics/month-projection"


@pytest.fixture
def add(session):
    account = Account(name="Conta de teste", institution="Banco Fake")
    session.add(account)
    counter = iter(range(10_000))

    def _add(day: str, amount: str, *, kind: str = "debit", recurring: bool = False) -> None:
        session.add(
            Transaction(
                external_id=f"t-{next(counter)}",
                account=account,
                date=date.fromisoformat(day),
                description="Compra teste",
                amount=Decimal(amount),
                currency="BRL",
                type=kind,
                is_recurring=recurring,
            )
        )
        session.flush()

    return _add


def projection(client, as_of: str) -> dict:
    response = client.get(ROUTE, params={"as_of": as_of})
    assert response.status_code == 200, response.text
    return response.json()


def test_no_spending_projects_zero(client):
    body = projection(client, "2026-10-07")

    assert body == {
        "currency": "BRL",
        "method": "linear_daily_average",
        "as_of": "2026-10-07",
        "month": {"start_date": "2026-10-01", "end_date": "2026-10-31"},
        "days_elapsed": 7,
        "days_in_month": 31,
        "days_remaining": 24,
        "spent_so_far": "0.00",
        "recurring_so_far": "0.00",
        "variable_so_far": "0.00",
        "variable_daily_average": "0.00",
        "recurring_basis": None,
        "recurring_expected": "0.00",
        "recurring_remaining": "0.00",
        "projected_variable": "0.00",
        "projected_total": "0.00",
    }


def test_start_of_month_extrapolates_from_a_single_day(client, add):
    add("2026-10-01", "50.00")
    add("2026-10-02", "999.00")  # after as_of: not known yet
    add("2026-09-30", "999.00")  # previous month, not recurring

    body = projection(client, "2026-10-01")

    assert (body["days_elapsed"], body["days_remaining"]) == (1, 30)
    assert body["spent_so_far"] == "50.00"
    assert body["variable_daily_average"] == "50.00"
    assert body["projected_total"] == "1550.00"  # 50.00 x 31


def test_middle_of_month_keeps_the_daily_average(client, add):
    add("2026-09-01", "100.00")
    add("2026-09-10", "200.00")
    add("2026-09-15", "150.00")
    # Income and transfers are not spending.
    add("2026-09-05", "5000.00", kind="credit")
    add("2026-09-06", "700.00", kind="transfer")

    body = projection(client, "2026-09-15")

    assert (body["days_elapsed"], body["days_in_month"], body["days_remaining"]) == (15, 30, 15)
    assert body["spent_so_far"] == "450.00"
    assert body["variable_daily_average"] == "30.00"
    assert body["projected_variable"] == "900.00"
    assert body["projected_total"] == "900.00"


def test_end_of_month_projection_equals_what_was_spent(client, add):
    add("2026-09-01", "100.10")
    add("2026-09-30", "200.20")

    body = projection(client, "2026-09-30")

    assert body["days_remaining"] == 0
    assert body["spent_so_far"] == "300.30"
    assert body["projected_total"] == "300.30"


def test_recurring_spending_is_projected_from_the_previous_month_not_averaged(client, add):
    # Previous month: what recurring spending usually is.
    add("2026-09-05", "1800.00", recurring=True)
    add("2026-09-10", "40.00", recurring=True)
    add("2026-09-12", "500.00")  # variable in September: irrelevant here
    # This month so far: the rent came in, the subscription has not.
    add("2026-10-05", "1800.00", recurring=True)
    add("2026-10-03", "60.00")
    add("2026-10-08", "40.00")

    body = projection(client, "2026-10-10")

    assert body["spent_so_far"] == "1900.00"
    assert body["recurring_so_far"] == "1800.00"
    assert body["variable_so_far"] == "100.00"
    assert body["variable_daily_average"] == "10.00"
    assert body["projected_variable"] == "310.00"  # 100.00 x 31 / 10
    assert body["recurring_basis"] == {"start_date": "2026-09-01", "end_date": "2026-09-30"}
    assert body["recurring_expected"] == "1840.00"
    assert body["recurring_remaining"] == "40.00"
    # The rent is counted once, not multiplied by the days left.
    assert body["projected_total"] == "2150.00"  # 1800.00 + 40.00 + 310.00


def test_recurring_above_last_month_never_goes_negative(client, add):
    add("2026-09-05", "100.00", recurring=True)
    add("2026-10-05", "130.00", recurring=True)

    body = projection(client, "2026-10-31")

    assert body["recurring_remaining"] == "0.00"
    assert body["projected_total"] == "130.00"


def test_projection_is_rounded_once_to_the_cent(client, add):
    add("2026-10-01", "100.00")

    body = projection(client, "2026-10-03")

    # 100.00 x 31 / 3 = 1033.333...; the daily average 33.333... is shown rounded separately.
    assert body["projected_total"] == "1033.33"
    assert body["variable_daily_average"] == "33.33"


def test_half_cent_rounds_up(client, add):
    add("2026-02-01", "0.01")

    body = projection(client, "2026-02-08")

    # 0.01 x 28 / 8 = 0.035
    assert body["projected_total"] == "0.04"


def test_leap_february_and_december(client, add):
    add("2024-02-10", "290.00")
    add("2026-12-31", "10.00")

    assert projection(client, "2024-02-29")["days_in_month"] == 29
    december = projection(client, "2026-12-31")
    assert december["month"] == {"start_date": "2026-12-01", "end_date": "2026-12-31"}
    assert december["projected_total"] == "10.00"


def test_large_amounts_stay_exact(client, add):
    add("2026-10-01", "1234567890.12")

    body = projection(client, "2026-10-31")

    assert body["projected_total"] == "1234567890.12"
    assert isinstance(body["projected_total"], str)


def test_same_input_gives_the_same_projection(client, add):
    add("2026-10-01", "12.34")
    add("2026-10-04", "56.78")

    assert projection(client, "2026-10-07") == projection(client, "2026-10-07")


@pytest.mark.parametrize("params", [{}, {"as_of": "07/10/2026"}, {"as_of": "2026-02-30"}])
def test_as_of_is_required_and_must_be_a_date(client, params):
    assert client.get(ROUTE, params=params).status_code == 422


def test_first_representable_month_does_not_fail(client):
    body = projection(client, "0001-01-15")

    assert body["recurring_basis"] is None
    assert body["projected_total"] == "0.00"

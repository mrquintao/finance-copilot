"""The Copilot's tools on their own: no model, no network."""

from datetime import date
from decimal import Decimal

import pytest

from app.copilot.grounding import amounts_in_text, ungrounded_amounts
from app.copilot.tools import TOOL_SPECS, parse_period_text, resolve_preset, run_tool
from app.db.models import Account, Category, SyncRun, Transaction

TODAY = date(2026, 10, 7)
SEPTEMBER = {"period": {"start_date": "2026-09-01", "end_date": "2026-09-30"}}


@pytest.fixture
def ledger(session):
    account = Account(
        name="Conta corrente",
        institution="MeuPluggy",
        provider="pluggy",
        provider_item_id="secret-item-id",
        provider_account_id="secret-account-id",
    )
    food = Category(name="Alimentação")
    transport = Category(name="Transporte")
    session.add_all([account, food, transport])
    rows = [
        ("ext-1", "2026-09-03", "UBER *TRIP", "Uber", "27.90", "debit", transport),
        ("ext-2", "2026-09-20", "Uber do Brasil", None, "31.10", "debit", transport),
        ("ext-3", "2026-09-05", "Pedido", "iFood", "62.45", "debit", food),
        ("ext-4", "2026-09-06", "Padaria", None, "0.10", "debit", food),
        ("ext-5", "2026-09-07", "Padaria", None, "0.20", "debit", food),
        ("ext-6", "2026-09-01", "SALARIO", None, "8150.00", "credit", None),
        ("ext-7", "2026-09-15", "Transferência", None, "500.00", "transfer", None),
        ("ext-8", "2026-09-18", "Compra avulsa", None, "10.00", "debit", None),
        ("ext-9", "2026-08-10", "Mercado", "iFood", "100.00", "debit", food),
        ("ext-10", "2026-10-02", "Uber", "Uber", "15.00", "debit", transport),
    ]
    session.add_all(
        Transaction(
            external_id=external_id,
            account=account,
            date=date.fromisoformat(day),
            description=description,
            merchant=merchant,
            amount=Decimal(amount),
            currency="BRL",
            type=kind,
            category=category,
        )
        for external_id, day, description, merchant, amount, kind, category in rows
    )
    session.add(SyncRun(provider="pluggy", item_id="secret-item-id", status="succeeded"))
    session.flush()


def run(session, name: str, arguments: dict):
    return run_tool(session, name, arguments, TODAY)


@pytest.mark.parametrize(
    ("preset", "today", "expected"),
    [
        ("current_month", "2026-10-07", ("2026-10-01", "2026-10-31")),
        ("previous_month", "2026-10-07", ("2026-09-01", "2026-09-30")),
        ("last_3_months", "2026-10-07", ("2026-08-01", "2026-10-31")),
        ("previous_month", "2026-01-15", ("2025-12-01", "2025-12-31")),
        ("last_3_months", "2026-01-15", ("2025-11-01", "2026-01-31")),
        ("previous_month", "2024-03-31", ("2024-02-01", "2024-02-29")),
    ],
)
def test_presets_resolve_from_the_users_date(preset, today, expected):
    start, end = resolve_preset(preset, date.fromisoformat(today))
    assert (start.isoformat(), end.isoformat()) == expected


def test_spending_summary_matches_the_analytics(session, ledger):
    outcome = run(session, "get_spending_summary", SEPTEMBER)

    assert not outcome.is_error
    assert outcome.period == (date(2026, 9, 1), date(2026, 9, 30))
    assert outcome.result == {
        "period": {"start_date": "2026-09-01", "end_date": "2026-09-30"},
        "total_spending": "131.75",
        "total_income": "8150.00",
        "transaction_count": 8,
        "expense_count": 6,
        "income_count": 1,
        "transfer_count": 1,
    }


def test_preset_period_is_resolved_and_reported(session, ledger):
    outcome = run(session, "get_spending_summary", {"period": {"preset": "previous_month"}})

    assert outcome.result["period"] == {"start_date": "2026-09-01", "end_date": "2026-09-30"}
    assert outcome.result["total_spending"] == "131.75"
    assert outcome.arguments == {"period": {"preset": "previous_month"}}


def test_spending_by_category_is_exact_and_ordered(session, ledger):
    outcome = run(session, "get_spending_by_category", SEPTEMBER)

    assert outcome.result["categories"] == [
        {"category": "Alimentação", "amount": "62.75", "transaction_count": 3},
        {"category": "Transporte", "amount": "59.00", "transaction_count": 2},
        {"category": "Sem categoria", "amount": "10.00", "transaction_count": 1},
    ]


def test_period_comparison_carries_the_computed_difference(session, ledger):
    result = run(session, "get_period_comparison", SEPTEMBER).result

    assert result["previous_period"] == {"start_date": "2026-08-01", "end_date": "2026-08-31"}
    assert result["spending"] == {
        "current": "131.75",
        "previous": "100.00",
        "change": "31.75",
        "percent_change": "31.8",
        "direction": "up",
    }
    assert all("category_id" not in item for item in result["categories"])


def test_search_sums_every_match_and_lists_only_the_most_recent(session, ledger):
    outcome = run(session, "search_transactions", {**SEPTEMBER, "text": "uber", "limit": 1})

    result = outcome.result
    assert result["total_count"] == 2
    assert result["totals_by_type"]["debit"] == {"amount": "59.00", "count": 2}
    assert result["totals_by_type"]["credit"] == {"amount": "0.00", "count": 0}
    assert (result["listed"], result["truncated"]) == (1, True)
    assert result["transactions"][0]["date"] == "2026-09-20"
    assert set(result["transactions"][0]) == {
        "id",
        "date",
        "description",
        "merchant",
        "amount",
        "type",
        "category",
    }


def test_search_filters_by_category_and_type(session, ledger):
    by_category = run(session, "search_transactions", {**SEPTEMBER, "category": "alimentação"})
    assert by_category.result["total_count"] == 3
    assert by_category.result["totals_by_type"]["debit"]["amount"] == "62.75"

    uncategorized = run(
        session, "search_transactions", {**SEPTEMBER, "category": "Sem categoria", "type": "debit"}
    )
    assert [t["description"] for t in uncategorized.result["transactions"]] == ["Compra avulsa"]

    transfers = run(session, "search_transactions", {**SEPTEMBER, "type": "transfer"})
    assert transfers.result["totals_by_type"]["transfer"] == {"amount": "500.00", "count": 1}


def test_search_text_is_literal(session, ledger):
    assert (
        run(session, "search_transactions", {**SEPTEMBER, "text": "%"}).result["total_count"] == 0
    )
    assert (
        run(session, "search_transactions", {**SEPTEMBER, "text": "*TRIP"}).result["total_count"]
        == 1
    )


def test_no_matches_is_an_explicit_empty_result(session, ledger):
    result = run(
        session,
        "search_transactions",
        {"period": {"start_date": "2020-01-01", "end_date": "2020-01-31"}},
    ).result

    assert result["total_count"] == 0
    assert result["transactions"] == []
    assert result["truncated"] is False


def test_unknown_category_is_an_error_result_not_a_guess(session, ledger):
    outcome = run(session, "search_transactions", {**SEPTEMBER, "category": "Viagens"})

    assert outcome.is_error
    assert "list_categories" in outcome.result["error"]


def test_list_categories(session, ledger):
    assert run(session, "list_categories", {}).result == {
        "categories": ["Alimentação", "Transporte"]
    }


@pytest.mark.parametrize(
    ("name", "arguments"),
    [
        ("get_spending_summary", {}),
        ("get_spending_summary", {"period": {}}),
        ("get_spending_summary", {"period": {"preset": "last_year"}}),
        ("get_spending_summary", {"period": {"start_date": "2026-09-01"}}),
        (
            "get_spending_summary",
            {"period": {"start_date": "2026-09-30", "end_date": "2026-09-01"}},
        ),
        (
            "get_spending_summary",
            {
                "period": {
                    "preset": "current_month",
                    "start_date": "2026-09-01",
                    "end_date": "2026-09-30",
                }
            },
        ),
        ("get_spending_summary", {**SEPTEMBER, "account_id": "x"}),
        ("search_transactions", {**SEPTEMBER, "limit": -5}),
        ("search_transactions", {**SEPTEMBER, "limit": "muitas"}),
        ("get_spending_summary", {"period": "setembro"}),
        ("get_spending_summary", {"period": "2026-13"}),
        ("get_spending_summary", {"period": "2026-02-30"}),
        ("get_spending_summary", {"period": "2026-09-30..2026-09-01"}),
        ("search_transactions", {**SEPTEMBER, "type": "expense"}),
        ("delete_transactions", {}),
        ("list_categories", {"drop": True}),
    ],
)
def test_invalid_calls_are_rejected_without_running_anything(session, ledger, name, arguments):
    outcome = run(session, name, arguments)

    assert outcome.is_error
    assert outcome.period is None
    assert "error" in outcome.result


def test_tools_expose_no_provider_identifiers(session, ledger):
    dumped = "".join(
        repr(run(session, name, arguments).result)
        for name, arguments in [
            ("get_spending_summary", SEPTEMBER),
            ("get_spending_by_category", SEPTEMBER),
            ("get_period_comparison", SEPTEMBER),
            ("search_transactions", {**SEPTEMBER, "limit": 20}),
            ("list_categories", {}),
        ]
    )

    for secret in ("secret-item-id", "secret-account-id", "ext-1", "MeuPluggy", "Conta corrente"):
        assert secret not in dumped


def test_tools_are_read_only(session, ledger):
    for name, arguments in [
        ("get_spending_summary", SEPTEMBER),
        ("get_period_comparison", SEPTEMBER),
        ("search_transactions", SEPTEMBER),
    ]:
        run(session, name, arguments)

    assert not session.dirty and not session.new and not session.deleted
    assert [spec.name for spec in TOOL_SPECS] == [
        "get_spending_summary",
        "get_spending_by_category",
        "get_period_comparison",
        "list_categories",
        "search_transactions",
    ]
    # No tool name suggests a write.
    assert all(spec.name.startswith(("get_", "list_", "search_")) for spec in TOOL_SPECS)


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Você gastou R$ 1.234,56 em setembro.", {"1234.56"}),
        ("Foram R$ 59,00 em 2 corridas e R$ 0,10 de troco.", {"59.00", "0.10"}),
        ("Total de 8.150,00 reais.", {"8150.00"}),
        ("Cerca de R$ 1.200 no mês.", {"1200"}),
        ("R$1234,5 não é um valor completo, mas R$ 12,34 é.", {"12.34"}),
        ("Subiu 31,8% e caiu 7,45%.", set()),
        ("Entre 01/09/2026 e 30/09/2026 houve 21 transações.", set()),
    ],
)
def test_amounts_are_extracted_from_answers(text, expected):
    assert amounts_in_text(text) == {Decimal(value) for value in expected}


def test_grounding_accepts_only_amounts_present_in_results():
    results = [
        {"total_spending": "131.75", "transaction_count": 8},
        {"spending": {"change": "-31.75"}, "categories": [{"amount": "62.75"}]},
    ]

    assert ungrounded_amounts("Você gastou R$ 131,75; alimentação somou R$ 62,75.", results) == []
    # A signed change is matched by its magnitude.
    assert ungrounded_amounts("A queda foi de R$ 31,75.", results) == []
    # 131.75 + 62.75 was never returned by a tool: the model added it up.
    assert ungrounded_amounts("No total, R$ 194,50.", results) == ["194.50"]
    assert ungrounded_amounts("Gastou R$ 131,75 e R$ 999,99.", results) == ["999.99"]
    # A count that looks like an amount is not confused with one.
    assert ungrounded_amounts("Foram 8 transações.", results) == []
    assert ungrounded_amounts("Gastou R$ 10,00.", []) == ["10.00"]


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("previous_month", {"preset": "previous_month"}),
        (" current_month ", {"preset": "current_month"}),
        ("2020-01", {"start_date": "2020-01-01", "end_date": "2020-01-31"}),
        ("2024-02", {"start_date": "2024-02-01", "end_date": "2024-02-29"}),
        ("2025", {"start_date": "2025-01-01", "end_date": "2025-12-31"}),
        ("2026-09-15", {"start_date": "2026-09-15", "end_date": "2026-09-15"}),
        ("2026-03-01..2026-03-15", {"start_date": "2026-03-01", "end_date": "2026-03-15"}),
        ("2026-03-01 a 2026-03-15", {"start_date": "2026-03-01", "end_date": "2026-03-15"}),
        ("2026-03-01/2026-03-15", {"start_date": "2026-03-01", "end_date": "2026-03-15"}),
        # Not understood: left as an unknown preset, which validation then rejects.
        ("janeiro de 2020", {"preset": "janeiro de 2020"}),
        ("2026-13", {"preset": "2026-13"}),
        ("", {"preset": ""}),
    ],
)
def test_period_written_as_one_string(text, expected):
    assert parse_period_text(text) == expected


@pytest.mark.parametrize(
    ("period", "bounds"),
    [
        ("previous_month", ("2026-09-01", "2026-09-30")),
        ("2026-09", ("2026-09-01", "2026-09-30")),
        ("2026", ("2026-01-01", "2026-12-31")),
        ("2026-09-01..2026-09-07", ("2026-09-01", "2026-09-07")),
    ],
)
def test_tools_accept_the_period_as_a_string(session, ledger, period, bounds):
    outcome = run(session, "get_spending_summary", {"period": period})

    assert not outcome.is_error
    assert outcome.result["period"] == {"start_date": bounds[0], "end_date": bounds[1]}


def test_january_2020_is_queried_as_january_2020(session, ledger):
    outcome = run(session, "get_spending_summary", {"period": "2020-01"})

    assert outcome.period == (date(2020, 1, 1), date(2020, 1, 31))
    assert outcome.result["transaction_count"] == 0


def test_search_caps_the_limit_instead_of_failing(session, ledger):
    outcome = run(session, "search_transactions", {"period": "2026-09", "limit": 100})

    assert not outcome.is_error
    assert outcome.arguments["limit"] == 20
    assert outcome.result["total_count"] == 8


def test_search_drops_a_category_that_only_repeats_the_text(session, ledger):
    """What a local model really sent for "quanto gastei com Uber": category and text alike."""
    outcome = run(
        session,
        "search_transactions",
        {"period": "2026-09", "text": "Uber", "category": "uber", "limit": 100},
    )

    assert not outcome.is_error
    assert "category" not in outcome.arguments
    assert outcome.result["totals_by_type"]["debit"] == {"amount": "59.00", "count": 2}


def test_an_unknown_category_different_from_the_text_is_still_an_error(session, ledger):
    outcome = run(
        session, "search_transactions", {"period": "2026-09", "text": "Uber", "category": "Viagens"}
    )

    assert outcome.is_error
    assert "without `category`" in outcome.result["error"]


def test_the_advertised_period_is_a_single_string():
    for spec in TOOL_SPECS:
        period = spec.input_schema["properties"].get("period")
        if period is not None:
            assert period["type"] == "string"
            assert '"YYYY-MM"' in period["description"]


@pytest.mark.parametrize(
    "extra",
    [
        # Exactly what a local model sent for "quanto gastei com Uber".
        {"category": "", "limit": 0},
        {"category": "None", "limit": "10"},
        {"category": None, "type": None, "limit": None},
        {"category": " Todas ", "type": ""},
    ],
)
def test_placeholders_in_optional_fields_count_as_absent(session, ledger, extra):
    outcome = run(session, "search_transactions", {"period": "2026-09", "text": "Uber", **extra})

    assert not outcome.is_error
    assert "category" not in outcome.arguments and "type" not in outcome.arguments
    assert outcome.arguments["limit"] == 10
    assert outcome.result["totals_by_type"]["debit"] == {"amount": "59.00", "count": 2}


def test_an_empty_text_is_not_a_search_for_everything_by_accident(session, ledger):
    outcome = run(session, "search_transactions", {"period": "2026-09", "text": "  "})

    assert "text" not in outcome.arguments
    assert outcome.result["total_count"] == 8

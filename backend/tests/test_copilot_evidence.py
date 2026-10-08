"""Evidence returned with a Copilot answer: built from executed queries, never from the text."""

from datetime import date
from decimal import Decimal

import pytest

from app.copilot.evidence import SOURCES
from app.copilot.tools import TOOL_SPECS
from app.db.models import Account, Category, Transaction
from app.integrations.llm.provider import LLMTurn, ToolCall
from tests.test_copilot import ScriptedLLM, call, say

SEPTEMBER = {"period": {"preset": "previous_month"}}
PERIOD = {"start_date": "2026-09-01", "end_date": "2026-09-30"}


@pytest.fixture
def ledger(session):
    account = Account(name="Conta corrente", institution="MeuPluggy")
    food = Category(name="Alimentação")
    session.add_all([account, food])
    rows = [
        ("2026-09-05", "Pedido", "iFood", "62.45", "debit", food),
        ("2026-09-06", "Padaria", None, "0.30", "debit", food),
        ("2026-09-20", "UBER *TRIP", "Uber", "59.00", "debit", None),
        ("2026-09-01", "SALARIO", None, "8150.00", "credit", None),
        ("2026-08-10", "Mercado", None, "100.00", "debit", food),
    ]
    transactions = [
        Transaction(
            external_id=f"ext-{index}",
            account=account,
            date=date.fromisoformat(day),
            description=description,
            merchant=merchant,
            amount=Decimal(amount),
            currency="BRL",
            type=kind,
            category=category,
        )
        for index, (day, description, merchant, amount, kind, category) in enumerate(rows)
    ]
    session.add_all(transactions)
    session.flush()
    return {"food": food, "transactions": transactions}


def ask(client, monkeypatch, *turns: LLMTurn) -> dict:
    monkeypatch.setattr("app.copilot.router.llm", lambda: ScriptedLLM(*turns))
    response = client.post("/copilot/ask", json={"question": "Pergunta", "today": "2026-10-07"})
    assert response.status_code == 200, response.text
    return response.json()


def facts(evidence: dict) -> dict[str, dict]:
    return {fact["label"]: fact for fact in evidence["facts"]}


def test_every_tool_has_a_named_source():
    assert set(SOURCES) == {spec.name for spec in TOOL_SPECS}


def test_summary_evidence_states_period_source_and_linked_facts(client, monkeypatch, ledger):
    body = ask(client, monkeypatch, call("get_spending_summary", SEPTEMBER), say("Ok."))

    (evidence,) = body["evidence"]
    assert evidence["title"] == "Resumo de gastos e receitas"
    assert evidence["source"].endswith("(GET /analytics/spending-summary)")
    assert evidence["period"] == PERIOD
    assert evidence["has_data"] is True
    assert evidence["transactions_link"] == {**PERIOD, "q": None, "category_id": None, "type": None}
    by_label = facts(evidence)
    assert by_label["Gastos"] == {
        "label": "Gastos",
        "value": "121.75",
        "kind": "money",
        "detail": None,
        "link": {**PERIOD, "q": None, "category_id": None, "type": "debit"},
    }
    assert by_label["Receitas"]["value"] == "8150.00"
    assert by_label["Receitas"]["link"]["type"] == "credit"
    assert by_label["Transações"] == {
        "label": "Transações",
        "value": "4",
        "kind": "count",
        "detail": None,
        "link": None,
    }
    assert body["no_data"] is False


def test_category_facts_link_to_the_transactions_of_that_category(client, monkeypatch, ledger):
    body = ask(client, monkeypatch, call("get_spending_by_category", SEPTEMBER), say("Ok."))

    by_label = facts(body["evidence"][0])
    assert by_label["Alimentação"]["value"] == "62.75"
    assert by_label["Alimentação"]["detail"] == "2 despesa(s)"
    assert by_label["Alimentação"]["link"] == {
        **PERIOD,
        "q": None,
        "category_id": str(ledger["food"].id),
        "type": "debit",
    }
    # There is no category id to filter "Sem categoria" by, so no link is made up for it.
    assert by_label["Sem categoria"]["value"] == "59.00"
    assert by_label["Sem categoria"]["link"] is None


def test_comparison_evidence_names_both_periods_and_the_computed_change(
    client, monkeypatch, ledger
):
    body = ask(client, monkeypatch, call("get_period_comparison", SEPTEMBER), say("Ok."))

    evidence = body["evidence"][0]
    assert evidence["period"] == PERIOD
    assert evidence["comparison_period"] == {"start_date": "2026-08-01", "end_date": "2026-08-31"}
    by_label = facts(evidence)
    assert (by_label["Gastos no período"]["value"], by_label["Gastos no período"]["kind"]) == (
        "121.75",
        "money",
    )
    assert by_label["Gastos no período anterior"]["value"] == "100.00"
    assert by_label["Variação de gastos"] == {
        "label": "Variação de gastos",
        "value": "21.75",
        "kind": "signed_money",
        "detail": None,
        "link": None,
    }
    assert by_label["Variação percentual de gastos"]["value"] == "21.8"
    assert by_label["Variação percentual de gastos"]["kind"] == "percent"
    # Income had no previous value: no percentage is offered.
    assert "Variação percentual de receitas" not in by_label
    assert by_label["Variação de transações"]["kind"] == "signed_count"
    assert by_label["Variação em Alimentação"]["value"] == "-37.25"


def test_search_evidence_lists_real_transactions_and_reproduces_the_filters(
    client, monkeypatch, ledger
):
    arguments = {**SEPTEMBER, "text": " uber ", "type": "debit", "category": "Sem categoria"}
    body = ask(client, monkeypatch, call("search_transactions", arguments), say("Ok."))

    evidence = body["evidence"][0]
    uber = next(t for t in ledger["transactions"] if t.merchant == "Uber")
    assert evidence["transactions"] == [
        {
            "id": str(uber.id),
            "date": "2026-09-20",
            "title": "Uber",
            "amount": "59.00",
            "type": "debit",
        }
    ]
    assert evidence["transactions_link"] == {
        **PERIOD,
        "q": "uber",
        "category_id": None,
        "type": "debit",
    }
    by_label = facts(evidence)
    assert by_label["Transações encontradas"]["value"] == "1"
    assert by_label["Total em despesas"]["value"] == "59.00"
    assert by_label["Total em despesas"]["detail"] == "1 transação(ões)"
    assert "Total em receitas" not in by_label


def test_search_by_category_links_with_the_category_id(client, monkeypatch, ledger):
    body = ask(
        client,
        monkeypatch,
        call("search_transactions", {**SEPTEMBER, "category": "alimentação"}),
        say("Ok."),
    )

    assert body["evidence"][0]["transactions_link"]["category_id"] == str(ledger["food"].id)
    ids = {row["id"] for row in body["evidence"][0]["transactions"]}
    assert ids <= {str(t.id) for t in ledger["transactions"]}
    assert len(ids) == 2


def test_absence_of_data_is_explicit(client, monkeypatch, ledger):
    empty = {"period": {"start_date": "2020-01-01", "end_date": "2020-01-31"}}
    body = ask(
        client,
        monkeypatch,
        LLMTurn(
            text="",
            tool_calls=(
                ToolCall("a", "get_spending_summary", empty),
                ToolCall("b", "get_spending_by_category", empty),
                ToolCall("c", "search_transactions", empty),
                ToolCall("d", "get_period_comparison", empty),
            ),
            stop="tool_use",
        ),
        say("Não há transações nesse período."),
    )

    assert body["status"] == "answered"
    assert body["no_data"] is True
    assert [item["has_data"] for item in body["evidence"]] == [False, False, False, False]
    assert body["evidence"][2]["transactions"] == []


def test_no_data_is_false_when_any_query_found_something(client, monkeypatch, ledger):
    empty = {"period": {"start_date": "2020-01-01", "end_date": "2020-01-31"}}
    body = ask(
        client,
        monkeypatch,
        LLMTurn(
            text="",
            tool_calls=(
                ToolCall("a", "get_spending_summary", empty),
                ToolCall("b", "get_spending_summary", SEPTEMBER),
            ),
            stop="tool_use",
        ),
        say("Ok."),
    )

    assert body["no_data"] is False
    assert [item["has_data"] for item in body["evidence"]] == [False, True]


def test_evidence_never_comes_from_the_models_text(client, monkeypatch, ledger):
    """The model names a source, a period and a transaction; none of it becomes evidence."""
    body = ask(
        client,
        monkeypatch,
        say(
            "Fonte: relatório anual do banco. Entre 01/01/2019 e 31/12/2019 houve uma compra "
            "na Loja Inventada (id 11111111-1111-4111-8111-111111111111)."
        ),
    )

    assert body["status"] == "answered"
    assert body["evidence"] == []
    assert body["periods"] == []
    assert body["no_data"] is False


def test_withheld_answer_still_carries_checkable_evidence(client, monkeypatch, ledger):
    body = ask(
        client,
        monkeypatch,
        call("get_spending_summary", SEPTEMBER),
        say("Você gastou R$ 999,99."),
    )

    assert body["status"] == "ungrounded"
    assert facts(body["evidence"][0])["Gastos"]["value"] == "121.75"


def test_failed_tool_calls_are_not_evidence(client, monkeypatch, ledger):
    body = ask(
        client,
        monkeypatch,
        call("search_transactions", {**SEPTEMBER, "category": "Viagens"}),
        say("Não encontrei essa categoria."),
    )

    assert body["evidence"] == []
    assert body["no_data"] is False


def test_list_categories_evidence(client, monkeypatch, ledger):
    body = ask(client, monkeypatch, call("list_categories", {}), say("Há uma categoria."))

    evidence = body["evidence"][0]
    assert evidence["period"] is None
    assert evidence["transactions_link"] is None
    assert facts(evidence)["Categorias"]["value"] == "1"

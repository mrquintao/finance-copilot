"""Turn an executed tool call into evidence the user can check.

Evidence is built here, by the application, from the result of a query that really ran. The
model's text is never an input: a source, a figure or a transaction can only appear in the
evidence if a deterministic query produced it. Links point at the Transactions screen with
the same filters the query used.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.analytics.schemas import DateRange
from app.copilot.schemas import EvidenceTransaction, Fact, ToolEvidence, TransactionsLink
from app.db.models import Category

TOP_CATEGORIES = 5

# What each tool is, in the user's language, and which calculation backs it.
SOURCES: dict[str, tuple[str, str]] = {
    "get_spending_summary": (
        "Resumo de gastos e receitas",
        "Soma dos débitos e dos créditos do período (GET /analytics/spending-summary)",
    ),
    "get_spending_by_category": (
        "Gastos por categoria",
        "Soma dos débitos do período por categoria (GET /analytics/spending-by-category)",
    ),
    "get_period_comparison": (
        "Comparação com o período anterior",
        "Diferença entre o período e o período anterior equivalente "
        "(GET /analytics/period-comparison)",
    ),
    "search_transactions": (
        "Transações encontradas",
        "Busca nas transações do período, com totais somados no banco (GET /transactions)",
    ),
    "list_categories": ("Categorias existentes", "Lista de categorias (GET /categories)"),
}


def _link(start: date, end: date, **filters: str | None) -> TransactionsLink:
    return TransactionsLink(start_date=start, end_date=end, **filters)


def _category_ids(session: Session) -> dict[str, str]:
    return {
        name.lower(): str(category_id)
        for category_id, name in session.execute(select(Category.id, Category.name))
    }


def _change(label: str, metric: dict[str, Any], *, money: bool) -> list[Fact]:
    kind = "money" if money else "count"
    facts = [
        Fact(label=f"{label} no período", value=str(metric["current"]), kind=kind),
        Fact(label=f"{label} no período anterior", value=str(metric["previous"]), kind=kind),
        Fact(
            label=f"Variação de {label.lower()}",
            value=str(metric["change"]),
            kind="signed_money" if money else "signed_count",
        ),
    ]
    if metric["percent_change"] is not None:
        facts.append(
            Fact(
                label=f"Variação percentual de {label.lower()}",
                value=metric["percent_change"],
                kind="percent",
            )
        )
    return facts


def build_evidence(
    session: Session,
    tool: str,
    arguments: dict[str, Any],
    period: tuple[date, date] | None,
    result: dict[str, Any],
) -> ToolEvidence:
    title, source = SOURCES[tool]
    facts: list[Fact] = []
    transactions: list[EvidenceTransaction] = []
    link: TransactionsLink | None = None
    comparison_period: DateRange | None = None
    has_data = True

    if tool == "get_spending_summary":
        assert period is not None
        has_data = result["transaction_count"] > 0
        facts = [
            Fact(
                label="Gastos",
                value=result["total_spending"],
                kind="money",
                link=_link(*period, type="debit"),
            ),
            Fact(
                label="Receitas",
                value=result["total_income"],
                kind="money",
                link=_link(*period, type="credit"),
            ),
            Fact(label="Transações", value=str(result["transaction_count"]), kind="count"),
            Fact(label="Despesas", value=str(result["expense_count"]), kind="count"),
            Fact(label="Receitas (quantidade)", value=str(result["income_count"]), kind="count"),
            Fact(label="Transferências", value=str(result["transfer_count"]), kind="count"),
        ]
        link = _link(*period)

    elif tool == "get_spending_by_category":
        assert period is not None
        ids = _category_ids(session)
        has_data = bool(result["categories"])
        for item in result["categories"]:
            category_id = ids.get(item["category"].lower())
            facts.append(
                Fact(
                    label=item["category"],
                    value=item["amount"],
                    kind="money",
                    detail=f"{item['transaction_count']} despesa(s)",
                    # "Sem categoria" has no id to filter by, so it gets no link.
                    link=_link(*period, type="debit", category_id=category_id)
                    if category_id
                    else None,
                )
            )
        link = _link(*period, type="debit")

    elif tool == "get_period_comparison":
        assert period is not None
        previous = result["previous_period"]
        comparison_period = DateRange(
            start_date=previous["start_date"], end_date=previous["end_date"]
        )
        count = result["transaction_count"]
        has_data = count["current"] > 0 or count["previous"] > 0
        facts = [
            *_change("Gastos", result["spending"], money=True),
            *_change("Receitas", result["income"], money=True),
            *_change("Transações", count, money=False),
        ]
        moved = [item for item in result["categories"] if item["direction"] != "equal"]
        for item in moved[:TOP_CATEGORIES]:
            facts.append(
                Fact(
                    label=f"Variação em {item['category']}",
                    value=item["change"],
                    kind="signed_money",
                )
            )
        link = _link(*period)

    elif tool == "search_transactions":
        assert period is not None
        ids = _category_ids(session)
        has_data = result["total_count"] > 0
        category = arguments.get("category")
        link = _link(
            *period,
            q=(arguments.get("text") or "").strip() or None,
            type=arguments.get("type"),
            category_id=ids.get(category.strip().lower()) if category else None,
        )
        facts = [
            Fact(label="Transações encontradas", value=str(result["total_count"]), kind="count")
        ]
        labels = {"debit": "Total em despesas", "credit": "Total em receitas"}
        labels["transfer"] = "Total em transferências"
        for kind, label in labels.items():
            total = result["totals_by_type"][kind]
            if total["count"]:
                facts.append(
                    Fact(
                        label=label,
                        value=total["amount"],
                        kind="money",
                        detail=f"{total['count']} transação(ões)",
                    )
                )
        transactions = [
            EvidenceTransaction(
                id=row["id"],
                date=row["date"],
                title=row["merchant"] or row["description"],
                amount=row["amount"],
                type=row["type"],
            )
            for row in result["transactions"]
        ]

    elif tool == "list_categories":
        has_data = bool(result["categories"])
        facts = [Fact(label="Categorias", value=str(len(result["categories"])), kind="count")]

    return ToolEvidence(
        tool=tool,
        title=title,
        source=source,
        arguments=arguments,
        period=DateRange(start_date=period[0], end_date=period[1]) if period else None,
        comparison_period=comparison_period,
        has_data=has_data,
        facts=facts,
        transactions_link=link,
        transactions=transactions,
        result=result,
    )

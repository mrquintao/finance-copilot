"""Deterministic fake data, April–September 2026. Safe to run more than once."""

from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import NAMESPACE_URL, UUID, uuid5

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.config import database_url
from app.db.models import Account, Category, Transaction
from app.db.session import make_engine

CATEGORIES = (
    "Alimentação",
    "Transporte",
    "Mercado",
    "Saúde",
    "Assinaturas",
    "Lazer",
    "Moradia",
    "Compras",
    "Receita",
    "Outros",
)

# Day, merchant, description, amount, category, subcategory, type, recurring.
ENTRIES = (
    (1, "Empresa Exemplo", "Salário mensal", "7500.00", "Receita", "Salário", "credit", True),
    (2, "Imobiliária Exemplo", "Aluguel", "1800.00", "Moradia", "Aluguel", "debit", True),
    (3, "Pão de Açúcar", "Supermercado", "324.57", "Mercado", None, "debit", False),
    (4, "Uber", "Viagem ao trabalho", "27.90", "Transporte", "Aplicativo", "debit", False),
    (5, "Netflix", "Assinatura mensal", "39.90", "Assinaturas", "Streaming", "debit", True),
    (6, "iFood", "Jantar em casa", "62.45", "Alimentação", "Delivery", "debit", False),
    (7, "Drogasil", "Farmácia", "87.63", "Saúde", "Farmácia", "debit", False),
    (8, "Smart Fit", "Mensalidade academia", "119.90", "Saúde", "Academia", "debit", True),
    (9, "Enel", "Conta de energia", "143.28", "Moradia", "Energia", "debit", True),
    (10, "Vivo", "Internet residencial", "99.90", "Moradia", "Internet", "debit", True),
    (11, "Restaurante da Praça", "Almoço", "48.70", "Alimentação", "Restaurante", "debit", False),
    (12, "Posto Ipiranga", "Combustível", "210.00", "Transporte", "Combustível", "debit", False),
    (14, "Carrefour", "Compras da semana", "256.81", "Mercado", None, "debit", False),
    (
        15,
        "Banco Exemplo",
        "Transferência entre contas próprias",
        "500.00",
        "Outros",
        None,
        "transfer",
        False,
    ),
    (16, "Amazon", "Compra de livros", "89.90", "Compras", "Livros", "debit", False),
    (18, "Cinemark", "Cinema", "54.00", "Lazer", "Cinema", "debit", False),
    (20, "Spotify", "Assinatura de música", "21.90", "Assinaturas", "Streaming", "debit", True),
    (22, "Uber", "Viagem de volta", "32.15", "Transporte", "Aplicativo", "debit", False),
    (24, None, "Compra sem categoria", "17.35", None, None, "debit", False),
    (26, "Cliente Exemplo", "Trabalho autônomo", "650.00", "Receita", "Freelance", "credit", False),
    (28, "Padaria São Paulo", "Café da manhã", "23.40", "Alimentação", "Padaria", "debit", False),
)


def stable_id(name: str) -> UUID:
    return uuid5(NAMESPACE_URL, f"finance-copilot/mvp-0.1/{name}")


def seed_database(session: Session) -> int:
    account_id = stable_id("account/demo")
    session.execute(
        insert(Account)
        .values(
            id=account_id,
            name="Conta pessoal (exemplo)",
            institution="Banco Exemplo",
            currency="BRL",
        )
        .on_conflict_do_nothing(index_elements=[Account.id])
    )
    for name in CATEGORIES:
        session.execute(
            insert(Category)
            .values(
                id=stable_id(f"category/{name}"),
                name=name,
            )
            .on_conflict_do_nothing(index_elements=[Category.id])
        )

    inserted = 0
    for month in range(4, 10):
        for number, (
            day,
            merchant,
            description,
            amount,
            category,
            subcategory,
            kind,
            recurring,
        ) in enumerate(ENTRIES):
            external_id = f"demo-2026-{month:02d}-{number:02d}"
            value = Decimal(amount)
            # Small deterministic variation makes month filters useful.
            if kind == "debit" and not recurring:
                value += Decimal(month - 4) * Decimal("3.17")
            timestamp = datetime(2026, month, day, 12, tzinfo=UTC)
            result = session.execute(
                insert(Transaction)
                .values(
                    id=stable_id(external_id),
                    external_id=external_id,
                    account_id=account_id,
                    date=date(2026, month, day),
                    description=description,
                    merchant=merchant,
                    amount=value,
                    currency="BRL",
                    type=kind,
                    category_id=stable_id(f"category/{category}") if category else None,
                    subcategory=subcategory,
                    is_recurring=recurring,
                    created_at=timestamp,
                    updated_at=timestamp,
                )
                .on_conflict_do_nothing(index_elements=[Transaction.id])
                .returning(Transaction.id)
            )
            inserted += int(result.scalar_one_or_none() is not None)
    return inserted


def main() -> None:
    engine = make_engine(database_url())
    try:
        with Session(engine) as session, session.begin():
            count = seed_database(session)
        print(f"Seed complete: {count} demo transactions inserted.")
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()

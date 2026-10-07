"""Demo-only dataset: deterministic fake data, April–September 2026.

This is for screenshots, manual checks and tests on a database without real data. It is not
a setup step. Seeding refuses to run next to provider-imported accounts, and ``clean`` removes
exactly what the seed created and nothing else.

    python -m app.db.seed                 insert the demo dataset (idempotent)
    python -m app.db.seed clean --dry-run report what clean would remove
    python -m app.db.seed clean           remove the demo dataset
"""

import argparse
import sys
from dataclasses import dataclass
from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import NAMESPACE_URL, UUID, uuid5

from sqlalchemy import delete, func, select
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
DEMO_MONTHS = range(4, 10)


def stable_id(name: str) -> UUID:
    return uuid5(NAMESPACE_URL, f"finance-copilot/mvp-0.1/{name}")


# The demo dataset is recognized by these ids and by nothing else: not by names, not by
# "provider IS NULL". A provider-imported or manually created row gets a random uuid4, so it
# cannot collide with them.
DEMO_ACCOUNT_ID = stable_id("account/demo")


def demo_external_id(month: int, number: int) -> str:
    return f"demo-2026-{month:02d}-{number:02d}"


DEMO_TRANSACTION_IDS = frozenset(
    stable_id(demo_external_id(month, number))
    for month in DEMO_MONTHS
    for number in range(len(ENTRIES))
)


class DemoDataError(RuntimeError):
    """The requested demo operation was refused; nothing was changed."""


@dataclass(frozen=True, slots=True)
class DemoCleanup:
    transactions: int
    accounts: int


def seed_database(session: Session, *, allow_provider_data: bool = False) -> int:
    provider_accounts = session.scalar(
        select(func.count()).select_from(Account).where(Account.provider.is_not(None))
    )
    if provider_accounts and not allow_provider_data:
        raise DemoDataError(
            "Refusing to insert demo data: this database already contains provider-backed "
            "accounts. Use --allow-provider-data only on a development database, on purpose."
        )

    session.execute(
        insert(Account)
        .values(
            id=DEMO_ACCOUNT_ID,
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
            .on_conflict_do_nothing()
        )
    # Synchronization may already have created a category with the same name under another
    # id; the demo rows then point at that existing row.
    category_ids = dict(session.execute(select(Category.name, Category.id)).all())

    inserted = 0
    for month in DEMO_MONTHS:
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
            external_id = demo_external_id(month, number)
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
                    account_id=DEMO_ACCOUNT_ID,
                    date=date(2026, month, day),
                    description=description,
                    merchant=merchant,
                    amount=value,
                    currency="BRL",
                    type=kind,
                    category_id=category_ids[category] if category else None,
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


def remove_demo_data(session: Session, *, dry_run: bool = False) -> DemoCleanup:
    """Delete the demo account and its demo transactions, identified by their fixed ids.

    Categories are left alone: synchronization reuses them by name, so real transactions may
    point at rows the seed created. Anything unexpected aborts before the first delete.
    """
    account = session.get(Account, DEMO_ACCOUNT_ID)
    if account is not None and (
        account.provider is not None
        or account.provider_item_id is not None
        or account.provider_account_id is not None
    ):
        raise DemoDataError(
            "Aborting: the account with the demo id is linked to a provider. Nothing was removed."
        )

    in_demo_account = set(
        session.scalars(select(Transaction.id).where(Transaction.account_id == DEMO_ACCOUNT_ID))
    )
    if in_demo_account - DEMO_TRANSACTION_IDS:
        raise DemoDataError(
            "Aborting: the demo account holds transactions the seed did not create. "
            "Nothing was removed."
        )
    elsewhere = session.scalar(
        select(func.count())
        .select_from(Transaction)
        .where(
            Transaction.id.in_(DEMO_TRANSACTION_IDS),
            Transaction.account_id != DEMO_ACCOUNT_ID,
        )
    )
    if elsewhere:
        raise DemoDataError(
            "Aborting: demo transactions were moved to another account. Nothing was removed."
        )

    result = DemoCleanup(transactions=len(in_demo_account), accounts=int(account is not None))
    if dry_run:
        return result
    if in_demo_account:
        # Both conditions on purpose: the fixed account and the fixed transaction ids.
        session.execute(
            delete(Transaction).where(
                Transaction.account_id == DEMO_ACCOUNT_ID,
                Transaction.id.in_(DEMO_TRANSACTION_IDS),
            )
        )
    if account is not None:
        session.execute(delete(Account).where(Account.id == DEMO_ACCOUNT_ID))
    return result


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        description="Insert or remove the demo-only dataset (fake data, never real accounts)."
    )
    parser.add_argument("action", nargs="?", choices=["seed", "clean"], default="seed")
    parser.add_argument(
        "--allow-provider-data",
        action="store_true",
        help="seed even though provider-backed accounts exist (development databases only)",
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="clean: only report what would be removed"
    )
    args = parser.parse_args(argv)

    engine = make_engine(database_url())
    try:
        with Session(engine) as session, session.begin():
            if args.action == "seed":
                count = seed_database(session, allow_provider_data=args.allow_provider_data)
                print(f"Seed complete: {count} demo transactions inserted.")
                return
            removed = remove_demo_data(session, dry_run=args.dry_run)
            verb = "Would remove" if args.dry_run else "Removed"
            print(
                f"{verb} {removed.transactions} demo transactions "
                f"and {removed.accounts} demo account."
            )
            print("Real provider data was not modified.")
    except DemoDataError as error:
        print(error, file=sys.stderr)
        raise SystemExit(1) from None
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()

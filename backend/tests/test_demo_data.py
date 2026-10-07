"""The demo dataset must be removable without touching anything it did not create."""

from datetime import date
from decimal import Decimal
from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select

from app.db.models import Account, Category, SyncRun, Transaction
from app.db.seed import (
    CATEGORIES,
    DEMO_ACCOUNT_ID,
    DEMO_TRANSACTION_IDS,
    DemoCleanup,
    DemoDataError,
    remove_demo_data,
    seed_database,
    stable_id,
)

LEGACY_VALUES = (
    "Cliente Exemplo",
    "Empresa Exemplo",
    "Imobiliária Exemplo",
    "Banco Exemplo",
    "Conta pessoal (exemplo)",
    "Trabalho autônomo",
)
SEPTEMBER = {"start_date": "2026-09-01", "end_date": "2026-09-30"}


def count(session, model) -> int:
    return session.scalar(select(func.count()).select_from(model))


@pytest.fixture
def provider_data(session):
    """A Pluggy account with transactions that share category rows the seed may have created."""
    account = Account(
        name="Conta corrente",
        institution="MeuPluggy",
        provider="pluggy",
        provider_item_id="item-real",
        provider_account_id="acc-real",
    )
    session.add(account)
    food = session.scalar(select(Category).where(Category.name == "Alimentação"))
    if food is None:
        food = Category(name="Alimentação")
        session.add(food)
    rows = [
        ("real-1", "2026-09-03", "45.50", "debit", "Mercearia da esquina", food),
        ("real-2", "2026-09-05", "3200.00", "credit", "Pagamento recebido", None),
        ("real-3", "2026-09-26", "650.00", "credit", "Pix recebido", None),
    ]
    transactions = [
        Transaction(
            external_id=external_id,
            account=account,
            date=date.fromisoformat(day),
            description=description,
            amount=Decimal(amount),
            currency="BRL",
            type=kind,
            category=category,
        )
        for external_id, day, amount, kind, description, category in rows
    ]
    run = SyncRun(provider="pluggy", item_id="item-real", status="succeeded")
    session.add_all([*transactions, run])
    session.flush()
    return {
        "account_id": account.id,
        "transaction_ids": {t.id for t in transactions},
        "run_id": run.id,
        "category_id": food.id,
    }


def all_transactions(client) -> list[dict]:
    page = client.get("/transactions", params={"limit": 100}).json()
    assert page["total"] == len(page["items"])
    return page["items"]


def test_demo_ids_are_the_fixed_seed_ids(session):
    assert seed_database(session) == 126
    assert len(DEMO_TRANSACTION_IDS) == 126
    # Pinned: changing the id scheme would orphan demo rows already in someone's database.
    assert DEMO_ACCOUNT_ID == UUID("68cbcabe-b90e-5784-a92c-e24c44637e72")
    assert set(session.scalars(select(Transaction.id))) == DEMO_TRANSACTION_IDS
    assert set(session.scalars(select(Transaction.account_id))) == {DEMO_ACCOUNT_ID}
    assert session.get(Account, DEMO_ACCOUNT_ID).provider is None


def test_cleanup_removes_only_demo_rows_and_keeps_provider_data(session, client, provider_data):
    seed_database(session, allow_provider_data=True)
    assert count(session, Transaction) == 129
    # Before cleanup the demo rows really do leak into the API.
    assert any(
        value in client.get("/transactions", params=SEPTEMBER).text for value in LEGACY_VALUES
    )

    removed = remove_demo_data(session)
    session.expire_all()

    assert removed == DemoCleanup(transactions=126, accounts=1)
    # Demo account and demo transactions are gone.
    assert session.get(Account, DEMO_ACCOUNT_ID) is None
    assert (
        session.scalar(
            select(func.count())
            .select_from(Transaction)
            .where(Transaction.id.in_(DEMO_TRANSACTION_IDS))
        )
        == 0
    )
    assert (
        session.scalar(
            select(func.count())
            .select_from(Transaction)
            .where(Transaction.external_id.like("demo-%"))
        )
        == 0
    )
    # Provider account, its transactions, the sync run and the shared category are intact.
    account = session.get(Account, provider_data["account_id"])
    assert (account.provider, account.provider_item_id) == ("pluggy", "item-real")
    assert set(session.scalars(select(Transaction.id))) == provider_data["transaction_ids"]
    assert session.get(SyncRun, provider_data["run_id"]).status == "succeeded"
    assert session.get(Category, provider_data["category_id"]).name == "Alimentação"
    categorized = session.scalar(select(Transaction).where(Transaction.external_id == "real-1"))
    assert categorized.category_id == provider_data["category_id"]
    # Categories are never deleted, used or not.
    assert set(session.scalars(select(Category.name))) == set(CATEGORIES)


def test_no_legacy_value_reaches_the_api_after_cleanup(session, client, provider_data):
    seed_database(session, allow_provider_data=True)
    remove_demo_data(session)

    transactions = all_transactions(client)
    assert {t["external_id"] for t in transactions} == {"real-1", "real-2", "real-3"}
    assert {t["account"]["institution"] for t in transactions} == {"MeuPluggy"}

    summary = client.get("/analytics/spending-summary", params=SEPTEMBER).json()
    assert summary["total_spending"] == "45.50"
    assert summary["total_income"] == "3850.00"
    assert summary["transaction_count"] == 3
    by_category = client.get("/analytics/spending-by-category", params=SEPTEMBER).json()
    assert [(i["category"], i["amount"]) for i in by_category["items"]] == [
        ("Alimentação", "45.50")
    ]

    everything = (
        client.get("/transactions", params={"limit": 100}).text
        + client.get("/analytics/spending-summary").text
        + client.get("/analytics/spending-by-category").text
        + client.get("/categories").text
    )
    for value in LEGACY_VALUES:
        assert value not in everything
    # The real R$ 650,00 credit on the same day as the demo "Cliente Exemplo" one survives.
    assert any(t["amount"] == "650.00" and t["date"] == "2026-09-26" for t in transactions)


def test_cleanup_is_idempotent(session, provider_data):
    seed_database(session, allow_provider_data=True)

    assert remove_demo_data(session) == DemoCleanup(transactions=126, accounts=1)
    assert remove_demo_data(session) == DemoCleanup(transactions=0, accounts=0)
    assert count(session, Transaction) == 3
    assert count(session, Account) == 1


def test_cleanup_without_demo_data_changes_nothing(session, provider_data):
    assert remove_demo_data(session) == DemoCleanup(transactions=0, accounts=0)
    assert count(session, Transaction) == 3
    assert count(session, Account) == 1
    assert count(session, SyncRun) == 1


def test_dry_run_reports_without_deleting(session):
    seed_database(session)

    assert remove_demo_data(session, dry_run=True) == DemoCleanup(transactions=126, accounts=1)
    assert count(session, Transaction) == 126
    assert session.get(Account, DEMO_ACCOUNT_ID) is not None


def test_cleanup_removes_a_partially_deleted_demo_dataset(session):
    seed_database(session)
    some = next(iter(DEMO_TRANSACTION_IDS))
    session.delete(session.get(Transaction, some))
    session.flush()

    assert remove_demo_data(session) == DemoCleanup(transactions=125, accounts=1)
    assert count(session, Transaction) == 0


def test_cleanup_keeps_local_accounts_that_are_not_the_demo_account(session):
    """provider IS NULL is not what identifies demo data."""
    seed_database(session)
    manual = Account(name="Carteira", institution="Dinheiro")
    session.add(manual)
    session.add(
        Transaction(
            external_id="demo-2026-09-00",  # even a look-alike external id is not enough
            account=manual,
            date=date(2026, 9, 1),
            description="Cliente Exemplo",
            merchant="Banco Exemplo",
            amount=Decimal("650.00"),
            currency="BRL",
            type="credit",
        )
    )
    session.flush()

    remove_demo_data(session)

    assert [a.name for a in session.scalars(select(Account))] == ["Carteira"]
    kept = session.scalars(select(Transaction)).all()
    assert [(t.description, t.account_id) for t in kept] == [("Cliente Exemplo", manual.id)]


def test_cleanup_aborts_when_the_demo_account_holds_other_transactions(session):
    seed_database(session)
    session.add(
        Transaction(
            id=uuid4(),
            external_id="not-from-the-seed",
            account_id=DEMO_ACCOUNT_ID,
            date=date(2026, 9, 2),
            description="Lançamento manual",
            amount=Decimal("10.00"),
            currency="BRL",
            type="debit",
        )
    )
    session.flush()

    with pytest.raises(DemoDataError, match="Nothing was removed"):
        remove_demo_data(session)
    assert count(session, Transaction) == 127
    assert session.get(Account, DEMO_ACCOUNT_ID) is not None


def test_cleanup_aborts_when_the_demo_id_belongs_to_a_provider_account(session):
    session.add(
        Account(
            id=DEMO_ACCOUNT_ID,
            name="Conta real",
            institution="MeuPluggy",
            provider="pluggy",
            provider_item_id="item-real",
            provider_account_id="acc-real",
        )
    )
    session.flush()

    with pytest.raises(DemoDataError, match="linked to a provider"):
        remove_demo_data(session)
    assert session.get(Account, DEMO_ACCOUNT_ID) is not None


def test_seeding_is_refused_next_to_provider_accounts(session, provider_data):
    with pytest.raises(DemoDataError, match="Refusing to insert demo data"):
        seed_database(session)

    assert count(session, Transaction) == 3
    assert session.get(Account, DEMO_ACCOUNT_ID) is None
    assert session.get(Category, stable_id("category/Outros")) is None


def test_seeding_next_to_provider_accounts_needs_the_explicit_override(session, provider_data):
    assert seed_database(session, allow_provider_data=True) == 126


def test_seeding_is_allowed_next_to_local_accounts(session):
    session.add(Account(name="Carteira", institution="Dinheiro"))
    session.flush()

    assert seed_database(session) == 126

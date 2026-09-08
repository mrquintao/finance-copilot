from collections.abc import Iterator
from datetime import date
from decimal import Decimal
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.core.config import database_url
from app.db.models import Account, Category, Transaction
from app.db.session import get_session
from app.main import create_app


def migration_config(connection) -> Config:
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    config.attributes["connection"] = connection
    return config


@pytest.fixture(scope="session")
def engine():
    # Explicit opt-in URL. Only the randomly generated schema below is ever dropped.
    url = database_url("TEST_DATABASE_URL")
    admin = create_engine(url, hide_parameters=True)
    schema = f"test_{uuid4().hex}"
    with admin.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    test_engine = create_engine(
        url,
        hide_parameters=True,
        connect_args={"options": f"-csearch_path={schema}"},
    )
    try:
        with test_engine.begin() as connection:
            command.upgrade(migration_config(connection), "head")
        yield test_engine
    finally:
        test_engine.dispose()
        with admin.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()


@pytest.fixture
def session(engine) -> Iterator[Session]:
    with engine.connect() as connection:
        transaction = connection.begin()
        with Session(bind=connection, join_transaction_mode="create_savepoint") as session:
            yield session
        transaction.rollback()


@pytest.fixture
def records(session):
    account = Account(id=UUID(int=1), name="Conta de teste", institution="Banco Fake")
    food = Category(id=UUID(int=2), name="Alimentação")
    transport = Category(id=UUID(int=3), name="Transporte")
    session.add_all([account, food, transport])
    session.flush()
    rows = [
        (10, "2026-04-30", "99.99", "debit", food),
        (11, "2026-05-01", "0.10", "debit", food),
        (12, "2026-05-01", "0.20", "debit", food),
        (13, "2026-05-15", "20.15", "debit", transport),
        (14, "2026-05-31", "5.05", "debit", None),
        (15, "2026-05-20", "1000.00", "credit", food),
        (16, "2026-05-21", "300.00", "transfer", transport),
        (17, "2026-06-01", "42.00", "debit", food),
    ]
    transactions = [
        Transaction(
            id=UUID(int=number),
            external_id=f"test-{number}",
            account=account,
            date=date.fromisoformat(day),
            description=f"Compra teste {number}",
            merchant="Loja Fake",
            amount=Decimal(amount),
            currency="BRL",
            type=kind,
            category=category,
            is_recurring=False,
        )
        for number, day, amount, kind, category in rows
    ]
    session.add_all(transactions)
    session.flush()
    return transactions


@pytest.fixture
def client(session, monkeypatch):
    # Lifespan still runs. Every request uses the test's savepoint-bound session.
    monkeypatch.setenv(
        "DATABASE_URL", database_url("TEST_DATABASE_URL").render_as_string(hide_password=False)
    )
    app = create_app()
    app.dependency_overrides[get_session] = lambda: session
    with TestClient(app) as client:
        yield client

import json
from datetime import date
from decimal import Decimal
from uuid import UUID

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from pydantic import TypeAdapter, ValidationError
from sqlalchemy import func, inspect, select, text
from sqlalchemy.exc import IntegrityError, StatementError

from app.analytics.queries import get_spending_summary
from app.core.filters import Period
from app.core.money import Money
from app.db.models import Base, Transaction
from app.db.seed import seed_database
from tests.conftest import migration_config


def test_migration_matches_models_and_roundtrips(engine):
    with engine.begin() as connection:
        context = MigrationContext.configure(connection, opts={"compare_type": True})
        assert compare_metadata(context, Base.metadata) == []
        assert connection.scalar(text("SELECT version_num FROM alembic_version")) == "0001"
        command.downgrade(migration_config(connection), "base")
        assert set(inspect(connection).get_table_names()) == {"alembic_version"}
        command.upgrade(migration_config(connection), "head")
        assert set(inspect(connection).get_table_names()) == {
            "accounts",
            "categories",
            "transactions",
            "alembic_version",
        }


def test_seed_is_deterministic_and_idempotent(session):
    assert seed_database(session) == 126
    before = list(
        session.execute(select(Transaction.id, Transaction.amount).order_by(Transaction.id))
    )
    assert seed_database(session) == 0
    assert (
        list(session.execute(select(Transaction.id, Transaction.amount).order_by(Transaction.id)))
        == before
    )
    assert session.scalar(select(func.count()).select_from(Transaction)) == 126
    assert session.scalar(select(func.min(Transaction.date))) == date(2026, 4, 1)
    assert session.scalar(select(func.max(Transaction.date))) == date(2026, 9, 28)
    summary = get_spending_summary(session, Period(date(2026, 4, 1), date(2026, 4, 30)))
    assert summary.total_spending == Decimal("3459.74")
    assert summary.total_income == Decimal("8150.00")
    assert summary.transaction_count == 21


def test_money_roundtrip_large_amount_and_timestamps(session, client, records):
    record = records[1]
    created = record.created_at
    record.amount = Decimal("9999999999999999.99")
    session.flush()
    session.expire(record)
    assert record.amount == Decimal("9999999999999999.99")
    assert record.created_at == created
    assert record.updated_at.tzinfo is not None
    response = client.get(f"/transactions/{record.id}")
    assert response.status_code == 200
    assert response.json()["amount"] == "9999999999999999.99"


@pytest.mark.parametrize(
    "value",
    [
        "-0.01",
        "0.001",
        "NaN",
        "Infinity",
        "-Infinity",
        "1e999",
        "invalid",
        True,
        # Deliberately parse a JSON numeric token to prove binary money is rejected.
        json.loads("0.1"),
    ],
)
def test_invalid_money_is_rejected_by_schema(value):
    with pytest.raises(ValidationError):
        TypeAdapter(Money).validate_python(value)


def test_money_serialization_normalizes_negative_zero():
    adapter = TypeAdapter(Money)
    assert adapter.dump_json(adapter.validate_python("-0.00")) == b'"0.00"'


@pytest.mark.parametrize(
    "value",
    [
        Decimal("-0.01"),
        Decimal("0.001"),
        Decimal("NaN"),
        Decimal("10000000000000000.00"),
        json.loads("0.1"),
    ],
)
def test_invalid_money_is_rejected_before_database_rounding(session, records, value):
    records[0].amount = value
    with pytest.raises(StatementError):
        session.flush()


@pytest.mark.parametrize(
    "column,value",
    [
        ("amount", "-0.01"),
        ("amount", "NaN"),
        ("currency", "USD"),
        ("type", "unknown"),
        ("account_id", str(UUID(int=999))),
    ],
)
def test_database_constraints_cannot_be_bypassed(session, records, column, value):
    with pytest.raises(IntegrityError):
        session.execute(
            text(f"UPDATE transactions SET {column} = :value WHERE id = :id"),
            {
                "value": value,
                "id": records[0].id,
            },
        )


def test_external_id_unique_within_account(session, records):
    records[1].external_id = records[0].external_id
    with pytest.raises(IntegrityError):
        session.flush()

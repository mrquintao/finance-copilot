from datetime import date, datetime
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from app.core.money import MoneyColumn


class Base(DeclarativeBase):
    metadata = MetaData(
        naming_convention={
            "ix": "ix_%(table_name)s_%(column_0_name)s",
            "uq": "uq_%(table_name)s_%(column_0_name)s",
            "ck": "ck_%(table_name)s_%(constraint_name)s",
            "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
            "pk": "pk_%(table_name)s",
        }
    )


class Account(Base):
    __tablename__ = "accounts"
    __table_args__ = (
        CheckConstraint("currency = 'BRL'", name="currency_brl"),
        UniqueConstraint("provider", "provider_account_id"),
        Index("ix_accounts_provider_item_id", "provider", "provider_item_id"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(100))
    institution: Mapped[str] = mapped_column(String(100))
    currency: Mapped[str] = mapped_column(String(3), default="BRL")
    provider: Mapped[str | None] = mapped_column(String(40))
    provider_item_id: Mapped[str | None] = mapped_column(String(100))
    provider_account_id: Mapped[str | None] = mapped_column(String(100))


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(80), unique=True)


class Transaction(Base):
    __tablename__ = "transactions"
    __table_args__ = (
        UniqueConstraint("account_id", "external_id"),
        CheckConstraint("amount >= 0 AND amount <> 'NaN'::numeric", name="amount_nonnegative"),
        CheckConstraint("currency = 'BRL'", name="currency_brl"),
        CheckConstraint("type IN ('debit', 'credit', 'transfer')", name="type_valid"),
        Index("ix_transactions_date_id", "date", "id"),
        Index("ix_transactions_category_id_date", "category_id", "date"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    external_id: Mapped[str | None] = mapped_column(String(150))
    account_id: Mapped[UUID] = mapped_column(ForeignKey("accounts.id", ondelete="RESTRICT"))
    date: Mapped[date] = mapped_column(Date)
    description: Mapped[str] = mapped_column(String(300))
    merchant: Mapped[str | None] = mapped_column(String(150))
    amount: Mapped[Decimal] = mapped_column(MoneyColumn())
    currency: Mapped[str] = mapped_column(String(3), default="BRL")
    type: Mapped[str] = mapped_column(String(8))
    category_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL")
    )
    subcategory: Mapped[str | None] = mapped_column(String(100))
    is_recurring: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    account: Mapped[Account] = relationship()
    category: Mapped[Category | None] = relationship()


class SyncRun(Base):
    __tablename__ = "sync_runs"
    __table_args__ = (
        CheckConstraint("status IN ('running', 'succeeded', 'failed')", name="status_valid"),
        Index("ix_sync_runs_started_at", "started_at"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    provider: Mapped[str] = mapped_column(String(40))
    item_id: Mapped[str] = mapped_column(String(100))
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(16), default="running")
    accounts_received: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    transactions_received: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    transactions_created: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    transactions_updated: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    error: Mapped[str | None] = mapped_column(Text)

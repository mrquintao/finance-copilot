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
    MetaData,
    String,
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
    __table_args__ = (CheckConstraint("currency = 'BRL'", name="currency_brl"),)

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(100))
    institution: Mapped[str] = mapped_column(String(100))
    currency: Mapped[str] = mapped_column(String(3), default="BRL")


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

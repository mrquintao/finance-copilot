"""MVP accounts, categories and exact BRL transactions."""

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "accounts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("institution", sa.String(100), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_accounts"),
        sa.CheckConstraint("currency = 'BRL'", name="ck_accounts_currency_brl"),
    )
    op.create_table(
        "categories",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(80), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_categories"),
        sa.UniqueConstraint("name", name="uq_categories_name"),
    )
    op.create_table(
        "transactions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("external_id", sa.String(150)),
        sa.Column("account_id", sa.Uuid(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("description", sa.String(300), nullable=False),
        sa.Column("merchant", sa.String(150)),
        sa.Column("amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("type", sa.String(8), nullable=False),
        sa.Column("category_id", sa.Uuid()),
        sa.Column("subcategory", sa.String(100)),
        sa.Column("is_recurring", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("id", name="pk_transactions"),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["accounts.id"],
            ondelete="RESTRICT",
            name="fk_transactions_account_id_accounts",
        ),
        sa.ForeignKeyConstraint(
            ["category_id"],
            ["categories.id"],
            ondelete="SET NULL",
            name="fk_transactions_category_id_categories",
        ),
        sa.UniqueConstraint("account_id", "external_id", name="uq_transactions_account_id"),
        sa.CheckConstraint(
            "amount >= 0 AND amount <> 'NaN'::numeric", name="ck_transactions_amount_nonnegative"
        ),
        sa.CheckConstraint("currency = 'BRL'", name="ck_transactions_currency_brl"),
        sa.CheckConstraint(
            "type IN ('debit', 'credit', 'transfer')", name="ck_transactions_type_valid"
        ),
    )
    op.create_index("ix_transactions_date_id", "transactions", ["date", "id"])
    op.create_index("ix_transactions_category_id_date", "transactions", ["category_id", "date"])


def downgrade() -> None:
    op.drop_table("transactions")
    op.drop_table("categories")
    op.drop_table("accounts")

"""Open Finance account metadata and synchronization history."""

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("accounts", sa.Column("provider", sa.String(40), nullable=True))
    op.add_column("accounts", sa.Column("provider_item_id", sa.String(100), nullable=True))
    op.add_column("accounts", sa.Column("provider_account_id", sa.String(100), nullable=True))
    op.create_unique_constraint(
        "uq_accounts_provider", "accounts", ["provider", "provider_account_id"]
    )
    op.create_index(
        "ix_accounts_provider_item_id", "accounts", ["provider", "provider_item_id"]
    )

    op.create_table(
        "sync_runs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("provider", sa.String(40), nullable=False),
        sa.Column("item_id", sa.String(100), nullable=False),
        sa.Column(
            "started_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("accounts_received", sa.Integer(), server_default="0", nullable=False),
        sa.Column("transactions_received", sa.Integer(), server_default="0", nullable=False),
        sa.Column("transactions_created", sa.Integer(), server_default="0", nullable=False),
        sa.Column("transactions_updated", sa.Integer(), server_default="0", nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id", name="pk_sync_runs"),
        sa.CheckConstraint(
            "status IN ('running', 'succeeded', 'failed')",
            name="ck_sync_runs_status_valid",
        ),
    )
    op.create_index("ix_sync_runs_started_at", "sync_runs", ["started_at"])


def downgrade() -> None:
    op.drop_table("sync_runs")
    op.drop_index("ix_accounts_provider_item_id", table_name="accounts")
    op.drop_constraint("uq_accounts_provider", "accounts", type_="unique")
    op.drop_column("accounts", "provider_account_id")
    op.drop_column("accounts", "provider_item_id")
    op.drop_column("accounts", "provider")

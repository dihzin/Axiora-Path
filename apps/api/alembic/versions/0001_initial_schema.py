"""initial schema

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-02-17 00:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0001_initial_schema"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


tenant_type_enum = sa.Enum("FAMILY", "SCHOOL", name="tenant_type")
membership_role_enum = sa.Enum("PARENT", "TEACHER", "CHILD", name="membership_role")
task_difficulty_enum = sa.Enum("EASY", "MEDIUM", "HARD", "LEGENDARY", name="task_difficulty")
task_log_status_enum = sa.Enum("PENDING", "APPROVED", "REJECTED", name="task_log_status")
ledger_transaction_type_enum = sa.Enum(
    "EARN",
    "SPEND",
    "ADJUST",
    "ALLOWANCE",
    "LOAN",
    name="ledger_transaction_type",
)
pot_type_enum = sa.Enum("SPEND", "SAVE", "DONATE", name="pot_type")


def upgrade() -> None:
    bind = op.get_bind()
    tenant_type_enum.create(bind, checkfirst=True)
    membership_role_enum.create(bind, checkfirst=True)
    task_difficulty_enum.create(bind, checkfirst=True)
    task_log_status_enum.create(bind, checkfirst=True)
    ledger_transaction_type_enum.create(bind, checkfirst=True)
    pot_type_enum.create(bind, checkfirst=True)

    op.create_table(
        "tenants",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("type", tenant_type_enum, nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("slug", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug"),
    )

    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )

    op.create_table(
        "child_profiles",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("display_name", sa.String(length=255), nullable=False),
        sa.Column("avatar_key", sa.String(length=255), nullable=True),
        sa.Column("birth_year", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "memberships",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("role", membership_role_enum, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_memberships_tenant_id_created_at", "memberships", ["tenant_id", "created_at"])

    op.create_table(
        "tasks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("difficulty", task_difficulty_enum, nullable=False),
        sa.Column("weight", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "wallets",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("child_id", sa.Integer(), nullable=False),
        sa.Column("currency_code", sa.String(length=8), server_default=sa.text("'BRL'"), nullable=False),
        sa.ForeignKeyConstraint(["child_id"], ["child_profiles.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "task_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("child_id", sa.Integer(), nullable=False),
        sa.Column("task_id", sa.Integer(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("status", task_log_status_enum, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decided_by_user_id", sa.Integer(), nullable=True),
        sa.Column("parent_comment", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["child_id"], ["child_profiles.id"]),
        sa.ForeignKeyConstraint(["decided_by_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("child_id", "task_id", "date", name="uq_task_logs_child_id_task_id_date"),
    )
    op.create_index("ix_task_logs_tenant_id_created_at", "task_logs", ["tenant_id", "created_at"])

    op.create_table(
        "pot_allocations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("wallet_id", sa.Integer(), nullable=False),
        sa.Column("pot", pot_type_enum, nullable=False),
        sa.Column("percent", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.ForeignKeyConstraint(["wallet_id"], ["wallets.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "saving_goals",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("child_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("target_cents", sa.Integer(), nullable=False),
        sa.Column("image_url", sa.String(length=500), nullable=True),
        sa.Column("is_locked", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["child_id"], ["child_profiles.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_saving_goals_tenant_id_created_at", "saving_goals", ["tenant_id", "created_at"])

    op.create_table(
        "ledger_transactions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("wallet_id", sa.Integer(), nullable=False),
        sa.Column("type", ledger_transaction_type_enum, nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column(
            "metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.ForeignKeyConstraint(["wallet_id"], ["wallets.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_ledger_transactions_tenant_id_created_at",
        "ledger_transactions",
        ["tenant_id", "created_at"],
    )

    op.create_table(
        "event_log",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("actor_user_id", sa.Integer(), nullable=True),
        sa.Column("child_id", sa.Integer(), nullable=True),
        sa.Column("type", sa.String(length=255), nullable=False),
        sa.Column(
            "payload",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["child_id"], ["child_profiles.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_event_log_tenant_id_created_at", "event_log", ["tenant_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_event_log_tenant_id_created_at", table_name="event_log")
    op.drop_table("event_log")

    op.drop_index("ix_ledger_transactions_tenant_id_created_at", table_name="ledger_transactions")
    op.drop_table("ledger_transactions")

    op.drop_index("ix_saving_goals_tenant_id_created_at", table_name="saving_goals")
    op.drop_table("saving_goals")

    op.drop_table("pot_allocations")

    op.drop_index("ix_task_logs_tenant_id_created_at", table_name="task_logs")
    op.drop_table("task_logs")

    op.drop_table("wallets")
    op.drop_table("tasks")

    op.drop_index("ix_memberships_tenant_id_created_at", table_name="memberships")
    op.drop_table("memberships")

    op.drop_table("child_profiles")
    op.drop_table("users")
    op.drop_table("tenants")

    pot_type_enum.drop(op.get_bind(), checkfirst=True)
    ledger_transaction_type_enum.drop(op.get_bind(), checkfirst=True)
    task_log_status_enum.drop(op.get_bind(), checkfirst=True)
    task_difficulty_enum.drop(op.get_bind(), checkfirst=True)
    membership_role_enum.drop(op.get_bind(), checkfirst=True)
    tenant_type_enum.drop(op.get_bind(), checkfirst=True)


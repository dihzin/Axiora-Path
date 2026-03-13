"""axion studio finance module

Revision ID: 0104_axion_studio_finance_module
Revises: 0103_school_family_link_requests
Create Date: 2026-03-12 00:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "0104_axion_studio_finance_module"
down_revision: str | None = "0103_school_family_link_requests"
branch_labels: tuple[str, ...] | None = None
depends_on: tuple[str, ...] | None = None


finance_recurrence_enum = postgresql.ENUM(
    "NONE",
    "WEEKLY",
    "MONTHLY",
    "YEARLY",
    name="axion_finance_recurrence",
)
finance_status_enum = postgresql.ENUM(
    "PENDING",
    "PAID",
    name="axion_finance_bill_status",
)
finance_recurrence_enum_inline = postgresql.ENUM(
    "NONE",
    "WEEKLY",
    "MONTHLY",
    "YEARLY",
    name="axion_finance_recurrence",
    create_type=False,
)
finance_status_enum_inline = postgresql.ENUM(
    "PENDING",
    "PAID",
    name="axion_finance_bill_status",
    create_type=False,
)


def upgrade() -> None:
    bind = op.get_bind()
    finance_recurrence_enum.create(bind, checkfirst=True)
    finance_status_enum.create(bind, checkfirst=True)

    op.create_table(
        "axion_studio_finance_balances",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("balance", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", name="uq_axion_studio_finance_balances_tenant_id"),
    )
    op.create_index(
        "ix_axion_studio_finance_balances_tenant_id",
        "axion_studio_finance_balances",
        ["tenant_id"],
        unique=False,
    )

    op.create_table(
        "axion_studio_finance_bills",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=False),
        sa.Column("category", sa.String(length=120), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("recurrence", finance_recurrence_enum_inline, nullable=False, server_default="NONE"),
        sa.Column("status", finance_status_enum_inline, nullable=False, server_default="PENDING"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_axion_studio_finance_bills_tenant_due_date",
        "axion_studio_finance_bills",
        ["tenant_id", "due_date"],
        unique=False,
    )
    op.create_index(
        "ix_axion_studio_finance_bills_tenant_status_due_date",
        "axion_studio_finance_bills",
        ["tenant_id", "status", "due_date"],
        unique=False,
    )
    op.create_index(
        "ix_axion_studio_finance_bills_tenant_created_at",
        "axion_studio_finance_bills",
        ["tenant_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_axion_studio_finance_bills_tenant_created_at", table_name="axion_studio_finance_bills")
    op.drop_index("ix_axion_studio_finance_bills_tenant_status_due_date", table_name="axion_studio_finance_bills")
    op.drop_index("ix_axion_studio_finance_bills_tenant_due_date", table_name="axion_studio_finance_bills")
    op.drop_table("axion_studio_finance_bills")

    op.drop_index("ix_axion_studio_finance_balances_tenant_id", table_name="axion_studio_finance_balances")
    op.drop_table("axion_studio_finance_balances")

    bind = op.get_bind()
    finance_status_enum.drop(bind, checkfirst=True)
    finance_recurrence_enum.drop(bind, checkfirst=True)

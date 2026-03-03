"""add content fingerprint and child content history

Revision ID: 0087_axion_content_fingerprint_history
Revises: 0086_axion_age_gating_catalog
Create Date: 2026-02-26 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision: str = "0087_axion_content_fingerprint_history"
down_revision: str | None = "0086_axion_age_gating_catalog"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("axion_content_catalog", sa.Column("content_fingerprint", sa.String(length=64), nullable=True))
    op.execute("UPDATE axion_content_catalog SET content_fingerprint = md5(content_type || ':' || subject || ':' || content_id::text) WHERE content_fingerprint IS NULL")
    op.alter_column("axion_content_catalog", "content_fingerprint", existing_type=sa.String(length=64), nullable=False)
    op.create_index("ix_axion_content_catalog_fingerprint", "axion_content_catalog", ["content_fingerprint"], unique=False)

    op.create_table(
        "child_content_history",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("child_id", sa.Integer(), sa.ForeignKey("child_profiles.id"), nullable=False),
        sa.Column("content_id", sa.Integer(), sa.ForeignKey("axion_content_catalog.content_id"), nullable=False),
        sa.Column("content_fingerprint", sa.String(length=64), nullable=False),
        sa.Column("served_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("outcome", sa.String(length=16), nullable=True),
        sa.Column("mastery_delta", sa.Numeric(6, 4), nullable=True),
    )
    op.create_index(
        "ix_child_content_history_tenant_child_served_at",
        "child_content_history",
        ["tenant_id", "child_id", "served_at"],
        unique=False,
    )
    op.create_index(
        "ix_child_content_history_fingerprint_served_at",
        "child_content_history",
        ["content_fingerprint", "served_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_child_content_history_fingerprint_served_at", table_name="child_content_history")
    op.drop_index("ix_child_content_history_tenant_child_served_at", table_name="child_content_history")
    op.drop_table("child_content_history")

    op.drop_index("ix_axion_content_catalog_fingerprint", table_name="axion_content_catalog")
    op.drop_column("axion_content_catalog", "content_fingerprint")


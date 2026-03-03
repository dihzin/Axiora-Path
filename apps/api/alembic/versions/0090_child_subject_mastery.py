"""create child_subject_mastery table

Revision ID: 0090_child_subject_mastery
Revises: 0089_axion_safe_content_seed
Create Date: 2026-02-26 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision: str = "0090_child_subject_mastery"
down_revision: str | None = "0089_axion_safe_content_seed"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "child_subject_mastery",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("child_id", sa.Integer(), sa.ForeignKey("child_profiles.id"), nullable=False),
        sa.Column("subject", sa.String(length=64), nullable=False),
        sa.Column("mastery_score", sa.Numeric(5, 4), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("tenant_id", "child_id", "subject", name="uq_child_subject_mastery_scope"),
    )
    op.create_index(
        "ix_child_subject_mastery_scope",
        "child_subject_mastery",
        ["tenant_id", "child_id", "subject"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_child_subject_mastery_scope", table_name="child_subject_mastery")
    op.drop_table("child_subject_mastery")


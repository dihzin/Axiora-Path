"""create axion content catalog with age-gating constraints

Revision ID: 0086_axion_age_gating_catalog
Revises: 0085_axion_policy_rollout_percentage
Create Date: 2026-02-26 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0086_axion_age_gating_catalog"
down_revision: str | None = "0085_axion_policy_rollout_percentage"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "axion_content_catalog",
        sa.Column("content_id", sa.Integer(), primary_key=True, autoincrement=True, nullable=False),
        sa.Column("content_type", sa.String(length=32), nullable=False),
        sa.Column("subject", sa.String(length=64), nullable=False),
        sa.Column("difficulty", sa.Integer(), nullable=False),
        sa.Column("age_min", sa.Integer(), nullable=False),
        sa.Column("age_max", sa.Integer(), nullable=False),
        sa.Column("safety_tags", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("age_min >= 3", name="ck_axion_content_catalog_age_min"),
        sa.CheckConstraint("age_max <= 18", name="ck_axion_content_catalog_age_max"),
        sa.CheckConstraint("age_min <= age_max", name="ck_axion_content_catalog_age_min_lte_age_max"),
        sa.CheckConstraint("difficulty >= 1 AND difficulty <= 10", name="ck_axion_content_catalog_difficulty_range"),
    )
    op.create_index(
        "ix_axion_content_catalog_type_subject_active",
        "axion_content_catalog",
        ["content_type", "subject", "is_active"],
    )
    op.create_index(
        "ix_axion_content_catalog_age_active",
        "axion_content_catalog",
        ["age_min", "age_max", "is_active"],
    )


def downgrade() -> None:
    op.drop_index("ix_axion_content_catalog_age_active", table_name="axion_content_catalog")
    op.drop_index("ix_axion_content_catalog_type_subject_active", table_name="axion_content_catalog")
    op.drop_table("axion_content_catalog")


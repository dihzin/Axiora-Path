"""add mastery_applied flag to axion_decisions

Revision ID: 0091_axion_decision_mastery_applied
Revises: 0090_child_subject_mastery
Create Date: 2026-02-26 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision: str = "0091_axion_decision_mastery_applied"
down_revision: str | None = "0090_child_subject_mastery"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "axion_decisions",
        sa.Column("mastery_applied", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )


def downgrade() -> None:
    op.drop_column("axion_decisions", "mastery_applied")


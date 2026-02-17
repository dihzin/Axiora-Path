"""add streaks and recommendations

Revision ID: 0002_streaks_recommendations
Revises: 0001_initial_schema
Create Date: 2026-02-17 00:30:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0002_streaks_recommendations"
down_revision: str | None = "0001_initial_schema"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "streaks",
        sa.Column("child_id", sa.Integer(), nullable=False),
        sa.Column("current", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("last_date", sa.Date(), nullable=True),
        sa.Column("freeze_used_today", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.ForeignKeyConstraint(["child_id"], ["child_profiles.id"]),
        sa.PrimaryKeyConstraint("child_id"),
    )

    op.create_table(
        "recommendations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("child_id", sa.Integer(), nullable=False),
        sa.Column("type", sa.String(length=100), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("severity", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("dismissed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["child_id"], ["child_profiles.id"]),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("recommendations")
    op.drop_table("streaks")


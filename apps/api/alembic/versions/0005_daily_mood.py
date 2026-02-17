"""add daily mood table

Revision ID: 0005_daily_mood
Revises: 0004_child_xp_total
Create Date: 2026-02-17 02:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0005_daily_mood"
down_revision: str | None = "0004_child_xp_total"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


mood_type_enum = postgresql.ENUM(
    "HAPPY",
    "OK",
    "SAD",
    "ANGRY",
    "TIRED",
    name="mood_type",
    create_type=False,
)


def upgrade() -> None:
    mood_type_enum.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "daily_mood",
        sa.Column("child_id", sa.Integer(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("mood", mood_type_enum, nullable=False),
        sa.ForeignKeyConstraint(["child_id"], ["child_profiles.id"]),
        sa.PrimaryKeyConstraint("child_id", "date"),
    )


def downgrade() -> None:
    op.drop_table("daily_mood")
    mood_type_enum.drop(op.get_bind(), checkfirst=True)

"""create axion profile table

Revision ID: 0016_axion_profile
Revises: 0015_child_avatar_stage
Create Date: 2026-02-17 19:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0016_axion_profile"
down_revision: str | None = "0015_child_avatar_stage"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "axion_profile",
        sa.Column("child_id", sa.Integer(), nullable=False),
        sa.Column("stage", sa.Integer(), server_default="1", nullable=False),
        sa.Column("mood_state", sa.String(length=64), server_default="NEUTRAL", nullable=False),
        sa.Column("personality_seed", sa.String(length=128), nullable=False),
        sa.Column("last_interaction_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["child_id"], ["child_profiles.id"]),
        sa.PrimaryKeyConstraint("child_id"),
    )

    op.execute(
        sa.text(
            """
            INSERT INTO axion_profile (child_id, stage, mood_state, personality_seed)
            SELECT id, 1, 'NEUTRAL', CONCAT('axion-', id::text)
            FROM child_profiles
            """
        ),
    )


def downgrade() -> None:
    op.drop_table("axion_profile")

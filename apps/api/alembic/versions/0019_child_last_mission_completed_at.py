"""add last_mission_completed_at to child_profiles

Revision ID: 0019_child_last_mission_completed_at
Revises: 0018_daily_mission_future_fields
Create Date: 2026-02-17 22:10:00
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0019_child_last_mission_completed_at"
down_revision: str | None = "0018_daily_mission_future_fields"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE child_profiles
        ADD COLUMN IF NOT EXISTS last_mission_completed_at TIMESTAMPTZ NULL;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE IF EXISTS child_profiles
        DROP COLUMN IF EXISTS last_mission_completed_at;
        """
    )

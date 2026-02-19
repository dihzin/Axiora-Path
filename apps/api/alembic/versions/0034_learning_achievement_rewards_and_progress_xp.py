"""add learning achievement rewards and lesson progress xp

Revision ID: 0034_learning_achievement_rewards_and_progress_xp
Revises: 0033_user_learning_status_energy
Create Date: 2026-02-19 17:25:00
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0034_learning_achievement_rewards_and_progress_xp"
down_revision: str | None = "0033_user_learning_status_energy"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE achievements
        ADD COLUMN IF NOT EXISTS coin_reward INTEGER NOT NULL DEFAULT 0;
        """
    )
    op.execute(
        """
        ALTER TABLE achievements
        ADD COLUMN IF NOT EXISTS badge_key VARCHAR(100) NULL;
        """
    )
    op.execute(
        """
        ALTER TABLE lesson_progress
        ADD COLUMN IF NOT EXISTS xp_granted INTEGER NOT NULL DEFAULT 0;
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE lesson_progress DROP COLUMN IF EXISTS xp_granted;")
    op.execute("ALTER TABLE achievements DROP COLUMN IF EXISTS badge_key;")
    op.execute("ALTER TABLE achievements DROP COLUMN IF EXISTS coin_reward;")

"""learning economy integration for aprender

Revision ID: 0036_learning_economy_integration
Revises: 0035_user_learning_streak
Create Date: 2026-02-19 19:05:00
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0036_learning_economy_integration"
down_revision: str | None = "0035_user_learning_streak"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE IF EXISTS game_settings
        ADD COLUMN IF NOT EXISTS max_daily_learning_xp INTEGER NOT NULL DEFAULT 200;
        """
    )
    op.execute(
        """
        ALTER TABLE IF EXISTS game_settings
        ADD COLUMN IF NOT EXISTS learning_coin_reward_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.00;
        """
    )
    op.execute(
        """
        ALTER TABLE IF EXISTS user_learning_status
        ADD COLUMN IF NOT EXISTS unit_boost_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.00;
        """
    )
    op.execute(
        """
        ALTER TABLE IF EXISTS user_learning_status
        ADD COLUMN IF NOT EXISTS unit_boost_remaining_lessons INTEGER NOT NULL DEFAULT 0;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE IF EXISTS user_learning_status
        DROP COLUMN IF EXISTS unit_boost_remaining_lessons;
        """
    )
    op.execute(
        """
        ALTER TABLE IF EXISTS user_learning_status
        DROP COLUMN IF EXISTS unit_boost_multiplier;
        """
    )
    op.execute(
        """
        ALTER TABLE IF EXISTS game_settings
        DROP COLUMN IF EXISTS learning_coin_reward_multiplier;
        """
    )
    op.execute(
        """
        ALTER TABLE IF EXISTS game_settings
        DROP COLUMN IF EXISTS max_daily_learning_xp;
        """
    )

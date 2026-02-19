"""learning parental controls for adaptive engine

Revision ID: 0039_learning_parental_controls_adaptive
Revises: 0038_adaptive_learning_foundation
Create Date: 2026-02-19 22:10:00
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0039_learning_parental_controls_adaptive"
down_revision: str | None = "0038_adaptive_learning_foundation"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE IF EXISTS learning_settings
        ADD COLUMN IF NOT EXISTS max_daily_learning_xp INTEGER NOT NULL DEFAULT 200;
        """
    )
    op.execute(
        """
        ALTER TABLE IF EXISTS learning_settings
        ADD COLUMN IF NOT EXISTS difficulty_ceiling question_difficulty NOT NULL DEFAULT 'HARD';
        """
    )
    op.execute(
        """
        ALTER TABLE IF EXISTS learning_settings
        ADD COLUMN IF NOT EXISTS enable_spaced_repetition BOOLEAN NOT NULL DEFAULT TRUE;
        """
    )
    op.execute(
        """
        ALTER TABLE IF EXISTS learning_settings
        ADD COLUMN IF NOT EXISTS enable_coins_rewards BOOLEAN NOT NULL DEFAULT TRUE;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE IF EXISTS learning_settings
        DROP COLUMN IF EXISTS enable_coins_rewards;
        """
    )
    op.execute(
        """
        ALTER TABLE IF EXISTS learning_settings
        DROP COLUMN IF EXISTS enable_spaced_repetition;
        """
    )
    op.execute(
        """
        ALTER TABLE IF EXISTS learning_settings
        DROP COLUMN IF EXISTS difficulty_ceiling;
        """
    )
    op.execute(
        """
        ALTER TABLE IF EXISTS learning_settings
        DROP COLUMN IF EXISTS max_daily_learning_xp;
        """
    )

"""create user learning streak table

Revision ID: 0035_user_learning_streak
Revises: 0034_learning_achievement_rewards_and_progress_xp
Create Date: 2026-02-19 17:50:00
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0035_user_learning_streak"
down_revision: str | None = "0034_learning_achievement_rewards_and_progress_xp"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS user_learning_streak (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            current_streak INTEGER NOT NULL DEFAULT 0,
            longest_streak INTEGER NOT NULL DEFAULT 0,
            last_lesson_date DATE NULL
        );
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'uq_user_learning_streak_user_id'
            ) THEN
                ALTER TABLE user_learning_streak
                ADD CONSTRAINT uq_user_learning_streak_user_id UNIQUE (user_id);
            END IF;
        END
        $$;
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_user_learning_streak_user_id
        ON user_learning_streak (user_id);
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_user_learning_streak_user_id;")
    op.execute(
        """
        ALTER TABLE IF EXISTS user_learning_streak
        DROP CONSTRAINT IF EXISTS uq_user_learning_streak_user_id;
        """
    )
    op.execute("DROP TABLE IF EXISTS user_learning_streak;")

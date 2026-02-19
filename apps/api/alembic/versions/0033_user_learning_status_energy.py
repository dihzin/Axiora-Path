"""create user learning status for energy system

Revision ID: 0033_user_learning_status_energy
Revises: 0032_aprender_difficulty_and_adaptive_repeat
Create Date: 2026-02-19 17:05:00
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0033_user_learning_status_energy"
down_revision: str | None = "0032_aprender_difficulty_and_adaptive_repeat"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS user_learning_status (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            energy INTEGER NOT NULL DEFAULT 5,
            last_energy_update TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        """
    )

    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'uq_user_learning_status_user_id'
            ) THEN
                ALTER TABLE user_learning_status
                ADD CONSTRAINT uq_user_learning_status_user_id UNIQUE (user_id);
            END IF;
        END
        $$;
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_user_learning_status_user_id
        ON user_learning_status (user_id);
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_user_learning_status_user_id;")
    op.execute(
        """
        ALTER TABLE IF EXISTS user_learning_status
        DROP CONSTRAINT IF EXISTS uq_user_learning_status_user_id;
        """
    )
    op.execute("DROP TABLE IF EXISTS user_learning_status;")

"""user temporary boosts for axion actions

Revision ID: 0049_user_temporary_boosts
Revises: 0048_axion_hybrid_messaging
Create Date: 2026-02-20 10:00:00
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0049_user_temporary_boosts"
down_revision: str | None = "0048_axion_hybrid_messaging"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'temporary_boost_type') THEN
                CREATE TYPE temporary_boost_type AS ENUM ('XP_MULTIPLIER', 'DIFFICULTY_CAP', 'ENERGY_DISCOUNT');
            END IF;
        END
        $$;
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS user_temporary_boosts (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            type temporary_boost_type NOT NULL,
            value JSONB NOT NULL DEFAULT '{}'::jsonb,
            expires_at TIMESTAMPTZ NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_user_temporary_boosts_user_type_expires ON user_temporary_boosts (user_id, type, expires_at);"
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_user_temporary_boosts_expires_at ON user_temporary_boosts (expires_at);")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_user_temporary_boosts_expires_at;")
    op.execute("DROP INDEX IF EXISTS ix_user_temporary_boosts_user_type_expires;")
    op.execute("DROP TABLE IF EXISTS user_temporary_boosts;")
    op.execute("DROP TYPE IF EXISTS temporary_boost_type;")

"""create gamification profiles and game sessions

Revision ID: 0023_gamification_profiles_and_sessions
Revises: 0022_tenant_parent_pin_hash
Create Date: 2026-02-18 18:00:00
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0023_gamification_profiles_and_sessions"
down_revision: str | None = "0022_tenant_parent_pin_hash"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'game_type') THEN
                CREATE TYPE game_type AS ENUM (
                    'TICTACTOE',
                    'WORDSEARCH',
                    'CROSSWORD',
                    'HANGMAN',
                    'FINANCE_SIM'
                );
            END IF;
        END
        $$;
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS user_game_profiles (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
            xp INTEGER NOT NULL DEFAULT 0,
            level INTEGER NOT NULL DEFAULT 1,
            axion_coins INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS game_sessions (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            game_type game_type NOT NULL,
            score INTEGER NOT NULL,
            xp_earned INTEGER NOT NULL,
            coins_earned INTEGER NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS game_daily_xp (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            game_type game_type NOT NULL,
            date DATE NOT NULL,
            xp_earned INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        """
    )

    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint
                WHERE conname = 'uq_game_daily_xp_user_game_date'
            ) THEN
                ALTER TABLE game_daily_xp
                ADD CONSTRAINT uq_game_daily_xp_user_game_date UNIQUE (user_id, game_type, date);
            END IF;
        END
        $$;
        """
    )

    op.execute("CREATE INDEX IF NOT EXISTS ix_game_sessions_user_id_created_at ON game_sessions (user_id, created_at);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_game_daily_xp_user_id_date ON game_daily_xp (user_id, date);")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_game_daily_xp_user_id_date;")
    op.execute("DROP INDEX IF EXISTS ix_game_sessions_user_id_created_at;")
    op.execute("ALTER TABLE IF EXISTS game_daily_xp DROP CONSTRAINT IF EXISTS uq_game_daily_xp_user_game_date;")

    op.execute("DROP TABLE IF EXISTS game_daily_xp;")
    op.execute("DROP TABLE IF EXISTS game_sessions;")
    op.execute("DROP TABLE IF EXISTS user_game_profiles;")

    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'game_type') THEN
                DROP TYPE game_type;
            END IF;
        END
        $$;
        """
    )

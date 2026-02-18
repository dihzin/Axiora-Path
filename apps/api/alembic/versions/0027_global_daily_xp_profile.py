"""migrate gamification to global daily xp profile

Revision ID: 0027_global_daily_xp_profile
Revises: 0026_game_settings
Create Date: 2026-02-18 23:30:00
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0027_global_daily_xp_profile"
down_revision: str | None = "0026_game_settings"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto;")

    op.execute(
        """
        ALTER TABLE user_game_profiles
        ADD COLUMN IF NOT EXISTS daily_xp INTEGER NOT NULL DEFAULT 0;
        """
    )
    op.execute(
        """
        ALTER TABLE user_game_profiles
        ADD COLUMN IF NOT EXISTS last_xp_reset DATE NOT NULL DEFAULT CURRENT_DATE;
        """
    )

    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'user_game_profiles'
                  AND column_name = 'id'
                  AND data_type = 'integer'
            ) THEN
                ALTER TABLE user_game_profiles ADD COLUMN id_uuid UUID DEFAULT gen_random_uuid();
                UPDATE user_game_profiles SET id_uuid = gen_random_uuid() WHERE id_uuid IS NULL;
                ALTER TABLE user_game_profiles DROP CONSTRAINT IF EXISTS user_game_profiles_pkey;
                ALTER TABLE user_game_profiles DROP COLUMN id;
                ALTER TABLE user_game_profiles RENAME COLUMN id_uuid TO id;
                ALTER TABLE user_game_profiles ALTER COLUMN id SET NOT NULL;
                ALTER TABLE user_game_profiles ALTER COLUMN id SET DEFAULT gen_random_uuid();
                ALTER TABLE user_game_profiles ADD CONSTRAINT user_game_profiles_pkey PRIMARY KEY (id);
            END IF;
        END
        $$;
        """
    )

    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'game_sessions'
                  AND column_name = 'id'
                  AND data_type = 'integer'
            ) THEN
                ALTER TABLE game_sessions ADD COLUMN id_uuid UUID DEFAULT gen_random_uuid();
                UPDATE game_sessions SET id_uuid = gen_random_uuid() WHERE id_uuid IS NULL;
                ALTER TABLE game_sessions DROP CONSTRAINT IF EXISTS game_sessions_pkey;
                ALTER TABLE game_sessions DROP COLUMN id;
                ALTER TABLE game_sessions RENAME COLUMN id_uuid TO id;
                ALTER TABLE game_sessions ALTER COLUMN id SET NOT NULL;
                ALTER TABLE game_sessions ALTER COLUMN id SET DEFAULT gen_random_uuid();
                ALTER TABLE game_sessions ADD CONSTRAINT game_sessions_pkey PRIMARY KEY (id);
            END IF;
        END
        $$;
        """
    )

    op.execute("DROP INDEX IF EXISTS ix_game_daily_xp_user_id_date;")
    op.execute("ALTER TABLE IF EXISTS game_daily_xp DROP CONSTRAINT IF EXISTS uq_game_daily_xp_user_game_date;")
    op.execute("DROP TABLE IF EXISTS game_daily_xp;")


def downgrade() -> None:
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
    op.execute("CREATE INDEX IF NOT EXISTS ix_game_daily_xp_user_id_date ON game_daily_xp (user_id, date);")

    op.execute("ALTER TABLE user_game_profiles DROP COLUMN IF EXISTS daily_xp;")
    op.execute("ALTER TABLE user_game_profiles DROP COLUMN IF EXISTS last_xp_reset;")


"""create daily missions table

Revision ID: 0017_daily_missions
Revises: 0016_axion_profile
Create Date: 2026-02-17 20:00:00
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0017_daily_missions"
down_revision: str | None = "0016_axion_profile"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto;")

    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'daily_mission_rarity') THEN
                CREATE TYPE daily_mission_rarity AS ENUM ('normal', 'special', 'epic');
            END IF;
        END
        $$;
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'daily_mission_status') THEN
                CREATE TYPE daily_mission_status AS ENUM ('pending', 'completed');
            END IF;
        END
        $$;
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS daily_missions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            child_id INTEGER NOT NULL REFERENCES child_profiles(id),
            date DATE NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            rarity daily_mission_rarity NOT NULL,
            xp_reward INTEGER NOT NULL,
            coin_reward INTEGER NOT NULL,
            status daily_mission_status NOT NULL DEFAULT 'pending',
            completed_at TIMESTAMPTZ NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
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
                WHERE conname = 'uq_daily_missions_child_id_date'
            ) THEN
                ALTER TABLE daily_missions
                ADD CONSTRAINT uq_daily_missions_child_id_date UNIQUE (child_id, date);
            END IF;
        END
        $$;
        """
    )

    op.execute("CREATE INDEX IF NOT EXISTS ix_daily_missions_child_id ON daily_missions (child_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_daily_missions_date ON daily_missions (date);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_daily_missions_child_id_date ON daily_missions (child_id, date);")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_daily_missions_child_id_date;")
    op.execute("DROP INDEX IF EXISTS ix_daily_missions_date;")
    op.execute("DROP INDEX IF EXISTS ix_daily_missions_child_id;")
    op.execute("ALTER TABLE IF EXISTS daily_missions DROP CONSTRAINT IF EXISTS uq_daily_missions_child_id_date;")
    op.execute("DROP TABLE IF EXISTS daily_missions;")

    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'daily_mission_status') THEN
                DROP TYPE daily_mission_status;
            END IF;
        END
        $$;
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'daily_mission_rarity') THEN
                DROP TYPE daily_mission_rarity;
            END IF;
        END
        $$;
        """
    )

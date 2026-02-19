"""weekly missions and season events for learning retention

Revision ID: 0043_weekly_missions_and_season_events
Revises: 0042_user_ux_settings
Create Date: 2026-02-20 03:25:00
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0043_weekly_missions_and_season_events"
down_revision: str | None = "0042_user_ux_settings"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'weekly_mission_type') THEN
                CREATE TYPE weekly_mission_type AS ENUM (
                    'LESSONS_COMPLETED',
                    'XP_GAINED',
                    'PERFECT_SCORES',
                    'STREAK_DAYS',
                    'MINI_BOSS_WINS'
                );
            END IF;
        END
        $$;
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS weekly_missions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            title VARCHAR(255) NOT NULL,
            description TEXT NULL,
            age_group subject_age_group NOT NULL,
            subject_id INTEGER NULL REFERENCES subjects(id),
            mission_type weekly_mission_type NOT NULL,
            target_value INTEGER NOT NULL,
            xp_reward INTEGER NOT NULL DEFAULT 0,
            coin_reward INTEGER NOT NULL DEFAULT 0,
            start_date DATE NOT NULL,
            end_date DATE NOT NULL,
            is_seasonal BOOLEAN NOT NULL DEFAULT FALSE,
            theme_key VARCHAR(80) NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_weekly_missions_dates ON weekly_missions (start_date, end_date);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_weekly_missions_age_group ON weekly_missions (age_group);")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS user_mission_progress (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            mission_id UUID NOT NULL REFERENCES weekly_missions(id),
            current_value INTEGER NOT NULL DEFAULT 0,
            completed BOOLEAN NOT NULL DEFAULT FALSE,
            completed_at TIMESTAMPTZ NULL,
            reward_granted BOOLEAN NOT NULL DEFAULT FALSE
        );
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_user_mission_progress_user_mission') THEN
                ALTER TABLE user_mission_progress
                ADD CONSTRAINT uq_user_mission_progress_user_mission UNIQUE (user_id, mission_id);
            END IF;
        END
        $$;
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_user_mission_progress_user_id ON user_mission_progress (user_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_user_mission_progress_mission_id ON user_mission_progress (mission_id);")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS season_events (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(180) NOT NULL,
            theme_key VARCHAR(80) NOT NULL,
            start_date DATE NOT NULL,
            end_date DATE NOT NULL,
            description TEXT NULL,
            background_style JSONB NOT NULL DEFAULT '{}'::jsonb,
            bonus_xp_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.00,
            bonus_coin_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.00,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_season_events_dates ON season_events (start_date, end_date);")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS user_calendar_activity (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            date DATE NOT NULL,
            lessons_completed INTEGER NOT NULL DEFAULT 0,
            xp_earned INTEGER NOT NULL DEFAULT 0,
            missions_completed INTEGER NOT NULL DEFAULT 0,
            streak_maintained BOOLEAN NOT NULL DEFAULT FALSE,
            perfect_sessions INTEGER NOT NULL DEFAULT 0
        );
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_user_calendar_activity_user_date') THEN
                ALTER TABLE user_calendar_activity
                ADD CONSTRAINT uq_user_calendar_activity_user_date UNIQUE (user_id, date);
            END IF;
        END
        $$;
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_user_calendar_activity_user_id ON user_calendar_activity (user_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_user_calendar_activity_date ON user_calendar_activity (date);")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_user_calendar_activity_date;")
    op.execute("DROP INDEX IF EXISTS ix_user_calendar_activity_user_id;")
    op.execute(
        """
        ALTER TABLE IF EXISTS user_calendar_activity
        DROP CONSTRAINT IF EXISTS uq_user_calendar_activity_user_date;
        """
    )
    op.execute("DROP TABLE IF EXISTS user_calendar_activity;")

    op.execute("DROP INDEX IF EXISTS ix_season_events_dates;")
    op.execute("DROP TABLE IF EXISTS season_events;")

    op.execute("DROP INDEX IF EXISTS ix_user_mission_progress_mission_id;")
    op.execute("DROP INDEX IF EXISTS ix_user_mission_progress_user_id;")
    op.execute(
        """
        ALTER TABLE IF EXISTS user_mission_progress
        DROP CONSTRAINT IF EXISTS uq_user_mission_progress_user_mission;
        """
    )
    op.execute("DROP TABLE IF EXISTS user_mission_progress;")

    op.execute("DROP INDEX IF EXISTS ix_weekly_missions_age_group;")
    op.execute("DROP INDEX IF EXISTS ix_weekly_missions_dates;")
    op.execute("DROP TABLE IF EXISTS weekly_missions;")

    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'weekly_mission_type') THEN
                DROP TYPE weekly_mission_type;
            END IF;
        END
        $$;
        """
    )

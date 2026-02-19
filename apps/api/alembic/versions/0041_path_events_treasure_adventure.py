"""path events treasure adventure for learning path

Revision ID: 0041_path_events_treasure_adventure
Revises: 0040_hybrid_template_generation
Create Date: 2026-02-20 00:35:00
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0041_path_events_treasure_adventure"
down_revision: str | None = "0040_hybrid_template_generation"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'path_event_type') THEN
                CREATE TYPE path_event_type AS ENUM (
                    'CHEST',
                    'CHECKPOINT',
                    'MINI_BOSS',
                    'STORY_STOP',
                    'BOOST',
                    'REVIEW_GATE'
                );
            END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'path_event_rarity') THEN
                CREATE TYPE path_event_rarity AS ENUM ('COMMON', 'RARE', 'EPIC');
            END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_path_event_status') THEN
                CREATE TYPE user_path_event_status AS ENUM ('LOCKED', 'AVAILABLE', 'COMPLETED', 'SKIPPED');
            END IF;
        END
        $$;
        """
    )

    op.execute(
        """
        ALTER TABLE IF EXISTS user_learning_status
        ADD COLUMN IF NOT EXISTS event_boost_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.00;
        """
    )
    op.execute(
        """
        ALTER TABLE IF EXISTS user_learning_status
        ADD COLUMN IF NOT EXISTS event_boost_expires_at TIMESTAMPTZ NULL;
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS path_events (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            subject_id INTEGER NOT NULL REFERENCES subjects(id),
            age_group subject_age_group NOT NULL,
            unit_id INTEGER NULL REFERENCES units(id),
            lesson_id INTEGER NULL REFERENCES lessons(id),
            type path_event_type NOT NULL,
            title VARCHAR(255) NOT NULL,
            description TEXT NULL,
            icon_key VARCHAR(80) NOT NULL,
            rarity path_event_rarity NOT NULL DEFAULT 'COMMON',
            rules JSONB NOT NULL DEFAULT '{}'::jsonb,
            order_index INTEGER NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_path_events_subject_order ON path_events (subject_id, order_index);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_path_events_unit_lesson ON path_events (unit_id, lesson_id);")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS user_path_events (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            event_id UUID NOT NULL REFERENCES path_events(id),
            status user_path_event_status NOT NULL DEFAULT 'LOCKED',
            completed_at TIMESTAMPTZ NULL,
            reward_granted BOOLEAN NOT NULL DEFAULT FALSE
        );
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_user_path_events_user_event') THEN
                ALTER TABLE user_path_events
                ADD CONSTRAINT uq_user_path_events_user_event UNIQUE (user_id, event_id);
            END IF;
        END
        $$;
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_user_path_events_user_id ON user_path_events (user_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_user_path_events_event_id ON user_path_events (event_id);")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_user_path_events_event_id;")
    op.execute("DROP INDEX IF EXISTS ix_user_path_events_user_id;")
    op.execute(
        """
        ALTER TABLE IF EXISTS user_path_events
        DROP CONSTRAINT IF EXISTS uq_user_path_events_user_event;
        """
    )
    op.execute("DROP TABLE IF EXISTS user_path_events;")

    op.execute("DROP INDEX IF EXISTS ix_path_events_unit_lesson;")
    op.execute("DROP INDEX IF EXISTS ix_path_events_subject_order;")
    op.execute("DROP TABLE IF EXISTS path_events;")

    op.execute(
        """
        ALTER TABLE IF EXISTS user_learning_status
        DROP COLUMN IF EXISTS event_boost_expires_at;
        """
    )
    op.execute(
        """
        ALTER TABLE IF EXISTS user_learning_status
        DROP COLUMN IF EXISTS event_boost_multiplier;
        """
    )

    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_path_event_status') THEN
                DROP TYPE user_path_event_status;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'path_event_rarity') THEN
                DROP TYPE path_event_rarity;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'path_event_type') THEN
                DROP TYPE path_event_type;
            END IF;
        END
        $$;
        """
    )

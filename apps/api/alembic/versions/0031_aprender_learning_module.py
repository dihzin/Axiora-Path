"""create aprender learning module tables

Revision ID: 0031_aprender_learning_module
Revises: 0030_user_achievements_and_rewards
Create Date: 2026-02-19 15:30:00
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0031_aprender_learning_module"
down_revision: str | None = "0030_user_achievements_and_rewards"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subject_age_group') THEN
                CREATE TYPE subject_age_group AS ENUM ('6-8', '9-12', '13-15');
            END IF;
        END
        $$;
        """
    )

    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lesson_type') THEN
                CREATE TYPE lesson_type AS ENUM (
                    'STORY',
                    'QUIZ',
                    'DRAG_DROP',
                    'MULTIPLE_CHOICE',
                    'INTERACTIVE'
                );
            END IF;
        END
        $$;
        """
    )

    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lesson_content_type') THEN
                CREATE TYPE lesson_content_type AS ENUM ('TEXT', 'IMAGE', 'AUDIO', 'QUESTION');
            END IF;
        END
        $$;
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS subjects (
            id SERIAL PRIMARY KEY,
            name VARCHAR(120) NOT NULL,
            age_group subject_age_group NOT NULL,
            icon VARCHAR(120) NULL,
            color VARCHAR(32) NULL,
            "order" INTEGER NOT NULL
        );
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'uq_subjects_age_group_order'
            ) THEN
                ALTER TABLE subjects
                ADD CONSTRAINT uq_subjects_age_group_order UNIQUE (age_group, "order");
            END IF;
        END
        $$;
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS units (
            id SERIAL PRIMARY KEY,
            subject_id INTEGER NOT NULL REFERENCES subjects(id),
            title VARCHAR(255) NOT NULL,
            description TEXT NULL,
            "order" INTEGER NOT NULL,
            required_level INTEGER NOT NULL DEFAULT 1
        );
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'uq_units_subject_order'
            ) THEN
                ALTER TABLE units
                ADD CONSTRAINT uq_units_subject_order UNIQUE (subject_id, "order");
            END IF;
        END
        $$;
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_units_subject_id ON units (subject_id);")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS lessons (
            id SERIAL PRIMARY KEY,
            unit_id INTEGER NOT NULL REFERENCES units(id),
            title VARCHAR(255) NOT NULL,
            "order" INTEGER NOT NULL,
            xp_reward INTEGER NOT NULL DEFAULT 0,
            type lesson_type NOT NULL
        );
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'uq_lessons_unit_order'
            ) THEN
                ALTER TABLE lessons
                ADD CONSTRAINT uq_lessons_unit_order UNIQUE (unit_id, "order");
            END IF;
        END
        $$;
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_lessons_unit_id ON lessons (unit_id);")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS lesson_contents (
            id SERIAL PRIMARY KEY,
            lesson_id INTEGER NOT NULL REFERENCES lessons(id),
            content_type lesson_content_type NOT NULL,
            content_data JSONB NOT NULL DEFAULT '{}'::jsonb,
            "order" INTEGER NOT NULL
        );
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'uq_lesson_contents_lesson_order'
            ) THEN
                ALTER TABLE lesson_contents
                ADD CONSTRAINT uq_lesson_contents_lesson_order UNIQUE (lesson_id, "order");
            END IF;
        END
        $$;
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_lesson_contents_lesson_id ON lesson_contents (lesson_id);"
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS lesson_progress (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            lesson_id INTEGER NOT NULL REFERENCES lessons(id),
            completed BOOLEAN NOT NULL DEFAULT false,
            score INTEGER NULL,
            completed_at TIMESTAMPTZ NULL
        );
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'uq_lesson_progress_user_lesson'
            ) THEN
                ALTER TABLE lesson_progress
                ADD CONSTRAINT uq_lesson_progress_user_lesson UNIQUE (user_id, lesson_id);
            END IF;
        END
        $$;
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_lesson_progress_user_id ON lesson_progress (user_id);
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_lesson_progress_lesson_id ON lesson_progress (lesson_id);"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_lesson_progress_lesson_id;")
    op.execute("DROP INDEX IF EXISTS ix_lesson_progress_user_id;")
    op.execute(
        """
        ALTER TABLE IF EXISTS lesson_progress
        DROP CONSTRAINT IF EXISTS uq_lesson_progress_user_lesson;
        """
    )
    op.execute("DROP TABLE IF EXISTS lesson_progress;")

    op.execute("DROP INDEX IF EXISTS ix_lesson_contents_lesson_id;")
    op.execute(
        """
        ALTER TABLE IF EXISTS lesson_contents
        DROP CONSTRAINT IF EXISTS uq_lesson_contents_lesson_order;
        """
    )
    op.execute("DROP TABLE IF EXISTS lesson_contents;")

    op.execute("DROP INDEX IF EXISTS ix_lessons_unit_id;")
    op.execute("ALTER TABLE IF EXISTS lessons DROP CONSTRAINT IF EXISTS uq_lessons_unit_order;")
    op.execute("DROP TABLE IF EXISTS lessons;")

    op.execute("DROP INDEX IF EXISTS ix_units_subject_id;")
    op.execute("ALTER TABLE IF EXISTS units DROP CONSTRAINT IF EXISTS uq_units_subject_order;")
    op.execute("DROP TABLE IF EXISTS units;")

    op.execute(
        """
        ALTER TABLE IF EXISTS subjects
        DROP CONSTRAINT IF EXISTS uq_subjects_age_group_order;
        """
    )
    op.execute("DROP TABLE IF EXISTS subjects;")

    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lesson_content_type') THEN
                DROP TYPE lesson_content_type;
            END IF;
        END
        $$;
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lesson_type') THEN
                DROP TYPE lesson_type;
            END IF;
        END
        $$;
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subject_age_group') THEN
                DROP TYPE subject_age_group;
            END IF;
        END
        $$;
        """
    )

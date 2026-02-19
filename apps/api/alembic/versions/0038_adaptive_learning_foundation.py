"""adaptive learning foundation models

Revision ID: 0038_adaptive_learning_foundation
Revises: 0037_learning_settings
Create Date: 2026-02-19 21:10:00
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0038_adaptive_learning_foundation"
down_revision: str | None = "0037_learning_settings"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'question_type') THEN
                CREATE TYPE question_type AS ENUM (
                    'MCQ',
                    'TRUE_FALSE',
                    'DRAG_DROP',
                    'FILL_BLANK',
                    'MATCH',
                    'ORDERING'
                );
            END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'question_difficulty') THEN
                CREATE TYPE question_difficulty AS ENUM ('EASY', 'MEDIUM', 'HARD');
            END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'question_result') THEN
                CREATE TYPE question_result AS ENUM ('CORRECT', 'WRONG', 'SKIPPED');
            END IF;
        END
        $$;
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS skills (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            subject_id INTEGER NOT NULL REFERENCES subjects(id),
            name VARCHAR(140) NOT NULL,
            description TEXT NULL,
            age_group subject_age_group NOT NULL,
            "order" INTEGER NOT NULL
        );
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_skills_subject_order') THEN
                ALTER TABLE skills
                ADD CONSTRAINT uq_skills_subject_order UNIQUE (subject_id, "order");
            END IF;
        END
        $$;
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_skills_subject_id ON skills (subject_id);")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS lesson_skills (
            id SERIAL PRIMARY KEY,
            lesson_id INTEGER NOT NULL REFERENCES lessons(id),
            skill_id UUID NOT NULL REFERENCES skills(id),
            weight NUMERIC(4,3) NOT NULL DEFAULT 0.500,
            CONSTRAINT ck_lesson_skills_weight_range CHECK (weight >= 0 AND weight <= 1)
        );
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_lesson_skills_lesson_skill') THEN
                ALTER TABLE lesson_skills
                ADD CONSTRAINT uq_lesson_skills_lesson_skill UNIQUE (lesson_id, skill_id);
            END IF;
        END
        $$;
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_lesson_skills_lesson_id ON lesson_skills (lesson_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_lesson_skills_skill_id ON lesson_skills (skill_id);")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS questions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            skill_id UUID NOT NULL REFERENCES skills(id),
            lesson_id INTEGER NULL REFERENCES lessons(id),
            type question_type NOT NULL,
            difficulty question_difficulty NOT NULL,
            prompt TEXT NOT NULL,
            explanation TEXT NULL,
            metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
            tags TEXT[] NOT NULL DEFAULT '{}'::text[],
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_questions_skill_id ON questions (skill_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_questions_lesson_id ON questions (lesson_id);")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS question_variants (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            question_id UUID NOT NULL REFERENCES questions(id),
            variant_data JSONB NOT NULL DEFAULT '{}'::jsonb,
            difficulty_override question_difficulty NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_question_variants_question_id ON question_variants (question_id);")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS user_skill_mastery (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            skill_id UUID NOT NULL REFERENCES skills(id),
            mastery NUMERIC(4,3) NOT NULL DEFAULT 0,
            streak_correct INTEGER NOT NULL DEFAULT 0,
            streak_wrong INTEGER NOT NULL DEFAULT 0,
            last_seen_at TIMESTAMPTZ NULL,
            next_review_at TIMESTAMPTZ NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT ck_user_skill_mastery_range CHECK (mastery >= 0 AND mastery <= 1)
        );
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_user_skill_mastery_user_skill') THEN
                ALTER TABLE user_skill_mastery
                ADD CONSTRAINT uq_user_skill_mastery_user_skill UNIQUE (user_id, skill_id);
            END IF;
        END
        $$;
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_user_skill_mastery_user_id ON user_skill_mastery (user_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_user_skill_mastery_skill_id ON user_skill_mastery (skill_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_user_skill_mastery_next_review_at ON user_skill_mastery (next_review_at);")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS user_question_history (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            question_id UUID NOT NULL REFERENCES questions(id),
            variant_id UUID NULL REFERENCES question_variants(id),
            result question_result NOT NULL,
            time_ms INTEGER NOT NULL DEFAULT 0,
            difficulty_served question_difficulty NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_user_question_history_user_id ON user_question_history (user_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_user_question_history_question_id ON user_question_history (question_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_user_question_history_created_at ON user_question_history (created_at);")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS learning_sessions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(id),
            subject_id INTEGER NOT NULL REFERENCES subjects(id),
            unit_id INTEGER NULL REFERENCES units(id),
            lesson_id INTEGER NULL REFERENCES lessons(id),
            started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            ended_at TIMESTAMPTZ NULL,
            total_questions INTEGER NOT NULL DEFAULT 0,
            correct_count INTEGER NOT NULL DEFAULT 0,
            xp_earned INTEGER NOT NULL DEFAULT 0,
            coins_earned INTEGER NOT NULL DEFAULT 0
        );
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_learning_sessions_user_id_started_at ON learning_sessions (user_id, started_at);"
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_learning_sessions_subject_id ON learning_sessions (subject_id);")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_learning_sessions_subject_id;")
    op.execute("DROP INDEX IF EXISTS ix_learning_sessions_user_id_started_at;")
    op.execute("DROP TABLE IF EXISTS learning_sessions;")

    op.execute("DROP INDEX IF EXISTS ix_user_question_history_created_at;")
    op.execute("DROP INDEX IF EXISTS ix_user_question_history_question_id;")
    op.execute("DROP INDEX IF EXISTS ix_user_question_history_user_id;")
    op.execute("DROP TABLE IF EXISTS user_question_history;")

    op.execute("DROP INDEX IF EXISTS ix_user_skill_mastery_next_review_at;")
    op.execute("DROP INDEX IF EXISTS ix_user_skill_mastery_skill_id;")
    op.execute("DROP INDEX IF EXISTS ix_user_skill_mastery_user_id;")
    op.execute(
        """
        ALTER TABLE IF EXISTS user_skill_mastery
        DROP CONSTRAINT IF EXISTS uq_user_skill_mastery_user_skill;
        """
    )
    op.execute("DROP TABLE IF EXISTS user_skill_mastery;")

    op.execute("DROP INDEX IF EXISTS ix_question_variants_question_id;")
    op.execute("DROP TABLE IF EXISTS question_variants;")

    op.execute("DROP INDEX IF EXISTS ix_questions_lesson_id;")
    op.execute("DROP INDEX IF EXISTS ix_questions_skill_id;")
    op.execute("DROP TABLE IF EXISTS questions;")

    op.execute("DROP INDEX IF EXISTS ix_lesson_skills_skill_id;")
    op.execute("DROP INDEX IF EXISTS ix_lesson_skills_lesson_id;")
    op.execute(
        """
        ALTER TABLE IF EXISTS lesson_skills
        DROP CONSTRAINT IF EXISTS uq_lesson_skills_lesson_skill;
        """
    )
    op.execute("DROP TABLE IF EXISTS lesson_skills;")

    op.execute("DROP INDEX IF EXISTS ix_skills_subject_id;")
    op.execute(
        """
        ALTER TABLE IF EXISTS skills
        DROP CONSTRAINT IF EXISTS uq_skills_subject_order;
        """
    )
    op.execute("DROP TABLE IF EXISTS skills;")

    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'question_result') THEN
                DROP TYPE question_result;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'question_difficulty') THEN
                DROP TYPE question_difficulty;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'question_type') THEN
                DROP TYPE question_type;
            END IF;
        END
        $$;
        """
    )

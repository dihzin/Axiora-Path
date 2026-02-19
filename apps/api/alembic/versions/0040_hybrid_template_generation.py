"""hybrid template generation for learning

Revision ID: 0040_hybrid_template_generation
Revises: 0039_learning_parental_controls_adaptive
Create Date: 2026-02-19 23:10:00
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0040_hybrid_template_generation"
down_revision: str | None = "0039_learning_parental_controls_adaptive"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'question_template_type') THEN
                CREATE TYPE question_template_type AS ENUM (
                    'MATH_ARITH',
                    'MATH_WORDPROB',
                    'PT_SENTENCE_ORDER',
                    'PT_PUNCTUATION',
                    'PT_SYLLABLES',
                    'EN_VOCAB'
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
            IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'question_type')
               AND NOT EXISTS (
                    SELECT 1
                    FROM pg_enum
                    WHERE enumlabel = 'TEMPLATE'
                      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'question_type')
               )
            THEN
                ALTER TYPE question_type ADD VALUE 'TEMPLATE';
            END IF;
        END
        $$;
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS question_templates (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            skill_id UUID NOT NULL REFERENCES skills(id),
            lesson_id INTEGER NULL REFERENCES lessons(id),
            difficulty question_difficulty NOT NULL,
            template_type question_template_type NOT NULL,
            prompt_template TEXT NOT NULL,
            explanation_template TEXT NULL,
            generator_spec JSONB NOT NULL DEFAULT '{}'::jsonb,
            renderer_spec JSONB NOT NULL DEFAULT '{}'::jsonb,
            tags TEXT[] NOT NULL DEFAULT '{}'::text[],
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_question_templates_skill_id ON question_templates (skill_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_question_templates_lesson_id ON question_templates (lesson_id);")
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_question_templates_type_difficulty ON question_templates (template_type, difficulty);"
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS generated_variants (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(id),
            template_id UUID NOT NULL REFERENCES question_templates(id),
            seed VARCHAR(128) NOT NULL,
            variant_data JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_generated_variants_user_template_created_at
        ON generated_variants (user_id, template_id, created_at);
        """
    )

    op.execute(
        """
        ALTER TABLE IF EXISTS user_question_history
        ALTER COLUMN question_id DROP NOT NULL;
        """
    )
    op.execute(
        """
        ALTER TABLE IF EXISTS user_question_history
        ADD COLUMN IF NOT EXISTS template_id UUID NULL REFERENCES question_templates(id);
        """
    )
    op.execute(
        """
        ALTER TABLE IF EXISTS user_question_history
        ADD COLUMN IF NOT EXISTS generated_variant_id UUID NULL REFERENCES generated_variants(id);
        """
    )

    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'ck_user_question_history_reference'
            ) THEN
                ALTER TABLE user_question_history
                ADD CONSTRAINT ck_user_question_history_reference
                CHECK (
                    question_id IS NOT NULL
                    OR (template_id IS NOT NULL AND generated_variant_id IS NOT NULL)
                );
            END IF;
        END
        $$;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE IF EXISTS user_question_history
        DROP CONSTRAINT IF EXISTS ck_user_question_history_reference;
        """
    )
    op.execute(
        """
        ALTER TABLE IF EXISTS user_question_history
        DROP COLUMN IF EXISTS generated_variant_id;
        """
    )
    op.execute(
        """
        ALTER TABLE IF EXISTS user_question_history
        DROP COLUMN IF EXISTS template_id;
        """
    )

    op.execute("DROP INDEX IF EXISTS ix_generated_variants_user_template_created_at;")
    op.execute("DROP TABLE IF EXISTS generated_variants;")

    op.execute("DROP INDEX IF EXISTS ix_question_templates_type_difficulty;")
    op.execute("DROP INDEX IF EXISTS ix_question_templates_lesson_id;")
    op.execute("DROP INDEX IF EXISTS ix_question_templates_skill_id;")
    op.execute("DROP TABLE IF EXISTS question_templates;")

    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'question_template_type') THEN
                DROP TYPE question_template_type;
            END IF;
        END
        $$;
        """
    )

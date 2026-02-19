"""add lesson difficulty and adaptive repetition fields

Revision ID: 0032_aprender_difficulty_and_adaptive_repeat
Revises: 0031_aprender_learning_module
Create Date: 2026-02-19 16:40:00
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0032_aprender_difficulty_and_adaptive_repeat"
down_revision: str | None = "0031_aprender_learning_module"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lesson_difficulty') THEN
                CREATE TYPE lesson_difficulty AS ENUM ('EASY', 'MEDIUM', 'HARD');
            END IF;
        END
        $$;
        """
    )

    op.execute(
        """
        ALTER TABLE lessons
        ADD COLUMN IF NOT EXISTS difficulty lesson_difficulty NOT NULL DEFAULT 'EASY';
        """
    )

    op.execute(
        """
        ALTER TABLE lesson_progress
        ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
        """
    )
    op.execute(
        """
        ALTER TABLE lesson_progress
        ADD COLUMN IF NOT EXISTS repeat_required BOOLEAN NOT NULL DEFAULT false;
        """
    )
    op.execute(
        """
        ALTER TABLE lesson_progress
        ADD COLUMN IF NOT EXISTS variation_seed VARCHAR(64) NULL;
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE lesson_progress DROP COLUMN IF EXISTS variation_seed;")
    op.execute("ALTER TABLE lesson_progress DROP COLUMN IF EXISTS repeat_required;")
    op.execute("ALTER TABLE lesson_progress DROP COLUMN IF EXISTS attempts;")
    op.execute("ALTER TABLE lessons DROP COLUMN IF EXISTS difficulty;")

    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lesson_difficulty') THEN
                DROP TYPE lesson_difficulty;
            END IF;
        END
        $$;
        """
    )

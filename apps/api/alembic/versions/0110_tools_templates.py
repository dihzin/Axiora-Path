"""create tool templates table

Revision ID: 0110_tools_templates
Revises: 0109_real_question_seed
Create Date: 2026-03-21 00:00:00
"""

from collections.abc import Sequence

from alembic import op


revision: str = "0110_tools_templates"
down_revision: str | None = "0109_real_question_seed"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto;")
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS tool_templates (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(id),
            name TEXT NOT NULL,
            config JSONB NOT NULL DEFAULT '{}'::jsonb,
            blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
            is_public BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_tool_templates_user_id ON tool_templates (user_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_tool_templates_is_public ON tool_templates (is_public);")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_tool_templates_is_public;")
    op.execute("DROP INDEX IF EXISTS ix_tool_templates_user_id;")
    op.execute("DROP TABLE IF EXISTS tool_templates;")

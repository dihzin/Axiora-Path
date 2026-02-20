"""axion message templates

Revision ID: 0045_axion_message_templates
Revises: 0044_axion_intelligence_engine_v2
Create Date: 2026-02-20 07:05:00
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0045_axion_message_templates"
down_revision: str | None = "0044_axion_intelligence_engine_v2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS axion_message_templates (
            id SERIAL PRIMARY KEY,
            context VARCHAR(80) NOT NULL,
            tone VARCHAR(40) NOT NULL,
            condition JSONB NOT NULL DEFAULT '{}'::jsonb,
            template_text TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_axion_message_templates_context ON axion_message_templates (context);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_axion_message_templates_tone ON axion_message_templates (tone);")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_axion_message_templates_tone;")
    op.execute("DROP INDEX IF EXISTS ix_axion_message_templates_context;")
    op.execute("DROP TABLE IF EXISTS axion_message_templates;")

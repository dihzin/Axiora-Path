"""axion policy rules table

Revision ID: 0047_axion_policy_rules
Revises: 0046_axion_core_v2
Create Date: 2026-02-20 08:30:00
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0047_axion_policy_rules"
down_revision: str | None = "0046_axion_core_v2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS axion_policy_rules (
            id SERIAL PRIMARY KEY,
            name VARCHAR(140) NOT NULL,
            context axion_decision_context NOT NULL,
            condition JSONB NOT NULL DEFAULT '{}'::jsonb,
            actions JSONB NOT NULL DEFAULT '[]'::jsonb,
            priority INTEGER NOT NULL DEFAULT 100,
            enabled BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_axion_policy_rules_context_priority ON axion_policy_rules (context, priority);"
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_axion_policy_rules_enabled ON axion_policy_rules (enabled);")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_axion_policy_rules_enabled;")
    op.execute("DROP INDEX IF EXISTS ix_axion_policy_rules_context_priority;")
    op.execute("DROP TABLE IF EXISTS axion_policy_rules;")

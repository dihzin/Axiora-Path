"""axion studio admin versioning and audit

Revision ID: 0050_axion_studio
Revises: 0049_user_temporary_boosts
Create Date: 2026-02-19 12:20:00
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0050_axion_studio"
down_revision: str | None = "0049_user_temporary_boosts"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS axion_policy_rule_versions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            rule_id INTEGER NOT NULL REFERENCES axion_policy_rules(id) ON DELETE CASCADE,
            version INTEGER NOT NULL,
            snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_by_user_id INTEGER NOT NULL REFERENCES users(id),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_axion_policy_rule_versions_rule_version UNIQUE (rule_id, version)
        );
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_axion_policy_rule_versions_rule_id ON axion_policy_rule_versions(rule_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_axion_policy_rule_versions_created_at ON axion_policy_rule_versions(created_at);")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS axion_message_template_versions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            template_id INTEGER NOT NULL REFERENCES axion_message_templates(id) ON DELETE CASCADE,
            version INTEGER NOT NULL,
            snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_by_user_id INTEGER NOT NULL REFERENCES users(id),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_axion_message_template_versions_template_version UNIQUE (template_id, version)
        );
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_axion_message_template_versions_template_id ON axion_message_template_versions(template_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_axion_message_template_versions_created_at ON axion_message_template_versions(created_at);")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS axion_studio_audit_logs (
            id SERIAL PRIMARY KEY,
            actor_user_id INTEGER NOT NULL REFERENCES users(id),
            action VARCHAR(40) NOT NULL,
            entity_type VARCHAR(20) NOT NULL,
            entity_id VARCHAR(64) NOT NULL,
            diff JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_axion_studio_audit_logs_actor_user_id ON axion_studio_audit_logs(actor_user_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_axion_studio_audit_logs_entity ON axion_studio_audit_logs(entity_type, entity_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_axion_studio_audit_logs_created_at ON axion_studio_audit_logs(created_at);")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_axion_studio_audit_logs_created_at;")
    op.execute("DROP INDEX IF EXISTS ix_axion_studio_audit_logs_entity;")
    op.execute("DROP INDEX IF EXISTS ix_axion_studio_audit_logs_actor_user_id;")
    op.execute("DROP TABLE IF EXISTS axion_studio_audit_logs;")

    op.execute("DROP INDEX IF EXISTS ix_axion_message_template_versions_created_at;")
    op.execute("DROP INDEX IF EXISTS ix_axion_message_template_versions_template_id;")
    op.execute("DROP TABLE IF EXISTS axion_message_template_versions;")

    op.execute("DROP INDEX IF EXISTS ix_axion_policy_rule_versions_created_at;")
    op.execute("DROP INDEX IF EXISTS ix_axion_policy_rule_versions_rule_id;")
    op.execute("DROP TABLE IF EXISTS axion_policy_rule_versions;")

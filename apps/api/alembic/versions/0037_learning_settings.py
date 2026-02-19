"""create learning settings table

Revision ID: 0037_learning_settings
Revises: 0036_learning_economy_integration
Create Date: 2026-02-19 19:35:00
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0037_learning_settings"
down_revision: str | None = "0036_learning_economy_integration"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS learning_settings (
            id SERIAL PRIMARY KEY,
            tenant_id INTEGER NOT NULL REFERENCES tenants(id),
            child_id INTEGER NOT NULL REFERENCES child_profiles(id),
            max_lessons_per_day INTEGER NOT NULL DEFAULT 5,
            xp_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.00,
            coins_enabled BOOLEAN NOT NULL DEFAULT TRUE,
            enabled_subjects JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'uq_learning_settings_tenant_child'
            ) THEN
                ALTER TABLE learning_settings
                ADD CONSTRAINT uq_learning_settings_tenant_child UNIQUE (tenant_id, child_id);
            END IF;
        END
        $$;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE IF EXISTS learning_settings
        DROP CONSTRAINT IF EXISTS uq_learning_settings_tenant_child;
        """
    )
    op.execute("DROP TABLE IF EXISTS learning_settings;")

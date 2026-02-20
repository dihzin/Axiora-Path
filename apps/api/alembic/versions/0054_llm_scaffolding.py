"""llm scaffolding tables

Revision ID: 0054_llm_scaffolding
Revises: 0053_axion_early_dropout_warning
Create Date: 2026-02-20 16:10:00
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0054_llm_scaffolding"
down_revision: str | None = "0053_axion_early_dropout_warning"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'llm_use_case') THEN
                CREATE TYPE llm_use_case AS ENUM (
                    'REWRITE_MESSAGE',
                    'EXPLAIN_MISTAKE',
                    'GENERATE_VARIANTS',
                    'PARENT_INSIGHT'
                );
            END IF;
        END $$;
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'llm_usage_status') THEN
                CREATE TYPE llm_usage_status AS ENUM ('HIT', 'MISS', 'BLOCKED', 'FAILED', 'FALLBACK');
            END IF;
        END $$;
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS llm_settings (
            id SERIAL PRIMARY KEY,
            tenant_id INTEGER NOT NULL REFERENCES tenants(id),
            enabled BOOLEAN NOT NULL DEFAULT FALSE,
            provider_key VARCHAR(80) NOT NULL DEFAULT 'noop',
            daily_token_budget INTEGER NOT NULL DEFAULT 0,
            per_user_daily_limit INTEGER NOT NULL DEFAULT 0,
            allowed_use_cases JSONB NOT NULL DEFAULT '[]'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_llm_settings_tenant_id UNIQUE (tenant_id)
        );
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_llm_settings_tenant_id ON llm_settings(tenant_id);")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS llm_usage_logs (
            id SERIAL PRIMARY KEY,
            tenant_id INTEGER NOT NULL REFERENCES tenants(id),
            user_id INTEGER NOT NULL REFERENCES users(id),
            use_case llm_use_case NOT NULL,
            prompt_hash VARCHAR(128) NOT NULL,
            cache_key VARCHAR(255) NULL,
            tokens_estimated INTEGER NOT NULL DEFAULT 0,
            latency_ms INTEGER NOT NULL DEFAULT 0,
            status llm_usage_status NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_llm_usage_logs_tenant_created_at ON llm_usage_logs(tenant_id, created_at);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_llm_usage_logs_user_created_at ON llm_usage_logs(user_id, created_at);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_llm_usage_logs_use_case ON llm_usage_logs(use_case);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_llm_usage_logs_status ON llm_usage_logs(status);")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_llm_usage_logs_status;")
    op.execute("DROP INDEX IF EXISTS ix_llm_usage_logs_use_case;")
    op.execute("DROP INDEX IF EXISTS ix_llm_usage_logs_user_created_at;")
    op.execute("DROP INDEX IF EXISTS ix_llm_usage_logs_tenant_created_at;")
    op.execute("DROP TABLE IF EXISTS llm_usage_logs;")

    op.execute("DROP INDEX IF EXISTS ix_llm_settings_tenant_id;")
    op.execute("DROP TABLE IF EXISTS llm_settings;")

    op.execute("DROP TYPE IF EXISTS llm_usage_status;")
    op.execute("DROP TYPE IF EXISTS llm_use_case;")


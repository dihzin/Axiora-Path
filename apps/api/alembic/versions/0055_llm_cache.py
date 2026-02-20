"""llm cache table

Revision ID: 0055_llm_cache
Revises: 0054_llm_scaffolding
Create Date: 2026-02-20 16:40:00
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0055_llm_cache"
down_revision: str | None = "0054_llm_scaffolding"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS llm_cache (
            id SERIAL PRIMARY KEY,
            cache_key VARCHAR(255) NOT NULL,
            payload JSONB NOT NULL DEFAULT '{}'::jsonb,
            expires_at TIMESTAMPTZ NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_llm_cache_cache_key UNIQUE (cache_key)
        );
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_llm_cache_expires_at ON llm_cache(expires_at);")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_llm_cache_expires_at;")
    op.execute("DROP TABLE IF EXISTS llm_cache;")


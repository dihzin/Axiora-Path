"""add coin conversions table

Revision ID: 0024_coin_conversions
Revises: 0023_gamification_profiles_and_sessions
Create Date: 2026-02-18 18:25:00
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0024_coin_conversions"
down_revision: str | None = "0023_gamification_profiles_and_sessions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS coin_conversions (
            id SERIAL PRIMARY KEY,
            tenant_id INTEGER NOT NULL REFERENCES tenants(id),
            child_id INTEGER NOT NULL REFERENCES child_profiles(id),
            user_id INTEGER NOT NULL REFERENCES users(id),
            coins_used INTEGER NOT NULL,
            amount_generated INTEGER NOT NULL,
            approved_by_parent BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_coin_conversions_tenant_id_created_at
        ON coin_conversions (tenant_id, created_at);
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_coin_conversions_child_id_created_at
        ON coin_conversions (child_id, created_at);
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_coin_conversions_child_id_created_at;")
    op.execute("DROP INDEX IF EXISTS ix_coin_conversions_tenant_id_created_at;")
    op.execute("DROP TABLE IF EXISTS coin_conversions;")

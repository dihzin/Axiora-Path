"""add parental game settings per child

Revision ID: 0026_game_settings
Revises: 0025_store_items_inventory
Create Date: 2026-02-18 20:00:00
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0026_game_settings"
down_revision: str | None = "0025_store_items_inventory"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS game_settings (
            id SERIAL PRIMARY KEY,
            tenant_id INTEGER NOT NULL REFERENCES tenants(id),
            child_id INTEGER NOT NULL REFERENCES child_profiles(id),
            tictactoe_enabled BOOLEAN NOT NULL DEFAULT true,
            wordsearch_enabled BOOLEAN NOT NULL DEFAULT true,
            crossword_enabled BOOLEAN NOT NULL DEFAULT true,
            hangman_enabled BOOLEAN NOT NULL DEFAULT true,
            finance_sim_enabled BOOLEAN NOT NULL DEFAULT true,
            max_daily_xp INTEGER NOT NULL DEFAULT 200,
            coin_conversion_limit_per_week INTEGER NOT NULL DEFAULT 500,
            require_approval_after_30_min BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'uq_game_settings_tenant_child'
            ) THEN
                ALTER TABLE game_settings
                ADD CONSTRAINT uq_game_settings_tenant_child UNIQUE (tenant_id, child_id);
            END IF;
        END
        $$;
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE IF EXISTS game_settings DROP CONSTRAINT IF EXISTS uq_game_settings_tenant_child;")
    op.execute("DROP TABLE IF EXISTS game_settings;")

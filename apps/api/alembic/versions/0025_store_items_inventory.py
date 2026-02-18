"""add store items and user inventory

Revision ID: 0025_store_items_inventory
Revises: 0024_coin_conversions
Create Date: 2026-02-18 19:30:00
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0025_store_items_inventory"
down_revision: str | None = "0024_coin_conversions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS store_items (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            type VARCHAR(64) NOT NULL,
            price INTEGER NOT NULL,
            rarity VARCHAR(32) NOT NULL,
            image_url VARCHAR(500) NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'uq_store_items_name_type'
            ) THEN
                ALTER TABLE store_items
                ADD CONSTRAINT uq_store_items_name_type UNIQUE (name, type);
            END IF;
        END
        $$;
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS user_inventory (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            item_id INTEGER NOT NULL REFERENCES store_items(id),
            equipped BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'uq_user_inventory_user_item'
            ) THEN
                ALTER TABLE user_inventory
                ADD CONSTRAINT uq_user_inventory_user_item UNIQUE (user_id, item_id);
            END IF;
        END
        $$;
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_user_inventory_user_id ON user_inventory (user_id);")

    op.execute(
        """
        INSERT INTO store_items (name, type, price, rarity, image_url) VALUES
            ('Skin Aurora', 'AVATAR_SKIN', 40, 'COMMON', '/axiora/moods/happy.svg'),
            ('Skin Guardião', 'AVATAR_SKIN', 120, 'RARE', '/axiora/moods/neutral.svg'),
            ('Tema Céu Dourado', 'BACKGROUND_THEME', 80, 'RARE', '/axiora/moods/happy.svg'),
            ('Tema Oceano Tech', 'BACKGROUND_THEME', 180, 'EPIC', '/axiora/moods/tired.svg'),
            ('Celebração Estelar', 'CELEBRATION_ANIMATION', 160, 'EPIC', '/axiora/moods/angry.svg'),
            ('Celebração Lendária', 'CELEBRATION_ANIMATION', 260, 'LEGENDARY', '/axiora/moods/happy.svg'),
            ('Moldura Neon', 'BADGE_FRAME', 70, 'COMMON', '/axiora/moods/neutral.svg'),
            ('Moldura Mestre', 'BADGE_FRAME', 210, 'LEGENDARY', '/axiora/moods/sad.svg')
        ON CONFLICT ON CONSTRAINT uq_store_items_name_type DO NOTHING;
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_user_inventory_user_id;")
    op.execute("ALTER TABLE IF EXISTS user_inventory DROP CONSTRAINT IF EXISTS uq_user_inventory_user_item;")
    op.execute("DROP TABLE IF EXISTS user_inventory;")
    op.execute("ALTER TABLE IF EXISTS store_items DROP CONSTRAINT IF EXISTS uq_store_items_name_type;")
    op.execute("DROP TABLE IF EXISTS store_items;")

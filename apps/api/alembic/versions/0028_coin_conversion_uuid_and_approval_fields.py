"""update coin conversions to uuid and approval timestamps

Revision ID: 0028_coin_conversion_uuid_and_approval_fields
Revises: 0027_global_daily_xp_profile
Create Date: 2026-02-18 23:55:00
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0028_coin_conversion_uuid_and_approval_fields"
down_revision: str | None = "0027_global_daily_xp_profile"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto;")

    op.execute(
        """
        ALTER TABLE coin_conversions
        ADD COLUMN IF NOT EXISTS approved BOOLEAN NOT NULL DEFAULT false;
        """
    )
    op.execute(
        """
        ALTER TABLE coin_conversions
        ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ NULL;
        """
    )

    op.execute(
        """
        UPDATE coin_conversions
        SET approved = approved_by_parent
        WHERE approved = false;
        """
    )

    op.execute(
        """
        UPDATE coin_conversions
        SET approved_at = COALESCE(approved_at, created_at)
        WHERE approved = true AND approved_at IS NULL;
        """
    )

    op.execute("ALTER TABLE coin_conversions DROP COLUMN IF EXISTS approved_by_parent;")

    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'coin_conversions'
                  AND column_name = 'id'
                  AND data_type = 'integer'
            ) THEN
                ALTER TABLE coin_conversions ADD COLUMN id_uuid UUID DEFAULT gen_random_uuid();
                UPDATE coin_conversions SET id_uuid = gen_random_uuid() WHERE id_uuid IS NULL;
                ALTER TABLE coin_conversions DROP CONSTRAINT IF EXISTS coin_conversions_pkey;
                ALTER TABLE coin_conversions DROP COLUMN id;
                ALTER TABLE coin_conversions RENAME COLUMN id_uuid TO id;
                ALTER TABLE coin_conversions ALTER COLUMN id SET NOT NULL;
                ALTER TABLE coin_conversions ALTER COLUMN id SET DEFAULT gen_random_uuid();
                ALTER TABLE coin_conversions ADD CONSTRAINT coin_conversions_pkey PRIMARY KEY (id);
            END IF;
        END
        $$;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE coin_conversions
        ADD COLUMN IF NOT EXISTS approved_by_parent BOOLEAN NOT NULL DEFAULT false;
        """
    )
    op.execute(
        """
        UPDATE coin_conversions
        SET approved_by_parent = approved;
        """
    )
    op.execute("ALTER TABLE coin_conversions DROP COLUMN IF EXISTS approved_at;")
    op.execute("ALTER TABLE coin_conversions DROP COLUMN IF EXISTS approved;")


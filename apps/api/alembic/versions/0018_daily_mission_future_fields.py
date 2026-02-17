"""add future-ready fields to daily_missions

Revision ID: 0018_daily_mission_future_fields
Revises: 0017_daily_missions
Create Date: 2026-02-17 21:30:00
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0018_daily_mission_future_fields"
down_revision: str | None = "0017_daily_missions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'daily_mission_source_type') THEN
                CREATE TYPE daily_mission_source_type AS ENUM ('system', 'teacher', 'parent');
            END IF;
        END
        $$;
        """
    )

    op.execute("ALTER TABLE daily_missions ADD COLUMN IF NOT EXISTS tenant_id INTEGER NULL;")
    op.execute(
        """
        ALTER TABLE daily_missions
        ADD COLUMN IF NOT EXISTS source_type daily_mission_source_type NOT NULL DEFAULT 'system';
        """
    )
    op.execute("ALTER TABLE daily_missions ADD COLUMN IF NOT EXISTS source_id UUID NULL;")
    op.execute("ALTER TABLE daily_missions ADD COLUMN IF NOT EXISTS school_id INTEGER NULL;")
    op.execute("ALTER TABLE daily_missions ADD COLUMN IF NOT EXISTS class_id INTEGER NULL;")

    op.execute(
        """
        UPDATE daily_missions dm
        SET tenant_id = cp.tenant_id
        FROM child_profiles cp
        WHERE dm.child_id = cp.id
          AND dm.tenant_id IS NULL;
        """
    )

    op.execute("CREATE INDEX IF NOT EXISTS ix_daily_missions_tenant_id ON daily_missions (tenant_id);")

    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint
                WHERE conname = 'fk_daily_missions_tenant_id_tenants'
            ) THEN
                ALTER TABLE daily_missions
                ADD CONSTRAINT fk_daily_missions_tenant_id_tenants
                FOREIGN KEY (tenant_id) REFERENCES tenants(id);
            END IF;
        END
        $$;
        """
    )

    op.execute(
        """
        DO $$
        BEGIN
            IF to_regclass('public.schools') IS NOT NULL
               AND NOT EXISTS (
                   SELECT 1
                   FROM pg_constraint
                   WHERE conname = 'fk_daily_missions_school_id_schools'
               ) THEN
                ALTER TABLE daily_missions
                ADD CONSTRAINT fk_daily_missions_school_id_schools
                FOREIGN KEY (school_id) REFERENCES schools(id);
            END IF;
        END
        $$;
        """
    )

    op.execute(
        """
        DO $$
        BEGIN
            IF to_regclass('public.classes') IS NOT NULL
               AND NOT EXISTS (
                   SELECT 1
                   FROM pg_constraint
                   WHERE conname = 'fk_daily_missions_class_id_classes'
               ) THEN
                ALTER TABLE daily_missions
                ADD CONSTRAINT fk_daily_missions_class_id_classes
                FOREIGN KEY (class_id) REFERENCES classes(id);
            END IF;
        END
        $$;
        """
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE IF EXISTS daily_missions DROP CONSTRAINT IF EXISTS fk_daily_missions_class_id_classes;"
    )
    op.execute(
        "ALTER TABLE IF EXISTS daily_missions DROP CONSTRAINT IF EXISTS fk_daily_missions_school_id_schools;"
    )
    op.execute(
        "ALTER TABLE IF EXISTS daily_missions DROP CONSTRAINT IF EXISTS fk_daily_missions_tenant_id_tenants;"
    )

    op.execute("DROP INDEX IF EXISTS ix_daily_missions_tenant_id;")

    op.execute("ALTER TABLE IF EXISTS daily_missions DROP COLUMN IF EXISTS class_id;")
    op.execute("ALTER TABLE IF EXISTS daily_missions DROP COLUMN IF EXISTS school_id;")
    op.execute("ALTER TABLE IF EXISTS daily_missions DROP COLUMN IF EXISTS source_id;")
    op.execute("ALTER TABLE IF EXISTS daily_missions DROP COLUMN IF EXISTS source_type;")
    op.execute("ALTER TABLE IF EXISTS daily_missions DROP COLUMN IF EXISTS tenant_id;")

    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'daily_mission_source_type') THEN
                DROP TYPE daily_mission_source_type;
            END IF;
        END
        $$;
        """
    )

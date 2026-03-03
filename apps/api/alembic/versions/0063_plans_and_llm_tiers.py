"""introduce plans and tenant-plan association

Revision ID: 0063_plans_and_llm_tiers
Revises: 0062_axion_experiments_framework
Create Date: 2026-02-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0063_plans_and_llm_tiers"
down_revision: str | None = "0062_axion_experiments_framework"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS plans (
            name VARCHAR(32) PRIMARY KEY,
            llm_daily_budget INTEGER NOT NULL DEFAULT 0,
            llm_monthly_budget INTEGER NOT NULL DEFAULT 0,
            nba_enabled BOOLEAN NOT NULL DEFAULT true,
            advanced_personalization_enabled BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_plans_active_name ON plans(name);")

    op.execute(
        """
        INSERT INTO plans (name, llm_daily_budget, llm_monthly_budget, nba_enabled, advanced_personalization_enabled)
        VALUES
            ('FREE', 0, 0, true, false),
            ('PRO', 20000, 500000, true, true),
            ('PREMIUM', 100000, 3000000, true, true)
        ON CONFLICT (name) DO NOTHING;
        """
    )

    op.add_column("tenants", sa.Column("plan_name", sa.String(length=32), nullable=False, server_default=sa.text("'FREE'")))
    op.execute("CREATE INDEX IF NOT EXISTS ix_tenants_plan_name ON tenants(plan_name);")
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM information_schema.table_constraints
                WHERE constraint_name = 'fk_tenants_plan_name_plans'
            ) THEN
                ALTER TABLE tenants
                ADD CONSTRAINT fk_tenants_plan_name_plans
                FOREIGN KEY (plan_name) REFERENCES plans(name);
            END IF;
        END
        $$;
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE tenants DROP CONSTRAINT IF EXISTS fk_tenants_plan_name_plans;")
    op.execute("DROP INDEX IF EXISTS ix_tenants_plan_name;")
    op.drop_column("tenants", "plan_name")

    op.execute("DROP INDEX IF EXISTS ix_plans_active_name;")
    op.execute("DROP TABLE IF EXISTS plans;")

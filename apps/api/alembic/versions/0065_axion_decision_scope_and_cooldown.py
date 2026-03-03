"""add decision scope and cooldown metadata

Revision ID: 0065_axion_decision_scope_and_cooldown
Revises: 0064_axion_child_profile
Create Date: 2026-02-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0065_axion_decision_scope_and_cooldown"
down_revision: str | None = "0064_axion_child_profile"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("axion_decisions", sa.Column("tenant_id", sa.Integer(), nullable=True))
    op.add_column("axion_decisions", sa.Column("child_id", sa.Integer(), nullable=True))
    op.add_column("axion_decisions", sa.Column("action_type", sa.String(length=80), nullable=True))
    op.add_column("axion_decisions", sa.Column("source", sa.String(length=40), nullable=True))
    op.add_column("axion_decisions", sa.Column("cooldown_until", sa.DateTime(timezone=True), nullable=True))

    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM information_schema.table_constraints
                WHERE constraint_name = 'fk_axion_decisions_tenant_id'
            ) THEN
                ALTER TABLE axion_decisions
                ADD CONSTRAINT fk_axion_decisions_tenant_id
                FOREIGN KEY (tenant_id) REFERENCES tenants(id);
            END IF;
            IF NOT EXISTS (
                SELECT 1
                FROM information_schema.table_constraints
                WHERE constraint_name = 'fk_axion_decisions_child_id'
            ) THEN
                ALTER TABLE axion_decisions
                ADD CONSTRAINT fk_axion_decisions_child_id
                FOREIGN KEY (child_id) REFERENCES child_profiles(id);
            END IF;
        END
        $$;
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_axion_decisions_tenant_child_context_created_at
        ON axion_decisions (tenant_id, child_id, context, created_at);
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_axion_decisions_cooldown_until
        ON axion_decisions (cooldown_until);
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_axion_decisions_cooldown_until;")
    op.execute("DROP INDEX IF EXISTS ix_axion_decisions_tenant_child_context_created_at;")
    op.execute("ALTER TABLE axion_decisions DROP CONSTRAINT IF EXISTS fk_axion_decisions_child_id;")
    op.execute("ALTER TABLE axion_decisions DROP CONSTRAINT IF EXISTS fk_axion_decisions_tenant_id;")
    op.drop_column("axion_decisions", "cooldown_until")
    op.drop_column("axion_decisions", "source")
    op.drop_column("axion_decisions", "action_type")
    op.drop_column("axion_decisions", "child_id")
    op.drop_column("axion_decisions", "tenant_id")

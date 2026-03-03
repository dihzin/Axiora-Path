"""add nba governance fields on axion decisions

Revision ID: 0067_axion_nba_governance_fields
Revises: 0066_axion_retention_uuid_index
Create Date: 2026-02-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0067_axion_nba_governance_fields"
down_revision: str | None = "0066_axion_retention_uuid_index"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("axion_decisions", sa.Column("experiment_key", sa.String(length=80), nullable=True))
    op.add_column("axion_decisions", sa.Column("nba_enabled_final", sa.Boolean(), nullable=False, server_default=sa.text("true")))
    op.add_column(
        "axion_decisions",
        sa.Column("nba_reason", sa.String(length=40), nullable=False, server_default=sa.text("'default'")),
    )
    op.execute(
        """
        UPDATE axion_decisions
        SET experiment_key = experiment_id
        WHERE experiment_id IS NOT NULL AND experiment_key IS NULL;
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_axion_decisions_experiment_key_variant_created_at
        ON axion_decisions (experiment_key, variant, created_at);
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_axion_decisions_nba_reason_created_at
        ON axion_decisions (nba_reason, created_at);
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_axion_decisions_nba_reason_created_at;")
    op.execute("DROP INDEX IF EXISTS ix_axion_decisions_experiment_key_variant_created_at;")
    op.drop_column("axion_decisions", "nba_reason")
    op.drop_column("axion_decisions", "nba_enabled_final")
    op.drop_column("axion_decisions", "experiment_key")

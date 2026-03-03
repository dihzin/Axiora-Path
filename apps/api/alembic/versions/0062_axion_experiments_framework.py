"""axion experiments framework base

Revision ID: 0062_axion_experiments_framework
Revises: 0061_axion_retention_event_indexes
Create Date: 2026-02-26
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0062_axion_experiments_framework"
down_revision: str | None = "0061_axion_retention_event_indexes"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS axion_experiments (
            experiment_id VARCHAR(80) NOT NULL,
            variant VARCHAR(80) NOT NULL,
            allocation_percentage NUMERIC(5,2) NOT NULL,
            active BOOLEAN NOT NULL DEFAULT false,
            start_date DATE NOT NULL,
            end_date DATE NULL,
            PRIMARY KEY (experiment_id, variant)
        );
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_axion_experiments_active_window ON axion_experiments (active, start_date, end_date);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_axion_experiments_experiment_id ON axion_experiments (experiment_id);"
    )

    op.add_column("axion_decisions", sa.Column("experiment_id", sa.String(length=80), nullable=True))
    op.add_column("axion_decisions", sa.Column("variant", sa.String(length=80), nullable=True))
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_axion_decisions_experiment_variant_created_at ON axion_decisions (experiment_id, variant, created_at);"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_axion_decisions_experiment_variant_created_at;")
    op.drop_column("axion_decisions", "variant")
    op.drop_column("axion_decisions", "experiment_id")

    op.execute("DROP INDEX IF EXISTS ix_axion_experiments_experiment_id;")
    op.execute("DROP INDEX IF EXISTS ix_axion_experiments_active_window;")
    op.execute("DROP TABLE IF EXISTS axion_experiments;")

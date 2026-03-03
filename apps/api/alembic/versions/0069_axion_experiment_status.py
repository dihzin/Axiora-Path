"""add experiment status to axion experiments

Revision ID: 0069_axion_experiment_status
Revises: 0068_axion_experiment_winner_variant
Create Date: 2026-02-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0069_axion_experiment_status"
down_revision: str | None = "0068_axion_experiment_winner_variant"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "axion_experiments",
        sa.Column("experiment_status", sa.String(length=20), nullable=False, server_default="ACTIVE"),
    )
    op.execute(
        """
        UPDATE axion_experiments
        SET experiment_status = CASE
            WHEN active = true THEN 'ACTIVE'
            ELSE 'PAUSED'
        END
        """
    )


def downgrade() -> None:
    op.drop_column("axion_experiments", "experiment_status")

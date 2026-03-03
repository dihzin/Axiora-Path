"""add rollout scaling fields to axion experiments

Revision ID: 0070_axion_rollout_scaling
Revises: 0069_axion_experiment_status
Create Date: 2026-02-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0070_axion_rollout_scaling"
down_revision: str | None = "0069_axion_experiment_status"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("axion_experiments", sa.Column("rollout_percent", sa.Integer(), nullable=True))
    op.add_column("axion_experiments", sa.Column("rollout_last_scaled_at", sa.DateTime(timezone=True), nullable=True))
    op.execute(
        """
        UPDATE axion_experiments
        SET rollout_percent = 100
        WHERE rollout_percent IS NULL
        """
    )


def downgrade() -> None:
    op.drop_column("axion_experiments", "rollout_last_scaled_at")
    op.drop_column("axion_experiments", "rollout_percent")

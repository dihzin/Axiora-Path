"""add experiment winner variant field

Revision ID: 0068_axion_experiment_winner_variant
Revises: 0067_axion_nba_governance_fields
Create Date: 2026-02-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0068_axion_experiment_winner_variant"
down_revision: str | None = "0067_axion_nba_governance_fields"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("axion_experiments", sa.Column("experiment_winner_variant", sa.String(length=80), nullable=True))


def downgrade() -> None:
    op.drop_column("axion_experiments", "experiment_winner_variant")

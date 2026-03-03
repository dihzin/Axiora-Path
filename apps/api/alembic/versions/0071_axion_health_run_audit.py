"""add health runner audit fields to axion experiments

Revision ID: 0071_axion_health_run_audit
Revises: 0070_axion_rollout_scaling
Create Date: 2026-02-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0071_axion_health_run_audit"
down_revision: str | None = "0070_axion_rollout_scaling"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("axion_experiments", sa.Column("last_health_run_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("axion_experiments", sa.Column("last_health_run_id", postgresql.UUID(as_uuid=False), nullable=True))
    op.add_column("axion_experiments", sa.Column("last_health_run_reason", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("axion_experiments", "last_health_run_reason")
    op.drop_column("axion_experiments", "last_health_run_id")
    op.drop_column("axion_experiments", "last_health_run_at")

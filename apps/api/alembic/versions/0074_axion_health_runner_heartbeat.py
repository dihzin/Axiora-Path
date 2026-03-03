"""create heartbeat table for health runner operational proof

Revision ID: 0074_axion_health_runner_heartbeat
Revises: 0073_axion_retention_brief_session_indexes
Create Date: 2026-02-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0074_axion_health_runner_heartbeat"
down_revision: str | None = "0073_axion_retention_brief_session_indexes"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "axion_health_runner_heartbeat",
        sa.Column("id", postgresql.UUID(as_uuid=False), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("environment", sa.String(length=32), nullable=False),
        sa.Column("ran_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("run_id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("experiments_attempted", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("experiments_processed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("experiments_skipped_locked", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("duration_ms", sa.Integer(), nullable=False, server_default="0"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_axion_health_runner_heartbeat_env_ran_at",
        "axion_health_runner_heartbeat",
        ["environment", "ran_at"],
        unique=False,
    )
    op.create_index(
        "ix_axion_health_runner_heartbeat_run_id",
        "axion_health_runner_heartbeat",
        ["run_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_axion_health_runner_heartbeat_run_id", table_name="axion_health_runner_heartbeat")
    op.drop_index("ix_axion_health_runner_heartbeat_env_ran_at", table_name="axion_health_runner_heartbeat")
    op.drop_table("axion_health_runner_heartbeat")

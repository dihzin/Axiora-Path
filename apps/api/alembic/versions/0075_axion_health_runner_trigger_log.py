"""create trigger log table for external health runner resilience

Revision ID: 0075_axion_health_runner_trigger_log
Revises: 0074_axion_health_runner_heartbeat
Create Date: 2026-02-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0075_axion_health_runner_trigger_log"
down_revision: str | None = "0074_axion_health_runner_heartbeat"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "axion_health_runner_trigger_log",
        sa.Column("id", postgresql.UUID(as_uuid=False), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("run_id", postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column("triggered_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("status", sa.String(length=10), nullable=False),
        sa.Column("error_code", sa.String(length=80), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=False, server_default="0"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_axion_health_runner_trigger_log_triggered_at",
        "axion_health_runner_trigger_log",
        ["triggered_at"],
        unique=False,
    )
    op.create_index(
        "ix_axion_health_runner_trigger_log_run_id",
        "axion_health_runner_trigger_log",
        ["run_id"],
        unique=False,
    )
    op.create_index(
        "ix_axion_health_runner_trigger_log_status_triggered_at",
        "axion_health_runner_trigger_log",
        ["status", "triggered_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_axion_health_runner_trigger_log_status_triggered_at", table_name="axion_health_runner_trigger_log")
    op.drop_index("ix_axion_health_runner_trigger_log_run_id", table_name="axion_health_runner_trigger_log")
    op.drop_index("ix_axion_health_runner_trigger_log_triggered_at", table_name="axion_health_runner_trigger_log")
    op.drop_table("axion_health_runner_trigger_log")

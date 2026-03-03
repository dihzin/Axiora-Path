"""create axion feature snapshot table

Revision ID: 0076_axion_feature_snapshot
Revises: 0075_axion_health_runner_trigger_log
Create Date: 2026-02-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0076_axion_feature_snapshot"
down_revision: str | None = "0075_axion_health_runner_trigger_log"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "axion_feature_snapshot",
        sa.Column("id", postgresql.UUID(as_uuid=False), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("experiment_key", sa.String(length=80), nullable=True),
        sa.Column("variant", sa.String(length=80), nullable=True),
        sa.Column("features_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("snapshot_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_axion_feature_snapshot_tenant_experiment_snapshot",
        "axion_feature_snapshot",
        ["tenant_id", "experiment_key", "snapshot_at"],
        unique=False,
    )
    op.create_index(
        "ix_axion_feature_snapshot_user_snapshot",
        "axion_feature_snapshot",
        ["user_id", "snapshot_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_axion_feature_snapshot_user_snapshot", table_name="axion_feature_snapshot")
    op.drop_index("ix_axion_feature_snapshot_tenant_experiment_snapshot", table_name="axion_feature_snapshot")
    op.drop_table("axion_feature_snapshot")

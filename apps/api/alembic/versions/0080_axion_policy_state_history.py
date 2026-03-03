"""create axion policy state history

Revision ID: 0080_axion_policy_state_history
Revises: 0079_axion_reward_contract
Create Date: 2026-02-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0080_axion_policy_state_history"
down_revision: str | None = "0079_axion_reward_contract"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "axion_policy_state_history",
        sa.Column("id", postgresql.UUID(as_uuid=False), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("experiment_key", sa.String(length=80), nullable=False),
        sa.Column("from_state", sa.String(length=20), nullable=False),
        sa.Column("to_state", sa.String(length=20), nullable=False),
        sa.Column("actor_user_id", sa.Integer(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("changed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_axion_policy_state_history_tenant_experiment_changed_at",
        "axion_policy_state_history",
        ["tenant_id", "experiment_key", "changed_at"],
        unique=False,
    )
    op.create_index(
        "ix_axion_policy_state_history_experiment_changed_at",
        "axion_policy_state_history",
        ["experiment_key", "changed_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_axion_policy_state_history_experiment_changed_at", table_name="axion_policy_state_history")
    op.drop_index("ix_axion_policy_state_history_tenant_experiment_changed_at", table_name="axion_policy_state_history")
    op.drop_table("axion_policy_state_history")

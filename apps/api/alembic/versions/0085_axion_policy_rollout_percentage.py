"""add rollout_percentage to axion policy state history

Revision ID: 0085_axion_policy_rollout_percentage
Revises: 0084_axion_decision_policy_invariants
Create Date: 2026-02-26 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision: str = "0085_axion_policy_rollout_percentage"
down_revision: str | None = "0084_axion_decision_policy_invariants"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("axion_policy_state_history", sa.Column("rollout_percentage", sa.Integer(), nullable=True))
    op.create_check_constraint(
        "ck_axion_policy_state_history_rollout_percentage",
        "axion_policy_state_history",
        "(rollout_percentage IS NULL) OR (rollout_percentage >= 0 AND rollout_percentage <= 100)",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_axion_policy_state_history_rollout_percentage",
        "axion_policy_state_history",
        type_="check",
    )
    op.drop_column("axion_policy_state_history", "rollout_percentage")


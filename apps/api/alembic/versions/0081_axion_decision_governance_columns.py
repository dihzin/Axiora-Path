"""add governance columns to axion_decisions

Revision ID: 0081_axion_decision_governance_columns
Revises: 0080_axion_policy_state_history
Create Date: 2026-02-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0081_axion_decision_governance_columns"
down_revision: str | None = "0080_axion_policy_state_history"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("axion_decisions", sa.Column("chosen_variant", sa.String(length=80), nullable=True))
    op.add_column("axion_decisions", sa.Column("decided_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")))
    op.add_column("axion_decisions", sa.Column("decision_mode", sa.String(length=20), nullable=False, server_default=sa.text("'level4'")))
    op.add_column("axion_decisions", sa.Column("policy_state", sa.String(length=20), nullable=True))
    op.add_column("axion_decisions", sa.Column("policy_version", sa.Integer(), nullable=True))
    op.add_column("axion_decisions", sa.Column("exploration_flag", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("axion_decisions", sa.Column("reason_code", sa.String(length=80), nullable=False, server_default=sa.text("'default'")))
    op.add_column(
        "axion_decisions",
        sa.Column("metadata_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
    )
    op.create_index("ix_axion_decisions_experiment_key_decided_at", "axion_decisions", ["experiment_key", "decided_at"], unique=False)

    op.execute(sa.text("UPDATE axion_decisions SET chosen_variant = variant WHERE chosen_variant IS NULL"))
    op.execute(sa.text("UPDATE axion_decisions SET decided_at = created_at WHERE decided_at IS NULL"))
    op.execute(sa.text("UPDATE axion_decisions SET reason_code = COALESCE(nba_reason, 'default') WHERE reason_code IS NULL"))


def downgrade() -> None:
    op.drop_index("ix_axion_decisions_experiment_key_decided_at", table_name="axion_decisions")
    op.drop_column("axion_decisions", "metadata_json")
    op.drop_column("axion_decisions", "reason_code")
    op.drop_column("axion_decisions", "exploration_flag")
    op.drop_column("axion_decisions", "policy_version")
    op.drop_column("axion_decisions", "policy_state")
    op.drop_column("axion_decisions", "decision_mode")
    op.drop_column("axion_decisions", "decided_at")
    op.drop_column("axion_decisions", "chosen_variant")

"""create axion reward contract table

Revision ID: 0079_axion_reward_contract
Revises: 0078_axion_shadow_policy_candidate
Create Date: 2026-02-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0079_axion_reward_contract"
down_revision: str | None = "0078_axion_shadow_policy_candidate"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "axion_reward_contract",
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column(
            "formula_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "weights_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.PrimaryKeyConstraint("version"),
    )
    op.create_index(
        "ix_axion_reward_contract_active_created_at",
        "axion_reward_contract",
        ["active", "created_at"],
        unique=False,
    )
    op.create_index(
        "uq_axion_reward_contract_single_active",
        "axion_reward_contract",
        ["active"],
        unique=True,
        postgresql_where=sa.text("active = true"),
    )

    op.execute(
        sa.text(
            """
            INSERT INTO axion_reward_contract (version, formula_json, weights_json, active)
            VALUES (
                1,
                CAST(:formula_json AS jsonb),
                CAST(:weights_json AS jsonb),
                true
            )
            """
        ).bindparams(
            formula_json=(
                '{"name":"reward_v1","expression":"w1*session_completed + w2*retention_d1 + w3*retention_d7 - w4*churn_signal - w5*inactivity_decay",'
                '"signals":{"session_completed":"cta_to_session_conversion","retention_d1":"d1_rate","retention_d7":"d7_rate",'
                '"churn_signal":"max(0,100-retention_d7)","inactivity_decay":"max(0,100-min(100,session_frequency*20))"}}'
            ),
            weights_json='{"w1":0.4,"w2":0.3,"w3":0.3,"w4":0.0,"w5":0.0}',
        )
    )


def downgrade() -> None:
    op.drop_index("uq_axion_reward_contract_single_active", table_name="axion_reward_contract")
    op.drop_index("ix_axion_reward_contract_active_created_at", table_name="axion_reward_contract")
    op.drop_table("axion_reward_contract")

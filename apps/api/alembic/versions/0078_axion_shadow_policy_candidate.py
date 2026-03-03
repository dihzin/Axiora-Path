"""create axion shadow policy candidate table

Revision ID: 0078_axion_shadow_policy_candidate
Revises: 0077_axion_feature_registry
Create Date: 2026-02-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0078_axion_shadow_policy_candidate"
down_revision: str | None = "0077_axion_feature_registry"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "axion_shadow_policy_candidate",
        sa.Column("id", postgresql.UUID(as_uuid=False), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("experiment_key", sa.String(length=80), nullable=False),
        sa.Column("policy_version", sa.Integer(), nullable=False),
        sa.Column(
            "weight_vector_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("expected_lift", sa.Numeric(precision=8, scale=4), nullable=False, server_default="0"),
        sa.Column("confidence_score", sa.Numeric(precision=8, scale=4), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "experiment_key", "policy_version", name="uq_axion_shadow_policy_candidate_version"),
    )
    op.create_index(
        "ix_axion_shadow_policy_candidate_tenant_experiment_created_at",
        "axion_shadow_policy_candidate",
        ["tenant_id", "experiment_key", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_axion_shadow_policy_candidate_tenant_experiment_created_at", table_name="axion_shadow_policy_candidate")
    op.drop_table("axion_shadow_policy_candidate")

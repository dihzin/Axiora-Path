"""create feature registry and version snapshots

Revision ID: 0077_axion_feature_registry
Revises: 0076_axion_feature_snapshot
Create Date: 2026-02-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0077_axion_feature_registry"
down_revision: str | None = "0076_axion_feature_snapshot"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "axion_feature_registry",
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column(
            "feature_schema_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.PrimaryKeyConstraint("version"),
    )
    op.create_index(
        "ix_axion_feature_registry_active_created_at",
        "axion_feature_registry",
        ["active", "created_at"],
        unique=False,
    )
    op.create_index(
        "uq_axion_feature_registry_single_active",
        "axion_feature_registry",
        ["active"],
        unique=True,
        postgresql_where=sa.text("active = true"),
    )

    op.add_column(
        "axion_feature_snapshot",
        sa.Column("feature_version", sa.Integer(), nullable=False, server_default="1"),
    )


def downgrade() -> None:
    op.drop_column("axion_feature_snapshot", "feature_version")
    op.drop_index("uq_axion_feature_registry_single_active", table_name="axion_feature_registry")
    op.drop_index("ix_axion_feature_registry_active_created_at", table_name="axion_feature_registry")
    op.drop_table("axion_feature_registry")

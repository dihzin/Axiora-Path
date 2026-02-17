"""create feature_flags table

Revision ID: 0011_feature_flags
Revises: 0010_soft_delete_foundation
Create Date: 2026-02-17 06:05:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0011_feature_flags"
down_revision: str | None = "0010_soft_delete_foundation"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "feature_flags",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("enabled_globally", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("tenant_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name", "tenant_id", name="uq_feature_flags_name_tenant_id"),
    )


def downgrade() -> None:
    op.drop_table("feature_flags")

"""add correlation_id to axion_decisions with tenant scoped uniqueness

Revision ID: 0083_axion_decisions_correlation_id
Revises: 0082_membership_platform_admin_role
Create Date: 2026-02-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0083_axion_decisions_correlation_id"
down_revision: str | None = "0082_membership_platform_admin_role"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("axion_decisions", sa.Column("correlation_id", postgresql.UUID(as_uuid=False), nullable=True))

    # Backfill from metadata_json when previous runs already stored correlation_id there.
    op.execute(
        sa.text(
            """
            UPDATE axion_decisions
            SET correlation_id = (metadata_json->>'correlation_id')::uuid
            WHERE correlation_id IS NULL
              AND metadata_json ? 'correlation_id'
              AND (metadata_json->>'correlation_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            """
        )
    )

    op.create_index(
        "uq_axion_decisions_tenant_correlation_id",
        "axion_decisions",
        ["tenant_id", "correlation_id"],
        unique=True,
        postgresql_where=sa.text("correlation_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_axion_decisions_tenant_correlation_id", table_name="axion_decisions")
    op.drop_column("axion_decisions", "correlation_id")


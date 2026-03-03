"""add PLATFORM_ADMIN membership role

Revision ID: 0082_membership_platform_admin_role
Revises: 0081_axion_decision_governance_columns
Create Date: 2026-02-26
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0082_membership_platform_admin_role"
down_revision: str | None = "0081_axion_decision_governance_columns"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TYPE membership_role ADD VALUE IF NOT EXISTS 'PLATFORM_ADMIN';")
    op.execute(
        """
        UPDATE memberships m
        SET role = 'PLATFORM_ADMIN'
        FROM tenants t
        WHERE m.tenant_id = t.id
          AND t.slug = 'platform-admin'
          AND m.role IN ('PARENT', 'TEACHER');
        """
    )


def downgrade() -> None:
    # PostgreSQL enums do not support dropping a single value safely in-place.
    # Keep downgrade as no-op to preserve data integrity.
    return


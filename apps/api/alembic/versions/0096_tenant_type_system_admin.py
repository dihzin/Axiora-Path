"""add system admin tenant type

Revision ID: 0096_tenant_type_system_admin
Revises: 0095_membership_school_hierarchy_roles
Create Date: 2026-03-11 00:00:00.000000
"""

from __future__ import annotations

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "0096_tenant_type_system_admin"
down_revision: str | None = "0095_membership_school_hierarchy_roles"
branch_labels: tuple[str, ...] | None = None
depends_on: tuple[str, ...] | None = None


def upgrade() -> None:
    op.execute("ALTER TYPE tenant_type ADD VALUE IF NOT EXISTS 'SYSTEM_ADMIN';")


def downgrade() -> None:
    # PostgreSQL enum values are not removed in downgrade to avoid destructive data rewrites.
    pass

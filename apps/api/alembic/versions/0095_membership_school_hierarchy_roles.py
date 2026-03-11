"""add director and student membership roles

Revision ID: 0095_membership_school_hierarchy_roles
Revises: 0094_child_profiles_created_by_user
Create Date: 2026-03-11 00:00:00.000000
"""

from __future__ import annotations

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "0095_membership_school_hierarchy_roles"
down_revision: str | None = "0094_child_profiles_created_by_user"
branch_labels: tuple[str, ...] | None = None
depends_on: tuple[str, ...] | None = None


def upgrade() -> None:
    op.execute("ALTER TYPE membership_role ADD VALUE IF NOT EXISTS 'DIRECTOR';")
    op.execute("ALTER TYPE membership_role ADD VALUE IF NOT EXISTS 'STUDENT';")


def downgrade() -> None:
    # PostgreSQL enum values are not removed in downgrade to avoid destructive data rewrites.
    pass

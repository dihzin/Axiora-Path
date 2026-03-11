"""add guardian membership role

Revision ID: 0099_membership_guardian_role
Revises: 0098_child_guardians_table
Create Date: 2026-03-11 00:00:00.000000
"""

from __future__ import annotations

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "0099_membership_guardian_role"
down_revision: str | None = "0098_child_guardians_table"
branch_labels: tuple[str, ...] | None = None
depends_on: tuple[str, ...] | None = None


def upgrade() -> None:
    op.execute("ALTER TYPE membership_role ADD VALUE IF NOT EXISTS 'GUARDIAN';")


def downgrade() -> None:
    # PostgreSQL enum values are not removed in downgrade to avoid destructive data rewrites.
    pass

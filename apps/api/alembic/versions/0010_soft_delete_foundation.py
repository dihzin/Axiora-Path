"""add soft delete columns for tenant child task

Revision ID: 0010_soft_delete_foundation
Revises: 0009_parental_consent
Create Date: 2026-02-17 05:10:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0010_soft_delete_foundation"
down_revision: str | None = "0009_parental_consent"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("child_profiles", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("tasks", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("tasks", "deleted_at")
    op.drop_column("child_profiles", "deleted_at")
    op.drop_column("tenants", "deleted_at")

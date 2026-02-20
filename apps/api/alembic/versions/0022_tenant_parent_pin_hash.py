"""add parent pin hash to tenants

Revision ID: 0022_tenant_parent_pin_hash
Revises: 0021_dm_child_date_desc_idx
Create Date: 2026-02-17 16:40:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0022_tenant_parent_pin_hash"
down_revision: str | None = "0021_dm_child_date_desc_idx"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("parent_pin_hash", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("tenants", "parent_pin_hash")

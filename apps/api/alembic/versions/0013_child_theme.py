"""add child profile theme

Revision ID: 0013_child_theme
Revises: 0012_user_security_fields
Create Date: 2026-02-17 07:15:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0013_child_theme"
down_revision: str | None = "0012_user_security_fields"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("child_profiles", sa.Column("theme", sa.String(length=32), nullable=False, server_default="default"))


def downgrade() -> None:
    op.drop_column("child_profiles", "theme")

"""add child profile avatar stage

Revision ID: 0015_child_avatar_stage
Revises: 0014_achievements
Create Date: 2026-02-17 08:45:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0015_child_avatar_stage"
down_revision: str | None = "0014_achievements"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("child_profiles", sa.Column("avatar_stage", sa.Integer(), nullable=False, server_default="1"))


def downgrade() -> None:
    op.drop_column("child_profiles", "avatar_stage")

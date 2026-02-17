"""add xp_total to child_profiles

Revision ID: 0004_child_xp_total
Revises: 0003_streak_freeze_tokens
Create Date: 2026-02-17 01:20:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0004_child_xp_total"
down_revision: str | None = "0003_streak_freeze_tokens"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "child_profiles",
        sa.Column("xp_total", sa.Integer(), server_default=sa.text("0"), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("child_profiles", "xp_total")


"""add freeze tokens to streaks

Revision ID: 0003_streak_freeze_tokens
Revises: 0002_streaks_recommendations
Create Date: 2026-02-17 01:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0003_streak_freeze_tokens"
down_revision: str | None = "0002_streaks_recommendations"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "streaks",
        sa.Column("freeze_tokens", sa.Integer(), server_default=sa.text("1"), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("streaks", "freeze_tokens")


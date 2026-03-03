"""add per-child flag to enable or disable Axion NBA

Revision ID: 0059_axion_nba_flag
Revises: 0058_multiplayer_engine_gt
Create Date: 2026-02-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0059_axion_nba_flag"
down_revision: str | None = "0058_multiplayer_engine_gt"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "child_profiles",
        sa.Column(
            "axion_nba_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )


def downgrade() -> None:
    op.drop_column("child_profiles", "axion_nba_enabled")

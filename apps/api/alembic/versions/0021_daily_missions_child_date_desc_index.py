"""add daily_missions child/date desc index

Revision ID: 0021_daily_missions_child_date_desc_index
Revises: 0020_mission_templates
Create Date: 2026-02-17 23:40:00
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0021_daily_missions_child_date_desc_index"
down_revision: str | None = "0020_mission_templates"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_daily_missions_child_date
        ON daily_missions (child_id, date DESC);
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_daily_missions_child_date;")

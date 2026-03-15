"""games ranking weekly composite index

Revision ID: 0107_games_ranking_weekly_index
Revises: 0106_games_metagame_mission_claims
Create Date: 2026-03-14 00:00:00.000000
"""

from __future__ import annotations

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "0107_games_ranking_weekly_index"
down_revision: str | None = "0106_games_metagame_mission_claims"
branch_labels: tuple[str, ...] | None = None
depends_on: tuple[str, ...] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_game_sessions_ranking_weekly
        ON game_sessions (tenant_id, game_id, created_at DESC, child_id)
        WHERE completed IS TRUE AND child_id IS NOT NULL;
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_game_sessions_ranking_weekly;")


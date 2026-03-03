"""add index for axion decision traceability in event log

Revision ID: 0060_event_log_decision_idx
Revises: 0059_axion_nba_flag
Create Date: 2026-02-26
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0060_event_log_decision_idx"
down_revision: str | None = "0059_axion_nba_flag"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_event_log_decision_id_created_at
        ON event_log ((payload->>'decision_id'), created_at);
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_event_log_decision_id_created_at;")

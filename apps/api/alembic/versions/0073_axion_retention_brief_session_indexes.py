"""add retention indexes for brief exposure and session completed scans

Revision ID: 0073_axion_retention_brief_session_indexes
Revises: 0072_axion_retention_perf_indexes
Create Date: 2026-02-26
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0073_axion_retention_brief_session_indexes"
down_revision: str | None = "0072_axion_retention_perf_indexes"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # "axion_brief_exposed(experiment_key, user_id, created_at)" is represented by:
    # - experiment_key/user_id on axion_decisions
    # - created_at/type on event_log brief exposure rows.
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_event_log_brief_exposed_user_created_at
        ON event_log (actor_user_id, created_at)
        WHERE type = 'axion_brief_exposed';
        """
    )

    # Keep explicit guarantee for session_completed(user_id, completed_at).
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_event_log_session_completed_user_created_at
        ON event_log (actor_user_id, created_at)
        WHERE type = 'axion_session_completed';
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_event_log_session_completed_user_created_at;")
    op.execute("DROP INDEX IF EXISTS ix_event_log_brief_exposed_user_created_at;")

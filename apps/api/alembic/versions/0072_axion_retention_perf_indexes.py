"""add retention performance indexes for first-exposure cohort query

Revision ID: 0072_axion_retention_perf_indexes
Revises: 0071_axion_health_run_audit
Create Date: 2026-02-26
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0072_axion_retention_perf_indexes"
down_revision: str | None = "0071_axion_health_run_audit"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Equivalent to "axion_brief_exposed(experiment_key, user_id, created_at)" in the current model:
    # experiment_key/user_id live in axion_decisions, and brief exposure timestamps live in event_log.
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_axion_decisions_experiment_user_created_at
        ON axion_decisions (experiment_key, user_id, created_at);
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_axion_decisions_experiment_id_user_created_at
        ON axion_decisions (experiment_id, user_id, created_at);
        """
    )

    # Equivalent to "session_completed(user_id, completed_at)" in event_log.
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_event_log_session_completed_user_created_at
        ON event_log (actor_user_id, created_at)
        WHERE type = 'axion_session_completed';
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_event_log_session_completed_user_created_at;")
    op.execute("DROP INDEX IF EXISTS ix_axion_decisions_experiment_id_user_created_at;")
    op.execute("DROP INDEX IF EXISTS ix_axion_decisions_experiment_user_created_at;")

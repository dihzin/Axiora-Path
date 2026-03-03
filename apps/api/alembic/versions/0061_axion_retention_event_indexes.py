"""add event log indexes for axion retention metrics

Revision ID: 0061_axion_retention_event_indexes
Revises: 0060_event_log_decision_idx
Create Date: 2026-02-26
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0061_axion_retention_event_indexes"
down_revision: str | None = "0060_event_log_decision_idx"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_event_log_type_tenant_created_at
        ON event_log (type, tenant_id, created_at);
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_event_log_type_decision_id_created_at
        ON event_log (type, (payload->>'decision_id'), created_at)
        WHERE payload ? 'decision_id';
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_event_log_type_decision_id_created_at;")
    op.execute("DROP INDEX IF EXISTS ix_event_log_type_tenant_created_at;")

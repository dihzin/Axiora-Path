"""add uuid-cast decision index for retention query

Revision ID: 0066_axion_retention_uuid_index
Revises: 0065_axion_decision_scope_and_cooldown
Create Date: 2026-02-26
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0066_axion_retention_uuid_index"
down_revision: str | None = "0065_axion_decision_scope_and_cooldown"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


UUID_PATTERN = "^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"


def upgrade() -> None:
    op.execute(
        f"""
    CREATE INDEX IF NOT EXISTS ix_event_log_type_decision_uuid_created_at
    ON event_log (type, ((payload->>'decision_id')::uuid), created_at)
    WHERE payload ? 'decision_id'
      AND (payload->>'decision_id') ~* '{UUID_PATTERN}';
    """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_event_log_type_decision_uuid_created_at;")

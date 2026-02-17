"""add index on task_logs(child_id, date)

Revision ID: 0007_task_logs_child_date_index
Revises: 0006_tenant_onboarding_flag
Create Date: 2026-02-17 03:00:00
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0007_task_logs_child_date_index"
down_revision: str | None = "0006_tenant_onboarding_flag"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index("ix_task_logs_child_id_date", "task_logs", ["child_id", "date"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_task_logs_child_id_date", table_name="task_logs")


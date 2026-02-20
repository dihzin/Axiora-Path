"""axion outcome metrics

Revision ID: 0051_axion_outcome_metrics
Revises: 0050_axion_studio
Create Date: 2026-02-20 12:30:00
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0051_axion_outcome_metrics"
down_revision: str | None = "0050_axion_studio"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'axion_outcome_metric_type') THEN
                CREATE TYPE axion_outcome_metric_type AS ENUM (
                    'XP_GAIN',
                    'SESSION_COMPLETED',
                    'STREAK_MAINTAINED',
                    'REVIEW_DONE'
                );
            END IF;
        END
        $$;
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS axion_outcome_metrics (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            decision_id UUID NOT NULL REFERENCES axion_decisions(id) ON DELETE CASCADE,
            metric_type axion_outcome_metric_type NOT NULL,
            value_before NUMERIC(12,4) NOT NULL DEFAULT 0,
            value_after NUMERIC(12,4) NOT NULL DEFAULT 0,
            delta NUMERIC(12,4) NOT NULL DEFAULT 0,
            measured_at TIMESTAMPTZ NOT NULL,
            CONSTRAINT uq_axion_outcome_metric_once UNIQUE (decision_id, metric_type, measured_at)
        );
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_axion_outcome_metrics_user_measured_at ON axion_outcome_metrics(user_id, measured_at);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_axion_outcome_metrics_decision_id ON axion_outcome_metrics(decision_id);")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_axion_outcome_metrics_decision_id;")
    op.execute("DROP INDEX IF EXISTS ix_axion_outcome_metrics_user_measured_at;")
    op.execute("DROP TABLE IF EXISTS axion_outcome_metrics;")
    op.execute("DROP TYPE IF EXISTS axion_outcome_metric_type;")


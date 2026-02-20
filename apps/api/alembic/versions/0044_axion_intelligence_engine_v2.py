"""axion intelligence engine v2 behavior metrics

Revision ID: 0044_axion_intelligence_engine_v2
Revises: 0043_weekly_missions_and_season_events
Create Date: 2026-02-20 06:10:00
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0044_axion_intelligence_engine_v2"
down_revision: str | None = "0043_weekly_missions_and_season_events"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS user_behavior_metrics (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            rhythm_score NUMERIC(5,4) NOT NULL DEFAULT 0,
            frustration_score NUMERIC(5,4) NOT NULL DEFAULT 0,
            confidence_score NUMERIC(5,4) NOT NULL DEFAULT 0,
            dropout_risk NUMERIC(5,4) NOT NULL DEFAULT 0,
            learning_momentum NUMERIC(8,4) NOT NULL DEFAULT 0,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_user_behavior_metrics_user_id') THEN
                ALTER TABLE user_behavior_metrics
                ADD CONSTRAINT uq_user_behavior_metrics_user_id UNIQUE (user_id);
            END IF;
        END
        $$;
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_user_behavior_metrics_user_id ON user_behavior_metrics (user_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_user_behavior_metrics_updated_at ON user_behavior_metrics (updated_at);")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS axion_decision_logs (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            decision_type VARCHAR(80) NOT NULL,
            context TEXT NOT NULL,
            payload JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_axion_decision_logs_user_id ON axion_decision_logs (user_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_axion_decision_logs_created_at ON axion_decision_logs (created_at);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_axion_decision_logs_decision_type ON axion_decision_logs (decision_type);")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_axion_decision_logs_decision_type;")
    op.execute("DROP INDEX IF EXISTS ix_axion_decision_logs_created_at;")
    op.execute("DROP INDEX IF EXISTS ix_axion_decision_logs_user_id;")
    op.execute("DROP TABLE IF EXISTS axion_decision_logs;")

    op.execute("DROP INDEX IF EXISTS ix_user_behavior_metrics_updated_at;")
    op.execute("DROP INDEX IF EXISTS ix_user_behavior_metrics_user_id;")
    op.execute(
        """
        ALTER TABLE IF EXISTS user_behavior_metrics
        DROP CONSTRAINT IF EXISTS uq_user_behavior_metrics_user_id;
        """
    )
    op.execute("DROP TABLE IF EXISTS user_behavior_metrics;")

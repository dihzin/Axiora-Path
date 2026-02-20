"""axion core v2 deterministic engine

Revision ID: 0046_axion_core_v2
Revises: 0045_axion_message_templates
Create Date: 2026-02-20 08:00:00
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0046_axion_core_v2"
down_revision: str | None = "0045_axion_message_templates"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'axion_signal_type') THEN
                CREATE TYPE axion_signal_type AS ENUM (
                    'LESSON_COMPLETED',
                    'LESSON_FAILED',
                    'GAME_PLAYED',
                    'TASK_APPROVED',
                    'TASK_REJECTED',
                    'COIN_CONVERTED',
                    'INACTIVE_DAY'
                );
            END IF;
        END
        $$;
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'axion_decision_context') THEN
                CREATE TYPE axion_decision_context AS ENUM (
                    'child_tab',
                    'before_learning',
                    'after_learning',
                    'games_tab',
                    'wallet_tab'
                );
            END IF;
        END
        $$;
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS axion_user_state (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(id),
            rhythm_score NUMERIC(5,4) NOT NULL DEFAULT 0,
            frustration_score NUMERIC(5,4) NOT NULL DEFAULT 0,
            confidence_score NUMERIC(5,4) NOT NULL DEFAULT 0,
            dropout_risk_score NUMERIC(5,4) NOT NULL DEFAULT 0,
            learning_momentum NUMERIC(8,4) NOT NULL DEFAULT 0,
            last_active_at TIMESTAMPTZ NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_axion_user_state_user_id') THEN
                ALTER TABLE axion_user_state
                ADD CONSTRAINT uq_axion_user_state_user_id UNIQUE (user_id);
            END IF;
        END
        $$;
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_axion_user_state_user_id ON axion_user_state (user_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_axion_user_state_updated_at ON axion_user_state (updated_at);")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS axion_signals (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(id),
            type axion_signal_type NOT NULL,
            payload JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_axion_signals_user_id ON axion_signals (user_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_axion_signals_type_created_at ON axion_signals (type, created_at);")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS axion_decisions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(id),
            context axion_decision_context NOT NULL,
            decisions JSONB NOT NULL DEFAULT '[]'::jsonb,
            primary_message_key VARCHAR(100) NULL,
            debug JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_axion_decisions_user_context_created_at ON axion_decisions (user_id, context, created_at);"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_axion_decisions_user_context_created_at;")
    op.execute("DROP TABLE IF EXISTS axion_decisions;")

    op.execute("DROP INDEX IF EXISTS ix_axion_signals_type_created_at;")
    op.execute("DROP INDEX IF EXISTS ix_axion_signals_user_id;")
    op.execute("DROP TABLE IF EXISTS axion_signals;")

    op.execute("DROP INDEX IF EXISTS ix_axion_user_state_updated_at;")
    op.execute("DROP INDEX IF EXISTS ix_axion_user_state_user_id;")
    op.execute("ALTER TABLE IF EXISTS axion_user_state DROP CONSTRAINT IF EXISTS uq_axion_user_state_user_id;")
    op.execute("DROP TABLE IF EXISTS axion_user_state;")

    op.execute("DROP TYPE IF EXISTS axion_decision_context;")
    op.execute("DROP TYPE IF EXISTS axion_signal_type;")

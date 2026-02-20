"""axion early dropout warning status

Revision ID: 0053_axion_early_dropout_warning
Revises: 0052_axion_personas
Create Date: 2026-02-20 15:00:00
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0053_axion_early_dropout_warning"
down_revision: str | None = "0052_axion_personas"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'axion_risk_status') THEN
                CREATE TYPE axion_risk_status AS ENUM ('HEALTHY', 'AT_RISK');
            END IF;
        END $$;
        """
    )
    op.execute(
        """
        ALTER TABLE axion_user_state
        ADD COLUMN risk_status axion_risk_status NOT NULL DEFAULT 'HEALTHY';
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_axion_user_state_risk_status ON axion_user_state(risk_status);"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_axion_user_state_risk_status;")
    op.execute("ALTER TABLE axion_user_state DROP COLUMN IF EXISTS risk_status;")
    op.execute("DROP TYPE IF EXISTS axion_risk_status;")

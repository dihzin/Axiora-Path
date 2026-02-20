"""axion personas

Revision ID: 0052_axion_personas
Revises: 0051_axion_outcome_metrics
Create Date: 2026-02-20 13:10:00
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0052_axion_personas"
down_revision: str | None = "0051_axion_outcome_metrics"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS axion_personas (
            id SERIAL PRIMARY KEY,
            name VARCHAR(80) NOT NULL,
            tone_bias VARCHAR(32) NOT NULL,
            reward_bias NUMERIC(4,2) NOT NULL DEFAULT 1.00,
            challenge_bias NUMERIC(4,2) NOT NULL DEFAULT 1.00,
            message_style_key VARCHAR(80) NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_axion_personas_name UNIQUE (name)
        );
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_axion_personas_name ON axion_personas(name);")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS user_persona_state (
            user_id INTEGER PRIMARY KEY REFERENCES users(id),
            active_persona_id INTEGER NOT NULL REFERENCES axion_personas(id),
            auto_switch_enabled BOOLEAN NOT NULL DEFAULT TRUE,
            last_switch_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_user_persona_state_active_persona ON user_persona_state(active_persona_id);")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_user_persona_state_active_persona;")
    op.execute("DROP TABLE IF EXISTS user_persona_state;")
    op.execute("DROP INDEX IF EXISTS ix_axion_personas_name;")
    op.execute("DROP TABLE IF EXISTS axion_personas;")


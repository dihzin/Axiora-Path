"""user ux settings for micro interactions

Revision ID: 0042_user_ux_settings
Revises: 0041_path_events_treasure_adventure
Create Date: 2026-02-20 02:10:00
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0042_user_ux_settings"
down_revision: str | None = "0041_path_events_treasure_adventure"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS user_ux_settings (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            sound_enabled BOOLEAN NOT NULL DEFAULT TRUE,
            haptics_enabled BOOLEAN NOT NULL DEFAULT TRUE,
            reduced_motion BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_user_ux_settings_user_id') THEN
                ALTER TABLE user_ux_settings
                ADD CONSTRAINT uq_user_ux_settings_user_id UNIQUE (user_id);
            END IF;
        END
        $$;
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_user_ux_settings_user_id ON user_ux_settings (user_id);")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_user_ux_settings_user_id;")
    op.execute(
        """
        ALTER TABLE IF EXISTS user_ux_settings
        DROP CONSTRAINT IF EXISTS uq_user_ux_settings_user_id;
        """
    )
    op.execute("DROP TABLE IF EXISTS user_ux_settings;")

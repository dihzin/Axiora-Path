"""axion hybrid messaging schema

Revision ID: 0048_axion_hybrid_messaging
Revises: 0047_axion_policy_rules
Create Date: 2026-02-20 09:10:00
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0048_axion_hybrid_messaging"
down_revision: str | None = "0047_axion_policy_rules"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'axion_message_tone') THEN
                CREATE TYPE axion_message_tone AS ENUM ('CALM', 'ENCOURAGE', 'CHALLENGE', 'CELEBRATE', 'SUPPORT');
            END IF;
        END
        $$;
        """
    )

    op.execute("ALTER TABLE axion_message_templates ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[];")
    op.execute("ALTER TABLE axion_message_templates ADD COLUMN IF NOT EXISTS conditions jsonb NOT NULL DEFAULT '{}'::jsonb;")
    op.execute("ALTER TABLE axion_message_templates ADD COLUMN IF NOT EXISTS text text;")
    op.execute("ALTER TABLE axion_message_templates ADD COLUMN IF NOT EXISTS weight integer NOT NULL DEFAULT 1;")
    op.execute("ALTER TABLE axion_message_templates ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true;")
    op.execute("ALTER TABLE axion_message_templates ADD COLUMN IF NOT EXISTS tone_new axion_message_tone;")

    op.execute(
        """
        UPDATE axion_message_templates
        SET
            conditions = COALESCE(conditions, condition, '{}'::jsonb),
            text = COALESCE(text, template_text)
        """
    )
    op.execute(
        """
        UPDATE axion_message_templates
        SET tone_new = CASE UPPER(COALESCE(tone::text, 'ENCOURAGE'))
            WHEN 'CALM' THEN 'CALM'::axion_message_tone
            WHEN 'ENCOURAGE' THEN 'ENCOURAGE'::axion_message_tone
            WHEN 'CHALLENGE' THEN 'CHALLENGE'::axion_message_tone
            WHEN 'CELEBRATE' THEN 'CELEBRATE'::axion_message_tone
            WHEN 'SUPPORT' THEN 'SUPPORT'::axion_message_tone
            ELSE 'ENCOURAGE'::axion_message_tone
        END
        """
    )
    op.execute("ALTER TABLE axion_message_templates ALTER COLUMN text SET NOT NULL;")
    op.execute("ALTER TABLE axion_message_templates ALTER COLUMN tone_new SET NOT NULL;")
    op.execute("ALTER TABLE axion_message_templates DROP COLUMN IF EXISTS tone;")
    op.execute("ALTER TABLE axion_message_templates RENAME COLUMN tone_new TO tone;")

    op.execute("CREATE INDEX IF NOT EXISTS ix_axion_message_templates_tone ON axion_message_templates (tone);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_axion_message_templates_context ON axion_message_templates (context);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_axion_message_templates_enabled ON axion_message_templates (enabled);")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS axion_message_history (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            template_id INTEGER NOT NULL REFERENCES axion_message_templates(id),
            context VARCHAR(80) NOT NULL,
            used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_axion_message_history_user_used_at ON axion_message_history (user_id, used_at);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_axion_message_history_template_id ON axion_message_history (template_id);"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_axion_message_history_template_id;")
    op.execute("DROP INDEX IF EXISTS ix_axion_message_history_user_used_at;")
    op.execute("DROP TABLE IF EXISTS axion_message_history;")

    op.execute("DROP INDEX IF EXISTS ix_axion_message_templates_enabled;")
    op.execute("ALTER TABLE axion_message_templates ADD COLUMN IF NOT EXISTS tone_old varchar(40);")
    op.execute("UPDATE axion_message_templates SET tone_old = tone::text;")
    op.execute("ALTER TABLE axion_message_templates DROP COLUMN IF EXISTS tone;")
    op.execute("ALTER TABLE axion_message_templates RENAME COLUMN tone_old TO tone;")
    op.execute("ALTER TABLE axion_message_templates DROP COLUMN IF EXISTS enabled;")
    op.execute("ALTER TABLE axion_message_templates DROP COLUMN IF EXISTS weight;")
    op.execute("ALTER TABLE axion_message_templates DROP COLUMN IF EXISTS text;")
    op.execute("ALTER TABLE axion_message_templates DROP COLUMN IF EXISTS conditions;")
    op.execute("ALTER TABLE axion_message_templates DROP COLUMN IF EXISTS tags;")

    op.execute("DROP TYPE IF EXISTS axion_message_tone;")

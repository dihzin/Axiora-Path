"""anonymous tools identity system

Revision ID: 0112_anonymous_tools_identity
Revises: 0111_user_credits
Create Date: 2026-03-22 00:00:00

Substitui o rastreamento anônimo baseado em Redis por identidades persistentes
no PostgreSQL. Cada visitante recebe um anonymous_id (UUID gerado no cliente)
que persiste entre sessões e permite rastrear uso gratuito + créditos pagos.
"""

from collections.abc import Sequence

from alembic import op


revision: str = "0112_anonymous_tools_identity"
down_revision: str | None = "0111_user_credits"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Identidade anônima — 1 registro por visitante (UUID gerado no frontend)
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS anonymous_identities (
            id          TEXT PRIMARY KEY,
            fingerprint TEXT,
            ip          VARCHAR(45),
            ab_variants JSONB NOT NULL DEFAULT '{}',
            first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_anon_identities_ip ON anonymous_identities (ip);")

    # Contadores de uso por ferramenta — 1 linha por (anon_id, tool_slug)
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS anonymous_usage (
            id           SERIAL PRIMARY KEY,
            anon_id      TEXT NOT NULL REFERENCES anonymous_identities(id) ON DELETE CASCADE,
            tool_slug    VARCHAR(80) NOT NULL,
            free_used    INTEGER NOT NULL DEFAULT 0,
            paid_credits INTEGER NOT NULL DEFAULT 0,
            updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE (anon_id, tool_slug)
        );
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_anon_usage_anon_id ON anonymous_usage (anon_id);")

    # Auditoria de cada geração (event_type: 'free' | 'paid' | 'blocked')
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS generation_events (
            id         SERIAL PRIMARY KEY,
            anon_id    TEXT NOT NULL REFERENCES anonymous_identities(id) ON DELETE CASCADE,
            tool_slug  VARCHAR(80) NOT NULL,
            event_type VARCHAR(20) NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_gen_events_anon_id ON generation_events (anon_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_gen_events_created_at ON generation_events (created_at);")

    # Sessões Stripe (id = Stripe checkout session id; status: pending|completed|expired)
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS tools_checkout_sessions (
            id         TEXT PRIMARY KEY,
            anon_id    TEXT REFERENCES anonymous_identities(id) ON DELETE SET NULL,
            user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
            plan_code  VARCHAR(60) NOT NULL,
            status     VARCHAR(20) NOT NULL DEFAULT 'pending',
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_tcs_anon_id ON tools_checkout_sessions (anon_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_tcs_user_id ON tools_checkout_sessions (user_id);")

    # Ledger imutável (amount: positivo=crédito, negativo=débito; reason: stripe_purchase|generation|refund)
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS credit_ledger (
            id         SERIAL PRIMARY KEY,
            anon_id    TEXT REFERENCES anonymous_identities(id) ON DELETE SET NULL,
            user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
            amount     INTEGER NOT NULL,
            reason     VARCHAR(60) NOT NULL,
            ref_id     TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_credit_ledger_anon_id ON credit_ledger (anon_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_credit_ledger_user_id ON credit_ledger (user_id);")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_credit_ledger_user_id;")
    op.execute("DROP INDEX IF EXISTS ix_credit_ledger_anon_id;")
    op.execute("DROP TABLE IF EXISTS credit_ledger;")

    op.execute("DROP INDEX IF EXISTS ix_tcs_user_id;")
    op.execute("DROP INDEX IF EXISTS ix_tcs_anon_id;")
    op.execute("DROP TABLE IF EXISTS tools_checkout_sessions;")

    op.execute("DROP INDEX IF EXISTS ix_gen_events_created_at;")
    op.execute("DROP INDEX IF EXISTS ix_gen_events_anon_id;")
    op.execute("DROP TABLE IF EXISTS generation_events;")

    op.execute("DROP INDEX IF EXISTS ix_anon_usage_anon_id;")
    op.execute("DROP TABLE IF EXISTS anonymous_usage;")

    op.execute("DROP INDEX IF EXISTS ix_anon_identities_ip;")
    op.execute("DROP TABLE IF EXISTS anonymous_identities;")

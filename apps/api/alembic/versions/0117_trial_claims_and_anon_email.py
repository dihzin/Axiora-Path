"""trial claims and anonymous identity email

Revision ID: 0117_trial_claims_and_anon_email
Revises: 0116_fingerprint_index
Create Date: 2026-04-24 00:00:00
"""

from collections.abc import Sequence

from alembic import op


revision: str = "0117_trial_claims_and_anon_email"
down_revision: str | None = "0116_fingerprint_index"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE anonymous_identities
        ADD COLUMN IF NOT EXISTS email VARCHAR(255);
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_anon_identities_email ON anonymous_identities (email);")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS trial_claims (
            id          SERIAL PRIMARY KEY,
            scope_type  VARCHAR(30) NOT NULL,
            scope_value TEXT NOT NULL,
            source_kind VARCHAR(20) NOT NULL,
            source_ref  VARCHAR(255) NOT NULL,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_trial_claim_scope UNIQUE (scope_type, scope_value)
        );
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_trial_claims_scope_type ON trial_claims (scope_type);")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_trial_claims_scope_type;")
    op.execute("DROP TABLE IF EXISTS trial_claims;")

    op.execute("DROP INDEX IF EXISTS ix_anon_identities_email;")
    op.execute(
        """
        ALTER TABLE anonymous_identities
        DROP COLUMN IF EXISTS email;
        """
    )

"""add index on anonymous_identities.fingerprint

Revision ID: 0116_fingerprint_index
Revises: 0115_checkout_payment_details
Create Date: 2026-03-23 00:00:00

O índice em `fingerprint` é necessário para a query de cross-check que detecta
reutilização de dispositivo após limpeza de localStorage:

    SELECT SUM(au.free_used)
    FROM anonymous_usage au
    JOIN anonymous_identities ai ON ai.id = au.anon_id
    WHERE ai.fingerprint = ?

Sem o índice, a query faria seq scan em toda a tabela a cada geração.
CONCURRENTLY garante que o índice seja criado sem bloquear a tabela em produção.
"""
from __future__ import annotations

from alembic import op

revision = "0116_fingerprint_index"
down_revision = "0115_checkout_payment_details"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_anon_identities_fingerprint "
        "ON anonymous_identities (fingerprint)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_anon_identities_fingerprint")

"""add payment detail columns to tools_checkout_sessions

Revision ID: 0115_checkout_payment_details
Revises: 0114_generation_tracking
Create Date: 2026-03-23 00:00:00

Adiciona campos para rastreio completo do pagamento confirmado:
  - paid_at             — timestamp de confirmação do pagamento
  - amount_paid_cents   — valor pago em centavos (ex: 2900 = R$ 29,00)
  - currency            — código ISO 4217 (ex: BRL)
  - payment_intent_id   — ID do PaymentIntent Stripe para reconciliação
"""

from collections.abc import Sequence

from alembic import op


revision: str = "0115_checkout_payment_details"
down_revision: str | None = "0114_generation_tracking"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TABLE tools_checkout_sessions ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;")
    op.execute("ALTER TABLE tools_checkout_sessions ADD COLUMN IF NOT EXISTS amount_paid_cents INTEGER;")
    op.execute("ALTER TABLE tools_checkout_sessions ADD COLUMN IF NOT EXISTS currency VARCHAR(3);")
    op.execute("ALTER TABLE tools_checkout_sessions ADD COLUMN IF NOT EXISTS payment_intent_id TEXT;")


def downgrade() -> None:
    op.execute("ALTER TABLE tools_checkout_sessions DROP COLUMN IF EXISTS paid_at;")
    op.execute("ALTER TABLE tools_checkout_sessions DROP COLUMN IF EXISTS amount_paid_cents;")
    op.execute("ALTER TABLE tools_checkout_sessions DROP COLUMN IF EXISTS currency;")
    op.execute("ALTER TABLE tools_checkout_sessions DROP COLUMN IF EXISTS payment_intent_id;")

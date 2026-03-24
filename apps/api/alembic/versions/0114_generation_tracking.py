"""add generation tracking fields

Revision ID: 0114_generation_tracking
Revises: 0113_anon_identity_user_agent
Create Date: 2026-03-23 00:00:00

Adiciona campos para rastreio completo de geração:
  - anonymous_usage.last_generation_at  — quando gerou pela última vez
  - anonymous_usage.total_generations_used — contador cumulativo (free + paid)
  - generation_events.request_hash — identificador da requisição para dedup/rastreio
"""

from collections.abc import Sequence

from alembic import op


revision: str = "0114_generation_tracking"
down_revision: str | None = "0113_anon_identity_user_agent"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TABLE anonymous_usage ADD COLUMN IF NOT EXISTS last_generation_at TIMESTAMPTZ;")
    op.execute("ALTER TABLE anonymous_usage ADD COLUMN IF NOT EXISTS total_generations_used INTEGER NOT NULL DEFAULT 0;")
    op.execute("ALTER TABLE generation_events ADD COLUMN IF NOT EXISTS request_hash TEXT;")


def downgrade() -> None:
    op.execute("ALTER TABLE anonymous_usage DROP COLUMN IF EXISTS last_generation_at;")
    op.execute("ALTER TABLE anonymous_usage DROP COLUMN IF EXISTS total_generations_used;")
    op.execute("ALTER TABLE generation_events DROP COLUMN IF EXISTS request_hash;")

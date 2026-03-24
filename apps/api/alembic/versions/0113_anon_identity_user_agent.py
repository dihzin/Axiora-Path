"""add user_agent to anonymous_identities

Revision ID: 0113_anon_identity_user_agent
Revises: 0112_anonymous_tools_identity
Create Date: 2026-03-23 00:00:00
"""

from collections.abc import Sequence

from alembic import op


revision: str = "0113_anon_identity_user_agent"
down_revision: str | None = "0112_anonymous_tools_identity"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TABLE anonymous_identities ADD COLUMN IF NOT EXISTS user_agent TEXT;")


def downgrade() -> None:
    op.execute("ALTER TABLE anonymous_identities DROP COLUMN IF EXISTS user_agent;")

"""create user credits table

Revision ID: 0111_user_credits
Revises: 0110_tools_templates
Create Date: 2026-03-21 00:20:00
"""

from collections.abc import Sequence

from alembic import op


revision: str = "0111_user_credits"
down_revision: str | None = "0110_tools_templates"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS user_credits (
            user_id INTEGER PRIMARY KEY REFERENCES users(id),
            credits INTEGER NOT NULL DEFAULT 0
        );
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_user_credits_user_id ON user_credits (user_id);")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_user_credits_user_id;")
    op.execute("DROP TABLE IF EXISTS user_credits;")

"""child avatar key text

Revision ID: 0056_child_avatar_upload
Revises: 0055_llm_cache
Create Date: 2026-02-20 18:10:00
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0056_child_avatar_upload"
down_revision: str | None = "0055_llm_cache"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TABLE child_profiles ALTER COLUMN avatar_key TYPE TEXT;")


def downgrade() -> None:
    op.execute("ALTER TABLE child_profiles ALTER COLUMN avatar_key TYPE VARCHAR(255);")

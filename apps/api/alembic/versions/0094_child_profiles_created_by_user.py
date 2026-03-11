"""add created_by_user_id to child profiles

Revision ID: 0094_child_profiles_created_by_user
Revises: 0093_child_date_of_birth_required
Create Date: 2026-03-11 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0094_child_profiles_created_by_user"
down_revision: str | None = "0093_child_date_of_birth_required"
branch_labels: tuple[str, ...] | None = None
depends_on: tuple[str, ...] | None = None


def upgrade() -> None:
    op.add_column("child_profiles", sa.Column("created_by_user_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_child_profiles_created_by_user_id_users",
        "child_profiles",
        "users",
        ["created_by_user_id"],
        ["id"],
    )
    op.create_index(
        "ix_child_profiles_created_by_user_id",
        "child_profiles",
        ["created_by_user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_child_profiles_created_by_user_id", table_name="child_profiles")
    op.drop_constraint("fk_child_profiles_created_by_user_id_users", "child_profiles", type_="foreignkey")
    op.drop_column("child_profiles", "created_by_user_id")

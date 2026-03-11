"""add child profile user linkage and indexes

Revision ID: 0097_child_profiles_user_id_created_at_indexes
Revises: 0096_tenant_type_system_admin
Create Date: 2026-03-11 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0097_child_profiles_user_id_created_at_indexes"
down_revision: str | None = "0096_tenant_type_system_admin"
branch_labels: tuple[str, ...] | None = None
depends_on: tuple[str, ...] | None = None


def upgrade() -> None:
    op.add_column("child_profiles", sa.Column("user_id", sa.Integer(), nullable=True))
    op.add_column(
        "child_profiles",
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_foreign_key(
        "fk_child_profiles_user_id_users",
        "child_profiles",
        "users",
        ["user_id"],
        ["id"],
    )
    op.create_index("ix_child_profiles_tenant_id", "child_profiles", ["tenant_id"], unique=False)
    op.create_index("ix_child_profiles_user_id", "child_profiles", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_child_profiles_user_id", table_name="child_profiles")
    op.drop_index("ix_child_profiles_tenant_id", table_name="child_profiles")
    op.drop_constraint("fk_child_profiles_user_id_users", "child_profiles", type_="foreignkey")
    op.drop_column("child_profiles", "created_at")
    op.drop_column("child_profiles", "user_id")

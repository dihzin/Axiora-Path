"""create child_guardians table

Revision ID: 0098_child_guardians_table
Revises: 0097_child_profiles_user_id_created_at_indexes
Create Date: 2026-03-11 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0098_child_guardians_table"
down_revision: str | None = "0097_child_profiles_user_id_created_at_indexes"
branch_labels: tuple[str, ...] | None = None
depends_on: tuple[str, ...] | None = None


def upgrade() -> None:
    op.create_table(
        "child_guardians",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("child_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("relationship", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["child_id"], ["child_profiles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("child_id", "user_id", name="uq_child_guardians_child_user"),
    )
    op.create_index("ix_child_guardians_child_id", "child_guardians", ["child_id"], unique=False)
    op.create_index("ix_child_guardians_user_id", "child_guardians", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_child_guardians_user_id", table_name="child_guardians")
    op.drop_index("ix_child_guardians_child_id", table_name="child_guardians")
    op.drop_table("child_guardians")

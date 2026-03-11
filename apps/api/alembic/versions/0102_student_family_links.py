"""create student family links table

Revision ID: 0102_student_family_links
Revises: 0101_student_profiles_and_teacher_students
Create Date: 2026-03-11 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0102_student_family_links"
down_revision: str | None = "0101_student_profiles_and_teacher_students"
branch_labels: tuple[str, ...] | None = None
depends_on: tuple[str, ...] | None = None


def upgrade() -> None:
    op.create_table(
        "student_family_links",
        sa.Column("student_profile_id", sa.Integer(), nullable=False),
        sa.Column("child_profile_id", sa.Integer(), nullable=False),
        sa.Column("linked_by_user_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["student_profile_id"], ["student_profiles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["child_profile_id"], ["child_profiles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["linked_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("student_profile_id", "child_profile_id"),
        sa.UniqueConstraint(
            "student_profile_id",
            "child_profile_id",
            name="uq_student_family_links_student_profile_child_profile",
        ),
    )
    op.create_index(
        "ix_student_family_links_student_profile_id",
        "student_family_links",
        ["student_profile_id"],
        unique=False,
    )
    op.create_index(
        "ix_student_family_links_child_profile_id",
        "student_family_links",
        ["child_profile_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_student_family_links_child_profile_id", table_name="student_family_links")
    op.drop_index("ix_student_family_links_student_profile_id", table_name="student_family_links")
    op.drop_table("student_family_links")

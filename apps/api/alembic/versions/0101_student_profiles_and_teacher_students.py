"""create student profiles and teacher students tables

Revision ID: 0101_student_profiles_and_teacher_students
Revises: 0100_family_guardian_invitations
Create Date: 2026-03-11 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0101_student_profiles_and_teacher_students"
down_revision: str | None = "0100_family_guardian_invitations"
branch_labels: tuple[str, ...] | None = None
depends_on: tuple[str, ...] | None = None


def upgrade() -> None:
    op.create_table(
        "student_profiles",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("display_name", sa.String(length=255), nullable=False),
        sa.Column("date_of_birth", sa.Date(), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=False),
        sa.Column("child_profile_id", sa.Integer(), nullable=True),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["child_profile_id"], ["child_profiles.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_student_profiles_tenant_id", "student_profiles", ["tenant_id"], unique=False)
    op.create_index("ix_student_profiles_child_profile_id", "student_profiles", ["child_profile_id"], unique=False)
    op.create_index("ix_student_profiles_user_id", "student_profiles", ["user_id"], unique=False)

    op.create_table(
        "teacher_students",
        sa.Column("teacher_user_id", sa.Integer(), nullable=False),
        sa.Column("student_profile_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["teacher_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["student_profile_id"], ["student_profiles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("teacher_user_id", "student_profile_id"),
        sa.UniqueConstraint(
            "teacher_user_id",
            "student_profile_id",
            name="uq_teacher_students_teacher_user_student_profile",
        ),
    )
    op.create_index("ix_teacher_students_teacher_user_id", "teacher_students", ["teacher_user_id"], unique=False)
    op.create_index("ix_teacher_students_student_profile_id", "teacher_students", ["student_profile_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_teacher_students_student_profile_id", table_name="teacher_students")
    op.drop_index("ix_teacher_students_teacher_user_id", table_name="teacher_students")
    op.drop_table("teacher_students")

    op.drop_index("ix_student_profiles_user_id", table_name="student_profiles")
    op.drop_index("ix_student_profiles_child_profile_id", table_name="student_profiles")
    op.drop_index("ix_student_profiles_tenant_id", table_name="student_profiles")
    op.drop_table("student_profiles")

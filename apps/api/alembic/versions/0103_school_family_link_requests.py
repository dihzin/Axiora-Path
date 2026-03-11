"""create school family link requests table

Revision ID: 0103_school_family_link_requests
Revises: 0102_student_family_links
Create Date: 2026-03-11 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0103_school_family_link_requests"
down_revision: str | None = "0102_student_family_links"
branch_labels: tuple[str, ...] | None = None
depends_on: tuple[str, ...] | None = None


def upgrade() -> None:
    op.create_table(
        "school_family_link_requests",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("student_profile_id", sa.Integer(), nullable=False),
        sa.Column("child_profile_id", sa.Integer(), nullable=False),
        sa.Column("requested_by_user_id", sa.Integer(), nullable=False),
        sa.Column("accepted_by_user_id", sa.Integer(), nullable=True),
        sa.Column("token", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="pending"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["student_profile_id"], ["student_profiles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["child_profile_id"], ["child_profiles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["requested_by_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["accepted_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token", name="uq_school_family_link_requests_token"),
    )
    op.create_index(
        "ix_school_family_link_requests_student_profile_id",
        "school_family_link_requests",
        ["student_profile_id"],
        unique=False,
    )
    op.create_index(
        "ix_school_family_link_requests_child_profile_id",
        "school_family_link_requests",
        ["child_profile_id"],
        unique=False,
    )
    op.create_index(
        "ix_school_family_link_requests_status_expires_at",
        "school_family_link_requests",
        ["status", "expires_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_school_family_link_requests_status_expires_at", table_name="school_family_link_requests")
    op.drop_index("ix_school_family_link_requests_child_profile_id", table_name="school_family_link_requests")
    op.drop_index("ix_school_family_link_requests_student_profile_id", table_name="school_family_link_requests")
    op.drop_table("school_family_link_requests")

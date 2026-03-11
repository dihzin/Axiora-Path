"""create family guardian invitations table

Revision ID: 0100_family_guardian_invitations
Revises: 0099_membership_guardian_role
Create Date: 2026-03-11 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0100_family_guardian_invitations"
down_revision: str | None = "0099_membership_guardian_role"
branch_labels: tuple[str, ...] | None = None
depends_on: tuple[str, ...] | None = None


def upgrade() -> None:
    op.create_table(
        "family_guardian_invitations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("relationship", sa.String(length=32), nullable=False),
        sa.Column("token", sa.String(length=255), nullable=False),
        sa.Column("invited_by_user_id", sa.Integer(), nullable=False),
        sa.Column("accepted_by_user_id", sa.Integer(), nullable=True),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.ForeignKeyConstraint(["invited_by_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["accepted_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token", name="uq_family_guardian_invitations_token"),
    )
    op.create_index(
        "ix_family_guardian_invitations_tenant_id_created_at",
        "family_guardian_invitations",
        ["tenant_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_family_guardian_invitations_email",
        "family_guardian_invitations",
        ["email"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_family_guardian_invitations_email", table_name="family_guardian_invitations")
    op.drop_index("ix_family_guardian_invitations_tenant_id_created_at", table_name="family_guardian_invitations")
    op.drop_table("family_guardian_invitations")

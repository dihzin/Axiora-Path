"""create content_prerequisites table

Revision ID: 0088_content_prerequisites
Revises: 0087_axion_content_fingerprint_history
Create Date: 2026-02-26 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision: str = "0088_content_prerequisites"
down_revision: str | None = "0087_axion_content_fingerprint_history"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "content_prerequisites",
        sa.Column(
            "content_id",
            sa.Integer(),
            sa.ForeignKey("axion_content_catalog.content_id", ondelete="CASCADE"),
            nullable=False,
            primary_key=True,
        ),
        sa.Column(
            "prerequisite_content_id",
            sa.Integer(),
            sa.ForeignKey("axion_content_catalog.content_id", ondelete="CASCADE"),
            nullable=False,
            primary_key=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("content_id", "prerequisite_content_id", name="uq_content_prerequisites_pair"),
    )
    op.create_index("ix_content_prerequisites_content_id", "content_prerequisites", ["content_id"], unique=False)
    op.create_index(
        "ix_content_prerequisites_prerequisite_content_id",
        "content_prerequisites",
        ["prerequisite_content_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_content_prerequisites_prerequisite_content_id", table_name="content_prerequisites")
    op.drop_index("ix_content_prerequisites_content_id", table_name="content_prerequisites")
    op.drop_table("content_prerequisites")


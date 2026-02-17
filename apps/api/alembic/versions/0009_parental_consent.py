"""create parental_consent table

Revision ID: 0009_parental_consent
Revises: 0008_audit_log
Create Date: 2026-02-17 04:45:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0009_parental_consent"
down_revision: str | None = "0008_audit_log"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "parental_consent",
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("accepted_terms_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("accepted_privacy_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("data_retention_policy_version", sa.String(length=32), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.PrimaryKeyConstraint("tenant_id"),
    )


def downgrade() -> None:
    op.drop_table("parental_consent")

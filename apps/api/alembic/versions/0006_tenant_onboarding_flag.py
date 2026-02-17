"""add onboarding fields to tenants

Revision ID: 0006_tenant_onboarding_flag
Revises: 0005_daily_mood
Create Date: 2026-02-17 02:30:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0006_tenant_onboarding_flag"
down_revision: str | None = "0005_daily_mood"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "tenants",
        sa.Column("onboarding_completed", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )
    op.add_column(
        "tenants",
        sa.Column("monthly_allowance_cents", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("tenants", "monthly_allowance_cents")
    op.drop_column("tenants", "onboarding_completed")


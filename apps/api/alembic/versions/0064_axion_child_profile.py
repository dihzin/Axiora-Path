"""add axion child longitudinal profile

Revision ID: 0064_axion_child_profile
Revises: 0063_plans_and_llm_tiers
Create Date: 2026-02-26
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0064_axion_child_profile"
down_revision: str | None = "0063_plans_and_llm_tiers"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS axion_child_profile (
            child_id INTEGER PRIMARY KEY REFERENCES child_profiles(id),
            mastery_score NUMERIC(5,4) NOT NULL DEFAULT 0,
            frustration_index NUMERIC(5,4) NOT NULL DEFAULT 0,
            engagement_score NUMERIC(5,4) NOT NULL DEFAULT 0,
            streak_stability NUMERIC(5,4) NOT NULL DEFAULT 0,
            risk_of_churn NUMERIC(5,4) NOT NULL DEFAULT 0,
            confidence_score NUMERIC(5,4) NOT NULL DEFAULT 0,
            last_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            version INTEGER NOT NULL DEFAULT 1
        );
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_axion_child_profile_last_updated_at ON axion_child_profile(last_updated_at);")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_axion_child_profile_last_updated_at;")
    op.execute("DROP TABLE IF EXISTS axion_child_profile;")

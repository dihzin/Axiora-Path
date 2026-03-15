"""games league engine tables

Revision ID: 0108_games_league_engine
Revises: 0107_games_ranking_weekly_index
Create Date: 2026-03-14 00:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "0108_games_league_engine"
down_revision: str | None = "0107_games_ranking_weekly_index"
branch_labels: tuple[str, ...] | None = None
depends_on: tuple[str, ...] | None = None


def upgrade() -> None:
    op.create_table(
        "game_league_profiles",
        sa.Column("id", postgresql.UUID(as_uuid=False), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("child_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("current_tier", sa.String(length=24), nullable=False, server_default="BRONZE"),
        sa.Column("last_cycle_applied_week_start", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.ForeignKeyConstraint(["child_id"], ["child_profiles.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "child_id", name="uq_game_league_profiles_tenant_child"),
    )
    op.create_index("ix_game_league_profiles_tenant_tier", "game_league_profiles", ["tenant_id", "current_tier"], unique=False)
    op.create_index(
        "ix_game_league_profiles_tenant_last_cycle",
        "game_league_profiles",
        ["tenant_id", "last_cycle_applied_week_start"],
        unique=False,
    )

    op.create_table(
        "game_league_reward_claims",
        sa.Column("id", postgresql.UUID(as_uuid=False), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("child_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("cycle_week_start", sa.Date(), nullable=False),
        sa.Column("cycle_week_end", sa.Date(), nullable=False),
        sa.Column("tier_from", sa.String(length=24), nullable=False),
        sa.Column("tier_to", sa.String(length=24), nullable=False),
        sa.Column("result_status", sa.String(length=24), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("group_size", sa.Integer(), nullable=False),
        sa.Column("reward_xp", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reward_coins", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.ForeignKeyConstraint(["child_id"], ["child_profiles.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("child_id", "cycle_week_start", name="uq_game_league_reward_claims_child_cycle"),
    )
    op.create_index(
        "ix_game_league_reward_claims_child_claimed_at",
        "game_league_reward_claims",
        ["child_id", "claimed_at"],
        unique=False,
    )
    op.create_index(
        "ix_game_league_reward_claims_tenant_cycle",
        "game_league_reward_claims",
        ["tenant_id", "cycle_week_start"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_game_league_reward_claims_tenant_cycle", table_name="game_league_reward_claims")
    op.drop_index("ix_game_league_reward_claims_child_claimed_at", table_name="game_league_reward_claims")
    op.drop_table("game_league_reward_claims")
    op.drop_index("ix_game_league_profiles_tenant_last_cycle", table_name="game_league_profiles")
    op.drop_index("ix_game_league_profiles_tenant_tier", table_name="game_league_profiles")
    op.drop_table("game_league_profiles")


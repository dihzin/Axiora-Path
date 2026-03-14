"""games metagame mission claims

Revision ID: 0106_games_metagame_mission_claims
Revises: 0105_games_result_contract_and_personal_best
Create Date: 2026-03-14 00:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "0106_games_metagame_mission_claims"
down_revision: str | None = "0105_games_result_contract_and_personal_best"
branch_labels: tuple[str, ...] | None = None
depends_on: tuple[str, ...] | None = None


def upgrade() -> None:
    op.create_table(
        "game_metagame_mission_claims",
        sa.Column("id", postgresql.UUID(as_uuid=False), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("child_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("mission_scope", sa.String(length=16), nullable=False),
        sa.Column("mission_id", sa.String(length=64), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column("reward_xp", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reward_coins", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.ForeignKeyConstraint(["child_id"], ["child_profiles.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("child_id", "mission_scope", "mission_id", "period_start", name="uq_game_metagame_claims_child_scope_period"),
    )
    op.create_index(
        "ix_game_metagame_claims_child_id_claimed_at",
        "game_metagame_mission_claims",
        ["child_id", "claimed_at"],
        unique=False,
    )
    op.create_index(
        "ix_game_metagame_claims_user_id_claimed_at",
        "game_metagame_mission_claims",
        ["user_id", "claimed_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_game_metagame_claims_user_id_claimed_at", table_name="game_metagame_mission_claims")
    op.drop_index("ix_game_metagame_claims_child_id_claimed_at", table_name="game_metagame_mission_claims")
    op.drop_table("game_metagame_mission_claims")


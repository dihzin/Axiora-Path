"""games result contract and personal best foundation

Revision ID: 0105_games_result_contract_and_personal_best
Revises: 0104_axion_studio_finance_module
Create Date: 2026-03-14 00:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "0105_games_result_contract_and_personal_best"
down_revision: str | None = "0104_axion_studio_finance_module"
branch_labels: tuple[str, ...] | None = None
depends_on: tuple[str, ...] | None = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_enum e
            JOIN pg_type t ON t.oid = e.enumtypid
            WHERE t.typname = 'game_type' AND e.enumlabel = 'MEMORY'
          ) THEN
            ALTER TYPE game_type ADD VALUE 'MEMORY';
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM pg_enum e
            JOIN pg_type t ON t.oid = e.enumtypid
            WHERE t.typname = 'game_type' AND e.enumlabel = 'TUG_OF_WAR'
          ) THEN
            ALTER TYPE game_type ADD VALUE 'TUG_OF_WAR';
          END IF;
        END $$;
        """
    )

    op.add_column("game_sessions", sa.Column("child_id", sa.Integer(), nullable=True))
    op.add_column("game_sessions", sa.Column("game_id", sa.String(length=64), nullable=True))
    op.add_column("game_sessions", sa.Column("session_external_id", sa.String(length=96), nullable=True))
    op.add_column("game_sessions", sa.Column("accuracy", sa.Numeric(5, 4), nullable=True))
    op.add_column("game_sessions", sa.Column("correct_answers", sa.Integer(), nullable=True))
    op.add_column("game_sessions", sa.Column("wrong_answers", sa.Integer(), nullable=True))
    op.add_column("game_sessions", sa.Column("streak", sa.Integer(), nullable=True))
    op.add_column("game_sessions", sa.Column("max_streak", sa.Integer(), nullable=True))
    op.add_column("game_sessions", sa.Column("duration_seconds", sa.Integer(), nullable=True))
    op.add_column("game_sessions", sa.Column("level_reached", sa.Integer(), nullable=True))
    op.add_column(
        "game_sessions",
        sa.Column("completed", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )

    op.create_foreign_key(
        "fk_game_sessions_child_id_child_profiles",
        "game_sessions",
        "child_profiles",
        ["child_id"],
        ["id"],
    )
    op.create_index("ix_game_sessions_child_id_created_at", "game_sessions", ["child_id", "created_at"], unique=False)
    op.create_index(
        "ix_game_sessions_child_game_id_created_at",
        "game_sessions",
        ["child_id", "game_id", "created_at"],
        unique=False,
    )

    op.create_table(
        "game_personal_bests",
        sa.Column("id", postgresql.UUID(as_uuid=False), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("child_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("game_id", sa.String(length=64), nullable=False),
        sa.Column("best_score", sa.Integer(), nullable=True),
        sa.Column("best_streak", sa.Integer(), nullable=True),
        sa.Column("best_duration_seconds", sa.Integer(), nullable=True),
        sa.Column("best_result_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("last_surpassed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.ForeignKeyConstraint(["child_id"], ["child_profiles.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("child_id", "game_id", name="uq_game_personal_bests_child_game"),
    )
    op.create_index("ix_game_personal_bests_child_id", "game_personal_bests", ["child_id"], unique=False)
    op.create_index("ix_game_personal_bests_user_id", "game_personal_bests", ["user_id"], unique=False)

    op.execute(
        """
        UPDATE game_sessions
        SET game_id = COALESCE(game_id, LOWER(CAST(game_type AS text)))
        WHERE game_id IS NULL;
        """
    )


def downgrade() -> None:
    op.drop_index("ix_game_personal_bests_user_id", table_name="game_personal_bests")
    op.drop_index("ix_game_personal_bests_child_id", table_name="game_personal_bests")
    op.drop_table("game_personal_bests")

    op.drop_index("ix_game_sessions_child_game_id_created_at", table_name="game_sessions")
    op.drop_index("ix_game_sessions_child_id_created_at", table_name="game_sessions")
    op.drop_constraint("fk_game_sessions_child_id_child_profiles", "game_sessions", type_="foreignkey")

    op.drop_column("game_sessions", "completed")
    op.drop_column("game_sessions", "level_reached")
    op.drop_column("game_sessions", "duration_seconds")
    op.drop_column("game_sessions", "max_streak")
    op.drop_column("game_sessions", "streak")
    op.drop_column("game_sessions", "wrong_answers")
    op.drop_column("game_sessions", "correct_answers")
    op.drop_column("game_sessions", "accuracy")
    op.drop_column("game_sessions", "session_external_id")
    op.drop_column("game_sessions", "game_id")
    op.drop_column("game_sessions", "child_id")

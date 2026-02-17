"""create achievements tables

Revision ID: 0014_achievements
Revises: 0013_child_theme
Create Date: 2026-02-17 08:05:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0014_achievements"
down_revision: str | None = "0013_child_theme"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "achievements",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("slug", sa.String(length=100), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("icon_key", sa.String(length=100), nullable=False),
        sa.Column("condition_type", sa.String(length=100), nullable=False),
        sa.Column("condition_value", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug"),
    )

    op.create_table(
        "child_achievements",
        sa.Column("child_id", sa.Integer(), nullable=False),
        sa.Column("achievement_id", sa.Integer(), nullable=False),
        sa.Column("unlocked_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["achievement_id"], ["achievements.id"]),
        sa.ForeignKeyConstraint(["child_id"], ["child_profiles.id"]),
        sa.PrimaryKeyConstraint("child_id", "achievement_id"),
    )

    achievements_table = sa.table(
        "achievements",
        sa.column("slug", sa.String),
        sa.column("title", sa.String),
        sa.column("description", sa.Text),
        sa.column("icon_key", sa.String),
        sa.column("condition_type", sa.String),
        sa.column("condition_value", sa.Integer),
    )
    op.bulk_insert(
        achievements_table,
        [
            {
                "slug": "streak_7_days",
                "title": "Fogo em Sequencia",
                "description": "Atingiu 7 dias de streak.",
                "icon_key": "flame_7",
                "condition_type": "STREAK_DAYS",
                "condition_value": 7,
            },
            {
                "slug": "approvals_10",
                "title": "Mestre das Aprovações",
                "description": "Conquistou 10 tarefas aprovadas.",
                "icon_key": "approved_10",
                "condition_type": "APPROVALS_COUNT",
                "condition_value": 10,
            },
            {
                "slug": "first_goal_reached",
                "title": "Primeira Meta Batida",
                "description": "Concluiu a primeira meta de economia.",
                "icon_key": "goal_1",
                "condition_type": "FIRST_GOAL_REACHED",
                "condition_value": 1,
            },
        ],
    )


def downgrade() -> None:
    op.drop_table("child_achievements")
    op.drop_table("achievements")

"""expand game_type enum for generic multiplayer engines

Revision ID: 0058_multiplayer_engine_gt
Revises: 0057_mp_tictactoe_qr
Create Date: 2026-02-21
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "0058_multiplayer_engine_gt"
down_revision = "0057_mp_tictactoe_qr"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_enum e
            JOIN pg_type t ON t.oid = e.enumtypid
            WHERE t.typname = 'game_type' AND e.enumlabel = 'QUIZ_BATTLE'
          ) THEN
            ALTER TYPE game_type ADD VALUE 'QUIZ_BATTLE';
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM pg_enum e
            JOIN pg_type t ON t.oid = e.enumtypid
            WHERE t.typname = 'game_type' AND e.enumlabel = 'MATH_CHALLENGE'
          ) THEN
            ALTER TYPE game_type ADD VALUE 'MATH_CHALLENGE';
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM pg_enum e
            JOIN pg_type t ON t.oid = e.enumtypid
            WHERE t.typname = 'game_type' AND e.enumlabel = 'PUZZLE_COOP'
          ) THEN
            ALTER TYPE game_type ADD VALUE 'PUZZLE_COOP';
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM pg_enum e
            JOIN pg_type t ON t.oid = e.enumtypid
            WHERE t.typname = 'game_type' AND e.enumlabel = 'FINANCE_BATTLE'
          ) THEN
            ALTER TYPE game_type ADD VALUE 'FINANCE_BATTLE';
          END IF;
        END $$;
        """
    )


def downgrade() -> None:
    # PostgreSQL enum value removal is non-trivial and unsafe in downgrade for shared data.
    pass


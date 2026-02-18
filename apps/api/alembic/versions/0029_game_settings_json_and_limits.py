"""reshape game settings model for parental controls

Revision ID: 0029_game_settings_json_and_limits
Revises: 0028_coin_conversion_uuid_and_approval_fields
Create Date: 2026-02-19 00:25:00
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0029_game_settings_json_and_limits"
down_revision: str | None = "0028_coin_conversion_uuid_and_approval_fields"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE game_settings
        ADD COLUMN IF NOT EXISTS max_weekly_coin_conversion INTEGER NOT NULL DEFAULT 500;
        """
    )
    op.execute(
        """
        ALTER TABLE game_settings
        ADD COLUMN IF NOT EXISTS enabled_games JSONB NOT NULL
        DEFAULT '{"TICTACTOE": true, "WORDSEARCH": true, "CROSSWORD": true, "HANGMAN": true, "FINANCE_SIM": true}'::jsonb;
        """
    )
    op.execute(
        """
        ALTER TABLE game_settings
        ADD COLUMN IF NOT EXISTS require_approval_after_minutes INTEGER NOT NULL DEFAULT 30;
        """
    )

    op.execute(
        """
        UPDATE game_settings
        SET
          max_weekly_coin_conversion = COALESCE(coin_conversion_limit_per_week, 500),
          enabled_games = jsonb_build_object(
            'TICTACTOE', COALESCE(tictactoe_enabled, true),
            'WORDSEARCH', COALESCE(wordsearch_enabled, true),
            'CROSSWORD', COALESCE(crossword_enabled, true),
            'HANGMAN', COALESCE(hangman_enabled, true),
            'FINANCE_SIM', COALESCE(finance_sim_enabled, true)
          ),
          require_approval_after_minutes = CASE
            WHEN COALESCE(require_approval_after_30_min, true) THEN 30
            ELSE 0
          END;
        """
    )

    op.execute("ALTER TABLE game_settings DROP COLUMN IF EXISTS tictactoe_enabled;")
    op.execute("ALTER TABLE game_settings DROP COLUMN IF EXISTS wordsearch_enabled;")
    op.execute("ALTER TABLE game_settings DROP COLUMN IF EXISTS crossword_enabled;")
    op.execute("ALTER TABLE game_settings DROP COLUMN IF EXISTS hangman_enabled;")
    op.execute("ALTER TABLE game_settings DROP COLUMN IF EXISTS finance_sim_enabled;")
    op.execute("ALTER TABLE game_settings DROP COLUMN IF EXISTS coin_conversion_limit_per_week;")
    op.execute("ALTER TABLE game_settings DROP COLUMN IF EXISTS require_approval_after_30_min;")


def downgrade() -> None:
    op.execute("ALTER TABLE game_settings ADD COLUMN IF NOT EXISTS tictactoe_enabled BOOLEAN NOT NULL DEFAULT true;")
    op.execute("ALTER TABLE game_settings ADD COLUMN IF NOT EXISTS wordsearch_enabled BOOLEAN NOT NULL DEFAULT true;")
    op.execute("ALTER TABLE game_settings ADD COLUMN IF NOT EXISTS crossword_enabled BOOLEAN NOT NULL DEFAULT true;")
    op.execute("ALTER TABLE game_settings ADD COLUMN IF NOT EXISTS hangman_enabled BOOLEAN NOT NULL DEFAULT true;")
    op.execute("ALTER TABLE game_settings ADD COLUMN IF NOT EXISTS finance_sim_enabled BOOLEAN NOT NULL DEFAULT true;")
    op.execute("ALTER TABLE game_settings ADD COLUMN IF NOT EXISTS coin_conversion_limit_per_week INTEGER NOT NULL DEFAULT 500;")
    op.execute("ALTER TABLE game_settings ADD COLUMN IF NOT EXISTS require_approval_after_30_min BOOLEAN NOT NULL DEFAULT true;")

    op.execute(
        """
        UPDATE game_settings
        SET
          tictactoe_enabled = COALESCE((enabled_games ->> 'TICTACTOE')::boolean, true),
          wordsearch_enabled = COALESCE((enabled_games ->> 'WORDSEARCH')::boolean, true),
          crossword_enabled = COALESCE((enabled_games ->> 'CROSSWORD')::boolean, true),
          hangman_enabled = COALESCE((enabled_games ->> 'HANGMAN')::boolean, true),
          finance_sim_enabled = COALESCE((enabled_games ->> 'FINANCE_SIM')::boolean, true),
          coin_conversion_limit_per_week = COALESCE(max_weekly_coin_conversion, 500),
          require_approval_after_30_min = COALESCE(require_approval_after_minutes, 30) >= 30;
        """
    )

    op.execute("ALTER TABLE game_settings DROP COLUMN IF EXISTS max_weekly_coin_conversion;")
    op.execute("ALTER TABLE game_settings DROP COLUMN IF EXISTS enabled_games;")
    op.execute("ALTER TABLE game_settings DROP COLUMN IF EXISTS require_approval_after_minutes;")


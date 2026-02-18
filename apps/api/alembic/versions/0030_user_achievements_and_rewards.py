"""add user achievements and xp rewards

Revision ID: 0030_user_achievements_and_rewards
Revises: 0029_game_settings_json_and_limits
Create Date: 2026-02-19 01:10:00
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0030_user_achievements_and_rewards"
down_revision: str | None = "0029_game_settings_json_and_limits"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE achievements
        ADD COLUMN IF NOT EXISTS name VARCHAR(255);
        """
    )
    op.execute(
        """
        ALTER TABLE achievements
        ADD COLUMN IF NOT EXISTS icon VARCHAR(100);
        """
    )
    op.execute(
        """
        ALTER TABLE achievements
        ADD COLUMN IF NOT EXISTS xp_reward INTEGER NOT NULL DEFAULT 0;
        """
    )

    op.execute(
        """
        UPDATE achievements
        SET name = COALESCE(name, title),
            icon = COALESCE(icon, icon_key)
        WHERE name IS NULL OR icon IS NULL;
        """
    )

    op.execute("ALTER TABLE achievements ALTER COLUMN name SET NOT NULL;")
    op.execute("ALTER TABLE achievements ALTER COLUMN icon SET NOT NULL;")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS user_achievements (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            achievement_id INTEGER NOT NULL REFERENCES achievements(id),
            unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint
                WHERE conname = 'uq_user_achievements_user_achievement'
            ) THEN
                ALTER TABLE user_achievements
                ADD CONSTRAINT uq_user_achievements_user_achievement UNIQUE (user_id, achievement_id);
            END IF;
        END
        $$;
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_user_achievements_user_id ON user_achievements (user_id);")

    op.execute(
        """
        INSERT INTO achievements (slug, title, name, description, icon_key, icon, xp_reward, condition_type, condition_value) VALUES
            ('first_win', 'First Win', 'First Win', 'Conquiste sua primeira vitória no Jogo da Velha.', 'trophy', 'trophy', 20, 'first_win_tictactoe', 1),
            ('wins_streak_3', '3 Wins Streak', '3 Wins Streak', 'Ganhe 3 partidas seguidas no Jogo da Velha.', 'flame', 'flame', 30, 'tictactoe_win_streak', 3),
            ('xp_100_reached', '100 XP reached', '100 XP reached', 'Alcance 100 XP totais.', 'sparkles', 'sparkles', 25, 'xp_reached', 100),
            ('first_finance_master', 'First Finance Master rating', 'First Finance Master rating', 'Alcance rating Financial Master no Mesada Inteligente.', 'piggy-bank', 'piggy-bank', 35, 'finance_master_rating', 1)
        ON CONFLICT (slug) DO UPDATE
        SET title = EXCLUDED.title,
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            icon_key = EXCLUDED.icon_key,
            icon = EXCLUDED.icon,
            xp_reward = EXCLUDED.xp_reward,
            condition_type = EXCLUDED.condition_type,
            condition_value = EXCLUDED.condition_value;
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_user_achievements_user_id;")
    op.execute("ALTER TABLE IF EXISTS user_achievements DROP CONSTRAINT IF EXISTS uq_user_achievements_user_achievement;")
    op.execute("DROP TABLE IF EXISTS user_achievements;")

    op.execute("ALTER TABLE achievements DROP COLUMN IF EXISTS xp_reward;")
    op.execute("ALTER TABLE achievements DROP COLUMN IF EXISTS icon;")
    op.execute("ALTER TABLE achievements DROP COLUMN IF EXISTS name;")


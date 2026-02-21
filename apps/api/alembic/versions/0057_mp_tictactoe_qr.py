"""multiplayer qr/code foundation for game sessions

Revision ID: 0057_mp_tictactoe_qr
Revises: 0056_child_avatar_upload
Create Date: 2026-02-21 09:20:00
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0057_mp_tictactoe_qr"
down_revision: str | None = "0056_child_avatar_upload"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS tenant_id INTEGER NULL REFERENCES tenants(id);")
    op.execute("ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS session_status VARCHAR(24) NOT NULL DEFAULT 'COMPLETED';")
    op.execute("ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS multiplayer_mode VARCHAR(24) NOT NULL DEFAULT 'SOLO';")
    op.execute("ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS join_token VARCHAR(96) NULL;")
    op.execute("ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS join_code VARCHAR(12) NULL;")
    op.execute("ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NULL;")
    op.execute("ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;")
    op.execute("CREATE INDEX IF NOT EXISTS ix_game_sessions_join_code ON game_sessions(join_code);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_game_sessions_tenant_created_at ON game_sessions(tenant_id, created_at DESC);")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS game_participants (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id),
            is_host BOOLEAN NOT NULL DEFAULT FALSE,
            player_role VARCHAR(8) NOT NULL,
            joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_game_participants_session_user UNIQUE (session_id, user_id),
            CONSTRAINT uq_game_participants_session_role UNIQUE (session_id, player_role)
        );
        """,
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_game_participants_session_id ON game_participants(session_id);")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS game_moves (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id),
            move_index INTEGER NOT NULL,
            move_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_game_moves_session_move_index UNIQUE (session_id, move_index)
        );
        """,
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_game_moves_session_id ON game_moves(session_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_game_moves_user_id_created_at ON game_moves(user_id, created_at DESC);")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_game_moves_user_id_created_at;")
    op.execute("DROP INDEX IF EXISTS ix_game_moves_session_id;")
    op.execute("DROP TABLE IF EXISTS game_moves;")

    op.execute("DROP INDEX IF EXISTS ix_game_participants_session_id;")
    op.execute("DROP TABLE IF EXISTS game_participants;")

    op.execute("DROP INDEX IF EXISTS ix_game_sessions_tenant_created_at;")
    op.execute("DROP INDEX IF EXISTS ix_game_sessions_join_code;")
    op.execute("ALTER TABLE game_sessions DROP COLUMN IF EXISTS metadata;")
    op.execute("ALTER TABLE game_sessions DROP COLUMN IF EXISTS expires_at;")
    op.execute("ALTER TABLE game_sessions DROP COLUMN IF EXISTS join_code;")
    op.execute("ALTER TABLE game_sessions DROP COLUMN IF EXISTS join_token;")
    op.execute("ALTER TABLE game_sessions DROP COLUMN IF EXISTS multiplayer_mode;")
    op.execute("ALTER TABLE game_sessions DROP COLUMN IF EXISTS session_status;")
    op.execute("ALTER TABLE game_sessions DROP COLUMN IF EXISTS tenant_id;")

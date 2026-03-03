"""seed minimum safe content by age buckets

Revision ID: 0089_axion_safe_content_seed
Revises: 0088_content_prerequisites
Create Date: 2026-02-26 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
from sqlalchemy import text


revision: str = "0089_axion_safe_content_seed"
down_revision: str | None = "0088_content_prerequisites"
branch_labels = None
depends_on = None


_SEED_ROWS = [
    # lt10
    ("mini_activity", "neutral", 1, "1111111111111111111111111111111111111111111111111111111111111111", 3, 9),
    ("mini_activity", "general", 2, "2222222222222222222222222222222222222222222222222222222222222222", 3, 9),
    # 10_12
    ("mini_activity", "neutral", 2, "3333333333333333333333333333333333333333333333333333333333333333", 10, 12),
    ("mini_activity", "general", 3, "4444444444444444444444444444444444444444444444444444444444444444", 10, 12),
    # 13_15
    ("mini_activity", "neutral", 3, "5555555555555555555555555555555555555555555555555555555555555555", 13, 15),
    ("mini_activity", "general", 4, "6666666666666666666666666666666666666666666666666666666666666666", 13, 15),
    # 16_18
    ("mini_activity", "neutral", 4, "7777777777777777777777777777777777777777777777777777777777777777", 16, 18),
    ("mini_activity", "general", 5, "8888888888888888888888888888888888888888888888888888888888888888", 16, 18),
]


def upgrade() -> None:
    bind = op.get_bind()
    for content_type, subject, difficulty, fingerprint, age_min, age_max in _SEED_ROWS:
        bind.execute(
            text(
                """
            INSERT INTO axion_content_catalog
                (content_type, subject, difficulty, content_fingerprint, age_min, age_max, safety_tags, is_active)
            SELECT
                :content_type, :subject, :difficulty, :fingerprint, :age_min, :age_max, '[]'::jsonb, true
            WHERE NOT EXISTS (
                SELECT 1 FROM axion_content_catalog WHERE content_fingerprint = :fingerprint
            );
            """
            ),
            {
                "content_type": content_type,
                "subject": subject,
                "difficulty": int(difficulty),
                "fingerprint": fingerprint,
                "age_min": int(age_min),
                "age_max": int(age_max),
            },
        )


def downgrade() -> None:
    bind = op.get_bind()
    fingerprints = [str(row[3]) for row in _SEED_ROWS]
    bind.execute(
        text("DELETE FROM axion_content_catalog WHERE content_fingerprint = ANY(CAST(:fingerprints AS text[]));"),
        {"fingerprints": fingerprints},
    )

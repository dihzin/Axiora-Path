"""ensure required subject catalog, age ranges, and minimal playable seed

Revision ID: 0092_required_subject_catalog
Revises: 0091_axion_decision_mastery_applied
Create Date: 2026-02-28 00:00:00.000000
"""

from __future__ import annotations

import json

from alembic import op
import sqlalchemy as sa


revision: str = "0092_required_subject_catalog"
down_revision: str | None = "0091_axion_decision_mastery_applied"
branch_labels = None
depends_on = None


AGE_GROUPS: tuple[str, ...] = ("6-8", "9-12", "13-15")
AGE_BOUNDS: dict[str, tuple[int, int]] = {
    "6-8": (6, 8),
    "9-12": (9, 12),
    "13-15": (13, 15),
}
REQUIRED_SUBJECTS: tuple[tuple[str, str, str], ...] = (
    ("Matemática", "calculator", "#22C55E"),
    ("Português", "book-open", "#0EA5E9"),
    ("Inglês", "languages", "#F97316"),
    ("História", "landmark", "#A855F7"),
    ("Geografia", "map", "#06B6D4"),
    ("Ciências", "leaf", "#F59E0B"),
    ("Física", "atom", "#6366F1"),
    ("Química", "flask-conical", "#14B8A6"),
    ("Filosofia", "brain", "#8B5CF6"),
    ("Artes", "palette", "#EC4899"),
    ("Educação Financeira", "piggy-bank", "#D97706"),
    ("Lógica", "puzzle", "#0F766E"),
    ("Programação básica", "code-2", "#2563EB"),
    ("Redação", "pen-tool", "#DC2626"),
)


def _difficulty_for_age(age_group: str) -> str:
    if age_group == "6-8":
        return "EASY"
    if age_group == "9-12":
        return "MEDIUM"
    return "HARD"


def upgrade() -> None:
    bind = op.get_bind()

    op.add_column("subjects", sa.Column("age_min", sa.Integer(), nullable=False, server_default=sa.text("6")))
    op.add_column("subjects", sa.Column("age_max", sa.Integer(), nullable=False, server_default=sa.text("15")))
    op.create_check_constraint("ck_subjects_age_min", "subjects", "age_min >= 3")
    op.create_check_constraint("ck_subjects_age_max", "subjects", "age_max <= 18")
    op.create_check_constraint("ck_subjects_age_min_lte_age_max", "subjects", "age_min <= age_max")

    bind.execute(
        sa.text(
            """
            UPDATE subjects
            SET age_min = CASE age_group::text
                    WHEN '6-8' THEN 6
                    WHEN '9-12' THEN 9
                    ELSE 13
                END,
                age_max = CASE age_group::text
                    WHEN '6-8' THEN 8
                    WHEN '9-12' THEN 12
                    ELSE 15
                END
            """
        )
    )
    bind.execute(sa.text("ALTER TABLE subjects ALTER COLUMN age_min DROP DEFAULT"))
    bind.execute(sa.text("ALTER TABLE subjects ALTER COLUMN age_max DROP DEFAULT"))

    for age_group in AGE_GROUPS:
        age_min, age_max = AGE_BOUNDS[age_group]
        for name, icon, color in REQUIRED_SUBJECTS:
            subject_id = bind.execute(
                sa.text(
                    """
                    SELECT id
                    FROM subjects
                    WHERE age_group::text = :age_group
                      AND lower(name) = lower(:name)
                    LIMIT 1
                    """
                ),
                {"age_group": age_group, "name": name},
            ).scalar()

            if subject_id is None:
                next_order = int(
                    bind.execute(
                        sa.text(
                            """
                            SELECT COALESCE(MAX("order"), 0) + 1
                            FROM subjects
                            WHERE age_group::text = :age_group
                            """
                        ),
                        {"age_group": age_group},
                    ).scalar()
                    or 1
                )
                subject_id = bind.execute(
                    sa.text(
                        """
                        INSERT INTO subjects (name, age_group, age_min, age_max, icon, color, "order")
                        VALUES (:name, CAST(:age_group AS subject_age_group), :age_min, :age_max, :icon, :color, :order)
                        RETURNING id
                        """
                    ),
                    {
                        "name": name,
                        "age_group": age_group,
                        "age_min": age_min,
                        "age_max": age_max,
                        "icon": icon,
                        "color": color,
                        "order": next_order,
                    },
                ).scalar()
            else:
                bind.execute(
                    sa.text(
                        """
                        UPDATE subjects
                        SET age_min = :age_min,
                            age_max = :age_max,
                            icon = COALESCE(icon, :icon),
                            color = COALESCE(color, :color)
                        WHERE id = :subject_id
                        """
                    ),
                    {
                        "subject_id": int(subject_id),
                        "age_min": age_min,
                        "age_max": age_max,
                        "icon": icon,
                        "color": color,
                    },
                )

            subject_id = int(subject_id)
            unit_id = bind.execute(
                sa.text(
                    """
                    SELECT id
                    FROM units
                    WHERE subject_id = :subject_id
                    ORDER BY "order" ASC
                    LIMIT 1
                    """
                ),
                {"subject_id": subject_id},
            ).scalar()
            if unit_id is None:
                unit_id = bind.execute(
                    sa.text(
                        """
                        INSERT INTO units (subject_id, title, description, "order", required_level)
                        VALUES (:subject_id, :title, :description, 1, 1)
                        RETURNING id
                        """
                    ),
                    {
                        "subject_id": subject_id,
                        "title": f"Introdução a {name}",
                        "description": f"Unidade essencial de {name}.",
                    },
                ).scalar()
            unit_id = int(unit_id)

            lesson_id = bind.execute(
                sa.text(
                    """
                    SELECT id
                    FROM lessons
                    WHERE unit_id = :unit_id
                    ORDER BY "order" ASC
                    LIMIT 1
                    """
                ),
                {"unit_id": unit_id},
            ).scalar()
            if lesson_id is None:
                lesson_id = bind.execute(
                    sa.text(
                        """
                        INSERT INTO lessons (unit_id, title, "order", xp_reward, difficulty, type)
                        VALUES (
                            :unit_id,
                            :title,
                            1,
                            20,
                            CAST(:difficulty AS lesson_difficulty),
                            CAST('MULTIPLE_CHOICE' AS lesson_type)
                        )
                        RETURNING id
                        """
                    ),
                    {
                        "unit_id": unit_id,
                        "title": f"Missão inicial de {name}",
                        "difficulty": _difficulty_for_age(age_group),
                    },
                ).scalar()
            lesson_id = int(lesson_id)

            has_lesson_content = bind.execute(
                sa.text("SELECT EXISTS(SELECT 1 FROM lesson_contents WHERE lesson_id = :lesson_id)"),
                {"lesson_id": lesson_id},
            ).scalar()
            if not bool(has_lesson_content):
                payload = json.dumps(
                    {
                        "title": f"Bem-vindo a {name}",
                        "body": f"Esta é a trilha inicial de {name} para a faixa {age_group}.",
                    }
                )
                bind.execute(
                    sa.text(
                        """
                        INSERT INTO lesson_contents (lesson_id, content_type, content_data, "order")
                        VALUES (:lesson_id, CAST('TEXT' AS lesson_content_type), CAST(:content_data AS jsonb), 1)
                        """
                    ),
                    {"lesson_id": lesson_id, "content_data": payload},
                )

            skill_id = bind.execute(
                sa.text(
                    """
                    SELECT id::text
                    FROM skills
                    WHERE subject_id = :subject_id
                    ORDER BY "order" ASC
                    LIMIT 1
                    """
                ),
                {"subject_id": subject_id},
            ).scalar()
            if skill_id is None:
                skill_id = bind.execute(
                    sa.text(
                        """
                        INSERT INTO skills (subject_id, name, description, age_group, "order")
                        VALUES (
                            :subject_id,
                            :name,
                            :description,
                            CAST(:age_group AS subject_age_group),
                            1
                        )
                        RETURNING id::text
                        """
                    ),
                    {
                        "subject_id": subject_id,
                        "name": f"Fundamentos de {name}",
                        "description": f"Habilidade base para iniciar {name}.",
                        "age_group": age_group,
                    },
                ).scalar()

            has_playable = bind.execute(
                sa.text(
                    """
                    SELECT EXISTS(
                        SELECT 1
                        FROM skills sk
                        WHERE sk.subject_id = :subject_id
                          AND (
                              EXISTS (SELECT 1 FROM question_templates qt WHERE qt.skill_id = sk.id)
                              OR EXISTS (SELECT 1 FROM questions q WHERE q.skill_id = sk.id AND q.type <> CAST('TEMPLATE' AS question_type))
                          )
                    )
                    """
                ),
                {"subject_id": subject_id},
            ).scalar()
            if bool(has_playable):
                continue

            skill_id = str(skill_id)
            difficulties = ("EASY", "MEDIUM", "HARD")
            for idx, difficulty in enumerate(difficulties, start=1):
                metadata = json.dumps(
                    {
                        "answer": idx + 1,
                        "options": [
                            {"id": "a", "label": str(idx + 1)},
                            {"id": "b", "label": str(idx + 2)},
                            {"id": "c", "label": str(idx)},
                        ],
                        "correctOptionId": "a",
                    }
                )
                bind.execute(
                    sa.text(
                        """
                        INSERT INTO questions (skill_id, lesson_id, type, difficulty, prompt, explanation, metadata)
                        VALUES (
                            CAST(:skill_id AS uuid),
                            :lesson_id,
                            CAST('MCQ' AS question_type),
                            CAST(:difficulty AS question_difficulty),
                            :prompt,
                            :explanation,
                            CAST(:metadata AS jsonb)
                        )
                        """
                    ),
                    {
                        "skill_id": skill_id,
                        "lesson_id": lesson_id,
                        "difficulty": difficulty,
                        "prompt": f"[{name}] Pergunta essencial ({difficulty}).",
                        "explanation": f"Conteúdo mínimo de {name} para evitar trilha vazia.",
                        "metadata": metadata,
                    },
                )


def downgrade() -> None:
    op.drop_constraint("ck_subjects_age_min_lte_age_max", "subjects", type_="check")
    op.drop_constraint("ck_subjects_age_max", "subjects", type_="check")
    op.drop_constraint("ck_subjects_age_min", "subjects", type_="check")
    op.drop_column("subjects", "age_max")
    op.drop_column("subjects", "age_min")

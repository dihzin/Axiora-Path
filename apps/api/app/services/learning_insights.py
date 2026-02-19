from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.orm import Session


@dataclass(slots=True)
class SkillInsight:
    skill_id: str
    skill_name: str
    subject_name: str
    mastery: float


@dataclass(slots=True)
class SubjectProgressInsight:
    subject_id: int
    subject_name: str
    age_group: str
    mastery_average: float
    unit_completion_percent: float


@dataclass(slots=True)
class LearningInsightsSnapshot:
    strongest_skills: list[SkillInsight]
    practice_skills: list[SkillInsight]
    due_reviews_count: int
    weekly_xp_earned: int
    subjects: list[SubjectProgressInsight]


def get_learning_insights(db: Session, *, user_id: int) -> LearningInsightsSnapshot:
    strongest_rows = db.execute(
        text(
            """
            SELECT sk.id::text AS skill_id,
                   sk.name AS skill_name,
                   s.name AS subject_name,
                   COALESCE(usm.mastery::float, 0) AS mastery
            FROM user_skill_mastery usm
            JOIN skills sk ON sk.id = usm.skill_id
            JOIN subjects s ON s.id = sk.subject_id
            WHERE usm.user_id = :user_id
            ORDER BY usm.mastery DESC, sk.name ASC
            LIMIT 5
            """
        ),
        {"user_id": user_id},
    ).all()

    practice_rows = db.execute(
        text(
            """
            SELECT sk.id::text AS skill_id,
                   sk.name AS skill_name,
                   s.name AS subject_name,
                   COALESCE(usm.mastery::float, 0) AS mastery
            FROM user_skill_mastery usm
            JOIN skills sk ON sk.id = usm.skill_id
            JOIN subjects s ON s.id = sk.subject_id
            WHERE usm.user_id = :user_id
            ORDER BY usm.mastery ASC, sk.name ASC
            LIMIT 5
            """
        ),
        {"user_id": user_id},
    ).all()

    due_reviews_count = int(
        db.execute(
            text(
                """
                SELECT COUNT(*)::int
                FROM user_skill_mastery
                WHERE user_id = :user_id
                  AND next_review_at IS NOT NULL
                  AND next_review_at <= NOW()
                """
            ),
            {"user_id": user_id},
        ).scalar_one()
    )

    weekly_xp_earned = int(
        db.execute(
            text(
                """
                SELECT COALESCE(SUM(xp_earned), 0)::int
                FROM learning_sessions
                WHERE user_id = :user_id
                  AND ended_at IS NOT NULL
                  AND ended_at >= NOW() - INTERVAL '7 days'
                """
            ),
            {"user_id": user_id},
        ).scalar_one()
    )

    subject_rows = db.execute(
        text(
            """
            WITH mastery_by_subject AS (
                SELECT sk.subject_id,
                       COALESCE(AVG(usm.mastery::float), 0)::float AS mastery_average
                FROM skills sk
                LEFT JOIN user_skill_mastery usm
                  ON usm.skill_id = sk.id
                 AND usm.user_id = :user_id
                GROUP BY sk.subject_id
            ),
            unit_status AS (
                SELECT u.id AS unit_id,
                       u.subject_id,
                       CASE
                           WHEN COUNT(l.id) = 0 THEN 0
                           WHEN COUNT(l.id) = SUM(CASE WHEN lp.completed THEN 1 ELSE 0 END) THEN 1
                           ELSE 0
                       END AS unit_completed
                FROM units u
                LEFT JOIN lessons l
                  ON l.unit_id = u.id
                LEFT JOIN lesson_progress lp
                  ON lp.lesson_id = l.id
                 AND lp.user_id = :user_id
                GROUP BY u.id, u.subject_id
            ),
            unit_completion_by_subject AS (
                SELECT subject_id,
                       COUNT(*)::int AS total_units,
                       COALESCE(SUM(unit_completed), 0)::int AS completed_units
                FROM unit_status
                GROUP BY subject_id
            )
            SELECT s.id AS subject_id,
                   s.name AS subject_name,
                   s.age_group::text AS age_group,
                   COALESCE(m.mastery_average, 0)::float AS mastery_average,
                   CASE
                       WHEN COALESCE(u.total_units, 0) = 0 THEN 0
                       ELSE ROUND((u.completed_units::float / u.total_units::float) * 100, 2)
                   END AS unit_completion_percent
            FROM subjects s
            LEFT JOIN mastery_by_subject m
              ON m.subject_id = s.id
            LEFT JOIN unit_completion_by_subject u
              ON u.subject_id = s.id
            ORDER BY s.age_group::text, s."order"
            """
        ),
        {"user_id": user_id},
    ).all()

    return LearningInsightsSnapshot(
        strongest_skills=[
            SkillInsight(
                skill_id=str(row.skill_id),
                skill_name=str(row.skill_name),
                subject_name=str(row.subject_name),
                mastery=float(row.mastery),
            )
            for row in strongest_rows
        ],
        practice_skills=[
            SkillInsight(
                skill_id=str(row.skill_id),
                skill_name=str(row.skill_name),
                subject_name=str(row.subject_name),
                mastery=float(row.mastery),
            )
            for row in practice_rows
        ],
        due_reviews_count=due_reviews_count,
        weekly_xp_earned=weekly_xp_earned,
        subjects=[
            SubjectProgressInsight(
                subject_id=int(row.subject_id),
                subject_name=str(row.subject_name),
                age_group=str(row.age_group),
                mastery_average=float(row.mastery_average),
                unit_completion_percent=float(row.unit_completion_percent),
            )
            for row in subject_rows
        ],
    )

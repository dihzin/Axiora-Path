from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ChildProfile, Skill, Subject
from app.models_learning import StudentLessonProgress, StudentSkillMastery, StudentSubjectState
from app.services.child_age import get_child_age
from app.services.lesson_engine import LessonEngine, StudentSkillState
from app.services.skill_graph import SkillGraph, build_graph


@dataclass(frozen=True, slots=True)
class NextLessonRecommendation:
    subject: str
    skill: str
    lesson: str
    difficulty: str
    reason: str


@dataclass(frozen=True, slots=True)
class LearningGap:
    subject: str
    skill: str
    reason: str
    severity: str


class AxionLearningEngine:
    def __init__(self, db: Session, *, graph: SkillGraph | None = None, tenant_id: int | None = None) -> None:
        self.db = db
        self.graph = build_graph() if graph is None else graph
        self.tenant_id = tenant_id

    def recommend_next_lesson(self, student_id: int) -> NextLessonRecommendation | None:
        gap = self.detect_learning_gap(student_id)
        if gap is not None:
            return self._recommend_remediation(student_id=student_id, gap=gap)

        review = self.schedule_review(student_id)
        if review is not None:
            return review

        mastery_map = self._load_mastery_map(student_id=student_id)
        target_subject = self._resolve_target_subject(student_id=student_id)
        age_group = self._resolve_age_group(student_id=student_id)
        preferred_difficulty = self._resolve_preferred_difficulty(mastery_map)
        node = self.graph.get_next_skill(
            {
                "age_group": age_group,
                "difficulty": preferred_difficulty,
                "subject": target_subject,
                "mastery": mastery_map,
            }
        )
        if node is None:
            return None

        lesson = self._pick_lesson_for_mastery(node.lessons, mastery_map.get(node.id, 0.0))
        difficulty = LessonEngine.__new__(LessonEngine).determine_difficulty(
            StudentSkillState(
                mastery=mastery_map.get(node.id, 0.0),
                age_group=age_group,
            )
        )
        return NextLessonRecommendation(
            subject=node.subject,
            skill=node.id,
            lesson=lesson,
            difficulty=difficulty.value.lower(),
            reason="next_skill_progression",
        )

    def detect_learning_gap(self, student_id: int) -> LearningGap | None:
        weakest = self._weakest_skill_row(student_id=student_id)
        if weakest is None:
            return None

        if float(weakest.mastery) < 0.45:
            return LearningGap(
                subject=weakest.subject,
                skill=weakest.skill,
                reason="low_mastery",
                severity="high",
            )
        if float(weakest.confidence) < 0.50:
            return LearningGap(
                subject=weakest.subject,
                skill=weakest.skill,
                reason="low_confidence",
                severity="medium",
            )
        if float(weakest.velocity) < 0.0:
            return LearningGap(
                subject=weakest.subject,
                skill=weakest.skill,
                reason="negative_velocity",
                severity="medium",
            )
        recent_struggle = self._recent_failed_attempts(student_id=student_id)
        if recent_struggle >= 2:
            return LearningGap(
                subject=weakest.subject,
                skill=weakest.skill,
                reason="recent_failed_lessons",
                severity="medium",
            )
        return None

    def schedule_review(self, student_id: int) -> NextLessonRecommendation | None:
        weakest = self._weakest_skill_row(student_id=student_id)
        if weakest is None:
            return None

        mastery_map = self._load_mastery_map(student_id=student_id)
        review_skill = weakest.skill
        prerequisites = self.graph.get_prerequisite_skills(review_skill)
        if prerequisites:
            weakest_prerequisite = min(prerequisites, key=lambda item: mastery_map.get(item, 1.0))
            if mastery_map.get(weakest_prerequisite, 1.0) <= mastery_map.get(review_skill, 1.0):
                review_skill = weakest_prerequisite

        node = self.graph.get_node(review_skill)
        age_group = self._resolve_age_group(student_id=student_id)
        difficulty = LessonEngine.__new__(LessonEngine).determine_difficulty(
            StudentSkillState(
                mastery=mastery_map.get(review_skill, 0.0),
                age_group=age_group,
            )
        )
        lesson = self._pick_review_lesson(node.lessons, mastery_map.get(review_skill, 0.0))
        if mastery_map.get(review_skill, 1.0) > 0.75 and self._recent_failed_attempts(student_id=student_id) < 2:
            return None
        return NextLessonRecommendation(
            subject=node.subject,
            skill=node.id,
            lesson=lesson,
            difficulty=difficulty.value.lower(),
            reason="review_scheduled",
        )

    def _recommend_remediation(self, *, student_id: int, gap: LearningGap) -> NextLessonRecommendation:
        node = self.graph.get_node(gap.skill)
        age_group = self._resolve_age_group(student_id=student_id)
        mastery_map = self._load_mastery_map(student_id=student_id)
        difficulty = LessonEngine.__new__(LessonEngine).determine_difficulty(
            StudentSkillState(
                mastery=mastery_map.get(gap.skill, 0.0),
                age_group=age_group,
            )
        )
        return NextLessonRecommendation(
            subject=gap.subject,
            skill=gap.skill,
            lesson=node.lessons[0],
            difficulty=difficulty.value.lower(),
            reason=f"remediation:{gap.reason}",
        )

    def _load_mastery_map(self, *, student_id: int) -> dict[str, float]:
        rows = self.db.execute(
            select(StudentSkillMastery.skill_id, StudentSkillMastery.mastery).where(
                StudentSkillMastery.student_id == int(student_id)
            )
        ).all()
        return {str(skill_id): float(mastery) for skill_id, mastery in rows}

    def _resolve_target_subject(self, *, student_id: int) -> str | None:
        row = self.db.execute(
            select(StudentSubjectState.subject_id, Subject.name)
            .select_from(StudentSubjectState)
            .join(Subject, Subject.id == StudentSubjectState.subject_id)
            .where(StudentSubjectState.student_id == int(student_id))
            .order_by(StudentSubjectState.progress.asc(), StudentSubjectState.subject_id.asc())
        ).first()
        if row is None:
            return None
        return str(row[1]).strip().lower()

    def _resolve_age_group(self, *, student_id: int) -> str:
        child = self.db.scalar(select(ChildProfile).where(ChildProfile.user_id == int(student_id)).limit(1))
        if child is None:
            return "9-12"
        age = get_child_age(child.date_of_birth, today=date.today())
        if age <= 8:
            return "6-8"
        if age <= 12:
            return "9-12"
        return "13-15"

    def _resolve_preferred_difficulty(self, mastery_map: dict[str, float]) -> str:
        if not mastery_map:
            return "easy"
        average = sum(mastery_map.values()) / len(mastery_map)
        if average < 0.35:
            return "easy"
        if average <= 0.70:
            return "medium"
        return "hard"

    def _weakest_skill_row(self, *, student_id: int):
        rows = self.db.execute(
            select(StudentSkillMastery, Skill, Subject)
            .select_from(StudentSkillMastery)
            .join(Skill, Skill.id == StudentSkillMastery.skill_id)
            .join(Subject, Subject.id == Skill.subject_id)
            .where(StudentSkillMastery.student_id == int(student_id))
            .order_by(
                StudentSkillMastery.mastery.asc(),
                StudentSkillMastery.confidence.asc(),
                StudentSkillMastery.velocity.asc(),
                Skill.order.asc(),
            )
        ).all()
        if not rows:
            return None
        mastery_row, skill_row, subject_row = rows[0]
        return type(
            "WeakestSkillRow",
            (),
            {
                "skill": str(skill_row.name).strip().lower(),
                "subject": str(subject_row.name).strip().lower(),
                "mastery": float(mastery_row.mastery),
                "confidence": float(mastery_row.confidence),
                "velocity": float(mastery_row.velocity),
            },
        )()

    def _recent_failed_attempts(self, *, student_id: int) -> int:
        rows = self.db.execute(
            select(StudentLessonProgress.score)
            .where(StudentLessonProgress.student_id == int(student_id))
            .order_by(StudentLessonProgress.lesson_id.desc())
        ).all()
        failures = 0
        for row in rows[:5]:
            score = row[0]
            if score is not None and int(score) < 60:
                failures += 1
        return failures

    @staticmethod
    def _pick_lesson_for_mastery(lessons: tuple[str, ...], mastery: float) -> str:
        if mastery < 0.35:
            return lessons[0]
        if mastery < 0.70:
            return lessons[min(1, len(lessons) - 1)]
        return lessons[-1]

    @staticmethod
    def _pick_review_lesson(lessons: tuple[str, ...], mastery: float) -> str:
        if mastery < 0.35:
            return lessons[0]
        return lessons[min(1, len(lessons) - 1)]


def recommend_next_lesson(db: Session, *, student_id: int, tenant_id: int | None = None) -> NextLessonRecommendation | None:
    return AxionLearningEngine(db, tenant_id=tenant_id).recommend_next_lesson(student_id)


def detect_learning_gap(db: Session, *, student_id: int, tenant_id: int | None = None) -> LearningGap | None:
    return AxionLearningEngine(db, tenant_id=tenant_id).detect_learning_gap(student_id)


def schedule_review(db: Session, *, student_id: int, tenant_id: int | None = None) -> NextLessonRecommendation | None:
    return AxionLearningEngine(db, tenant_id=tenant_id).schedule_review(student_id)

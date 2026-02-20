from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    ChildProfile,
    LedgerTransaction,
    Membership,
    PotType,
    Skill,
    Unit,
    UserLearningStreak,
    UserQuestionHistory,
    UserSkillMastery,
    Wallet,
)
from app.services.learning_energy import get_energy_snapshot
from app.services.wallet import extract_pot_split, signed_amount_cents


@dataclass(slots=True)
class RecentApprovalsFacts:
    approved: int
    rejected: int


@dataclass(slots=True)
class SkillFact:
    skill_id: str
    name: str
    mastery: float


@dataclass(slots=True)
class LastLessonFacts:
    unit_title: str
    lesson_title: str
    stars: int


@dataclass(slots=True)
class WalletFacts:
    total: int
    spend: int
    save: int
    donate: int


@dataclass(slots=True)
class EnergyFacts:
    current: int
    regen_eta: int


@dataclass(slots=True)
class AxionFacts:
    last_active_at: datetime | None
    streak_days: int
    weekly_completion_rate: float
    recent_approvals: RecentApprovalsFacts
    due_reviews_count: int
    weakest_skills: list[SkillFact]
    strongest_skills: list[SkillFact]
    last_lesson: LastLessonFacts | None
    wallet: WalletFacts
    energy: EnergyFacts

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        weakest = [
            {
                "skillId": item["skill_id"],
                "name": item["name"],
                "mastery": item["mastery"],
            }
            for item in data["weakest_skills"]
        ]
        strongest = [
            {
                "skillId": item["skill_id"],
                "name": item["name"],
                "mastery": item["mastery"],
            }
            for item in data["strongest_skills"]
        ]
        last_lesson = data["last_lesson"]
        lesson_payload = (
            {
                "unitTitle": last_lesson["unit_title"],
                "lessonTitle": last_lesson["lesson_title"],
                "stars": last_lesson["stars"],
            }
            if last_lesson is not None
            else None
        )
        return {
            "lastActiveAt": data["last_active_at"],
            "streakDays": data["streak_days"],
            "weeklyCompletionRate": data["weekly_completion_rate"],
            "recentApprovals": data["recent_approvals"],
            "dueReviewsCount": data["due_reviews_count"],
            "weakestSkills": weakest,
            "strongestSkills": strongest,
            "lastLesson": lesson_payload,
            "wallet": data["wallet"],
            "energy": {
                "current": data["energy"]["current"],
                "regenETA": data["energy"]["regen_eta"],
            },
        }


def _resolve_primary_child(db: Session, *, user_id: int) -> ChildProfile | None:
    tenant_ids = db.scalars(select(Membership.tenant_id).where(Membership.user_id == user_id)).all()
    if not tenant_ids:
        return None
    return db.scalar(
        select(ChildProfile)
        .where(
            ChildProfile.tenant_id.in_(tenant_ids),
            ChildProfile.deleted_at.is_(None),
        )
        .order_by(ChildProfile.id.asc())
    )


def _last_active_at(db: Session, *, user_id: int) -> datetime | None:
    last_question = db.scalar(select(func.max(UserQuestionHistory.created_at)).where(UserQuestionHistory.user_id == user_id))
    from app.models import GameSession, LearningSession

    last_learning = db.scalar(
        select(func.max(LearningSession.ended_at)).where(
            LearningSession.user_id == user_id,
            LearningSession.ended_at.is_not(None),
        )
    )
    last_game = db.scalar(select(func.max(GameSession.created_at)).where(GameSession.user_id == user_id))
    candidates = [item for item in [last_question, last_learning, last_game] if item is not None]
    return max(candidates) if candidates else None


def _weekly_completion_rate(db: Session, *, user_id: int) -> float:
    from app.models import LearningSession

    now = datetime.now(UTC)
    start = now - timedelta(days=7)
    rows = db.execute(
        select(LearningSession.total_questions, LearningSession.correct_count, LearningSession.ended_at).where(
            LearningSession.user_id == user_id,
            LearningSession.started_at >= start,
        )
    ).all()
    if not rows:
        return 0.0
    completed = 0
    for total_questions, correct_count, ended_at in rows:
        if ended_at is None:
            continue
        total = int(total_questions or 0)
        correct = int(correct_count or 0)
        accuracy = (correct / total) if total > 0 else 0.0
        if accuracy >= 0.60:
            completed += 1
    return round(completed / max(1, len(rows)), 4)


def _recent_approvals(db: Session, *, user_id: int) -> RecentApprovalsFacts:
    from app.models import TaskLog, TaskLogStatus

    tenant_ids = db.scalars(select(Membership.tenant_id).where(Membership.user_id == user_id)).all()
    if not tenant_ids:
        return RecentApprovalsFacts(approved=0, rejected=0)
    start = datetime.now(UTC).date() - timedelta(days=14)
    rows = db.execute(
        select(TaskLog.status).where(
            TaskLog.tenant_id.in_(tenant_ids),
            TaskLog.date >= start,
        )
    ).all()
    approved = sum(1 for (status,) in rows if status == TaskLogStatus.APPROVED)
    rejected = sum(1 for (status,) in rows if status == TaskLogStatus.REJECTED)
    return RecentApprovalsFacts(approved=approved, rejected=rejected)


def _due_reviews_count(db: Session, *, user_id: int) -> int:
    now = datetime.now(UTC)
    value = db.scalar(
        select(func.count(UserSkillMastery.id)).where(
            UserSkillMastery.user_id == user_id,
            UserSkillMastery.next_review_at.is_not(None),
            UserSkillMastery.next_review_at <= now,
        )
    )
    return int(value or 0)


def _skill_rankings(db: Session, *, user_id: int) -> tuple[list[SkillFact], list[SkillFact]]:
    rows = db.execute(
        select(Skill.id, Skill.name, UserSkillMastery.mastery)
        .select_from(UserSkillMastery)
        .join(Skill, Skill.id == UserSkillMastery.skill_id)
        .where(UserSkillMastery.user_id == user_id)
    ).all()
    items = [
        SkillFact(
            skill_id=str(row[0]),
            name=str(row[1]),
            mastery=float(row[2]),
        )
        for row in rows
    ]
    weakest = sorted(items, key=lambda x: (x.mastery, x.name))[:5]
    strongest = sorted(items, key=lambda x: (-x.mastery, x.name))[:5]
    return weakest, strongest


def _last_lesson(db: Session, *, user_id: int) -> LastLessonFacts | None:
    from app.models import LearningSession, Lesson

    row = db.execute(
        select(Unit.title, Lesson.title, LearningSession.total_questions, LearningSession.correct_count)
        .select_from(LearningSession)
        .join(Lesson, Lesson.id == LearningSession.lesson_id, isouter=True)
        .join(Unit, Unit.id == Lesson.unit_id, isouter=True)
        .where(
            LearningSession.user_id == user_id,
            LearningSession.lesson_id.is_not(None),
            LearningSession.ended_at.is_not(None),
        )
        .order_by(LearningSession.ended_at.desc())
        .limit(1)
    ).first()
    if row is None:
        return None
    total = int(row[2] or 0)
    correct = int(row[3] or 0)
    accuracy = (correct / total) if total > 0 else 0.0
    stars = 3 if accuracy >= 0.85 else 2 if accuracy >= 0.70 else 1
    return LastLessonFacts(
        unit_title=str(row[0] or "Unidade atual"),
        lesson_title=str(row[1] or "Licao atual"),
        stars=stars,
    )


def _wallet_facts(db: Session, *, user_id: int) -> WalletFacts:
    child = _resolve_primary_child(db, user_id=user_id)
    if child is None:
        return WalletFacts(total=0, spend=0, save=0, donate=0)
    wallet = db.scalar(
        select(Wallet).where(
            Wallet.tenant_id == child.tenant_id,
            Wallet.child_id == child.id,
        )
    )
    if wallet is None:
        return WalletFacts(total=0, spend=0, save=0, donate=0)
    txs = db.scalars(
        select(LedgerTransaction)
        .where(
            LedgerTransaction.tenant_id == child.tenant_id,
            LedgerTransaction.wallet_id == wallet.id,
        )
        .order_by(LedgerTransaction.created_at.asc(), LedgerTransaction.id.asc())
    ).all()
    pots = {"SPEND": 0, "SAVE": 0, "DONATE": 0}
    for tx in txs:
        signed = signed_amount_cents(tx.type, tx.amount_cents)
        split = extract_pot_split(tx.metadata_json)
        if split:
            for key in ("SPEND", "SAVE", "DONATE"):
                amount = int(split.get(key, 0))
                pots[key] += amount if signed >= 0 else -amount
            continue
        pots["SPEND"] += signed
    total = int(pots["SPEND"] + pots["SAVE"] + pots["DONATE"])
    return WalletFacts(
        total=total,
        spend=int(pots["SPEND"]),
        save=int(pots["SAVE"]),
        donate=int(pots["DONATE"]),
    )


def _energy_facts(db: Session, *, user_id: int) -> EnergyFacts:
    snapshot = get_energy_snapshot(db, user_id=user_id)
    return EnergyFacts(
        current=int(snapshot.energy),
        regen_eta=int(snapshot.seconds_until_next_energy),
    )


def build_axion_facts(db: Session, *, user_id: int) -> AxionFacts:
    streak_row = db.scalar(select(UserLearningStreak).where(UserLearningStreak.user_id == user_id))
    streak_days = int(streak_row.current_streak if streak_row is not None else 0)
    weakest, strongest = _skill_rankings(db, user_id=user_id)

    return AxionFacts(
        last_active_at=_last_active_at(db, user_id=user_id),
        streak_days=streak_days,
        weekly_completion_rate=_weekly_completion_rate(db, user_id=user_id),
        recent_approvals=_recent_approvals(db, user_id=user_id),
        due_reviews_count=_due_reviews_count(db, user_id=user_id),
        weakest_skills=weakest,
        strongest_skills=strongest,
        last_lesson=_last_lesson(db, user_id=user_id),
        wallet=_wallet_facts(db, user_id=user_id),
        energy=_energy_facts(db, user_id=user_id),
    )


def buildAxionFacts(db: Session, userId: int) -> dict[str, Any]:
    return build_axion_facts(db, user_id=userId).to_dict()

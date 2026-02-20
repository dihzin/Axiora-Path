from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    AxionDecisionLog,
    LearningSession,
    QuestionDifficulty,
    QuestionResult,
    UserBehaviorMetrics,
    UserLearningStreak,
    UserLearningStatus,
    UserQuestionHistory,
    UserSkillMastery,
)


@dataclass(slots=True)
class BehaviorMetricsSnapshot:
    user_id: int
    rhythm_score: float
    frustration_score: float
    confidence_score: float
    dropout_risk: float
    learning_momentum: float
    inputs: dict[str, float | int]
    updated_at: datetime


@dataclass(slots=True)
class AxionDecisionSnapshot:
    user_id: int
    decisions: list[str]
    message: str


def _clamp(value: float, *, min_value: float = 0.0, max_value: float = 1.0) -> float:
    return max(min_value, min(max_value, float(value)))


def _difficulty_factor(difficulty: QuestionDifficulty) -> float:
    if difficulty == QuestionDifficulty.EASY:
        return 0.8
    if difficulty == QuestionDifficulty.HARD:
        return 1.2
    return 1.0


def _sum_learning_xp(db: Session, *, user_id: int, start: datetime, end: datetime) -> int:
    value = db.scalar(
        select(func.coalesce(func.sum(LearningSession.xp_earned), 0)).where(
            LearningSession.user_id == user_id,
            LearningSession.ended_at.is_not(None),
            LearningSession.ended_at >= start,
            LearningSession.ended_at < end,
        )
    )
    return int(value or 0)


def _active_days_in_window(db: Session, *, user_id: int, start: datetime, end: datetime) -> int:
    rows = db.execute(
        select(LearningSession.ended_at).where(
            LearningSession.user_id == user_id,
            LearningSession.ended_at.is_not(None),
            LearningSession.ended_at >= start,
            LearningSession.ended_at < end,
        )
    ).all()
    return len({row[0].date() for row in rows if row[0] is not None})


def _recent_question_history(db: Session, *, user_id: int, limit: int) -> list[UserQuestionHistory]:
    return db.scalars(
        select(UserQuestionHistory)
        .where(UserQuestionHistory.user_id == user_id)
        .order_by(UserQuestionHistory.created_at.desc())
        .limit(limit)
    ).all()


def _max_consecutive_result(rows_desc: list[UserQuestionHistory], *, target: QuestionResult) -> int:
    max_streak = 0
    current = 0
    for row in reversed(rows_desc):
        if row.result == target:
            current += 1
            max_streak = max(max_streak, current)
        else:
            current = 0
    return max_streak


def _avg_mastery_delta_proxy(rows_desc: list[UserQuestionHistory]) -> float:
    if not rows_desc:
        return 0.0
    deltas: list[float] = []
    for row in rows_desc:
        factor = _difficulty_factor(row.difficulty_served)
        if row.result == QuestionResult.CORRECT:
            deltas.append(0.06 * factor)
        elif row.result == QuestionResult.WRONG:
            deltas.append(-0.08 * factor)
        else:
            deltas.append(-0.01)
    return float(sum(deltas) / max(1, len(deltas)))


def _session_abort_ratio(db: Session, *, user_id: int, now: datetime) -> float:
    window_start = now - timedelta(days=14)
    rows = db.execute(
        select(LearningSession.started_at, LearningSession.ended_at).where(
            LearningSession.user_id == user_id,
            LearningSession.started_at >= window_start,
        )
    ).all()
    if not rows:
        return 0.0
    abort_cutoff = now - timedelta(minutes=20)
    aborted = sum(1 for started_at, ended_at in rows if ended_at is None and started_at <= abort_cutoff)
    return aborted / max(1, len(rows))


def _inactivity_days(db: Session, *, user_id: int, now: datetime) -> int:
    last_session = db.scalar(
        select(func.max(LearningSession.ended_at)).where(
            LearningSession.user_id == user_id,
            LearningSession.ended_at.is_not(None),
        )
    )
    last_question = db.scalar(
        select(func.max(UserQuestionHistory.created_at)).where(
            UserQuestionHistory.user_id == user_id,
        )
    )
    last_activity = max(
        [item for item in [last_session, last_question] if item is not None],
        default=None,
    )
    if last_activity is None:
        return 30
    return max(0, (now.date() - last_activity.date()).days)


def _upsert_metrics(
    db: Session,
    *,
    user_id: int,
    rhythm_score: float,
    frustration_score: float,
    confidence_score: float,
    dropout_risk: float,
    learning_momentum: float,
) -> UserBehaviorMetrics:
    row = db.scalar(select(UserBehaviorMetrics).where(UserBehaviorMetrics.user_id == user_id))
    if row is None:
        row = UserBehaviorMetrics(
            user_id=user_id,
            rhythm_score=rhythm_score,
            frustration_score=frustration_score,
            confidence_score=confidence_score,
            dropout_risk=dropout_risk,
            learning_momentum=learning_momentum,
        )
        db.add(row)
        db.flush()
        return row
    row.rhythm_score = rhythm_score
    row.frustration_score = frustration_score
    row.confidence_score = confidence_score
    row.dropout_risk = dropout_risk
    row.learning_momentum = learning_momentum
    row.updated_at = datetime.now(UTC)
    db.flush()
    return row


def _log_decision(
    db: Session,
    *,
    user_id: int,
    decision_type: str,
    context: str,
    payload: dict[str, Any],
) -> None:
    db.add(
        AxionDecisionLog(
            user_id=user_id,
            decision_type=decision_type,
            context=context,
            payload=payload,
        )
    )
    db.flush()


def compute_behavior_metrics(db: Session, *, user_id: int) -> BehaviorMetricsSnapshot:
    now = datetime.now(UTC)
    start_7 = now - timedelta(days=7)
    start_prev_7 = now - timedelta(days=14)

    previous = db.scalar(select(UserBehaviorMetrics).where(UserBehaviorMetrics.user_id == user_id))

    xp_last_7 = _sum_learning_xp(db, user_id=user_id, start=start_7, end=now)
    xp_prev_7 = _sum_learning_xp(db, user_id=user_id, start=start_prev_7, end=start_7)
    active_days_7 = _active_days_in_window(db, user_id=user_id, start=start_7, end=now)

    streak_row = db.scalar(select(UserLearningStreak).where(UserLearningStreak.user_id == user_id))
    streak = int(streak_row.current_streak if streak_row is not None else 0)

    rows_20 = _recent_question_history(db, user_id=user_id, limit=20)
    rows_60 = _recent_question_history(db, user_id=user_id, limit=60)
    total_20 = len(rows_20)
    wrong_20 = sum(1 for row in rows_20 if row.result == QuestionResult.WRONG)
    correct_20 = sum(1 for row in rows_20 if row.result == QuestionResult.CORRECT)
    error_rate_20 = (wrong_20 / total_20) if total_20 > 0 else 0.0
    rapid_retries = sum(1 for row in rows_20 if row.result == QuestionResult.WRONG and int(row.time_ms) <= 4500)
    rapid_retry_ratio = (rapid_retries / max(1, wrong_20)) if wrong_20 > 0 else 0.0

    wrong_streak_norm = _clamp(_max_consecutive_result(rows_20, target=QuestionResult.WRONG) / 6.0)
    correct_streak_norm = _clamp(_max_consecutive_result(rows_20, target=QuestionResult.CORRECT) / 6.0)
    mastery_delta_proxy = _avg_mastery_delta_proxy(rows_60)
    mastery_delta_norm = _clamp((mastery_delta_proxy + 0.10) / 0.20)

    session_abort_ratio = _session_abort_ratio(db, user_id=user_id, now=now)
    inactivity_days = _inactivity_days(db, user_id=user_id, now=now)
    inactivity_norm = _clamp(inactivity_days / 10.0)

    consistency = _clamp(active_days_7 / 7.0)
    streak_norm = _clamp(streak / 7.0)
    rhythm_score = _clamp((0.55 * consistency) + (0.45 * streak_norm))

    frustration_score = _clamp(
        (0.40 * error_rate_20)
        + (0.25 * wrong_streak_norm)
        + (0.20 * rapid_retry_ratio)
        + (0.15 * session_abort_ratio)
    )

    confidence_score = _clamp(
        (0.45 * correct_streak_norm)
        + (0.35 * mastery_delta_norm)
        + (0.20 * (1.0 - frustration_score))
    )

    previous_rhythm = float(previous.rhythm_score) if previous is not None else rhythm_score
    previous_frustration = float(previous.frustration_score) if previous is not None else frustration_score
    rhythm_drop = _clamp(previous_rhythm - rhythm_score)
    frustration_rise = _clamp(frustration_score - previous_frustration)
    dropout_risk = _clamp(
        (0.45 * inactivity_norm)
        + (0.30 * rhythm_drop)
        + (0.25 * max(frustration_score, frustration_rise))
    )

    xp_trend = _clamp((xp_last_7 - xp_prev_7) / max(30.0, float(xp_prev_7 + 20)), min_value=-1.0, max_value=1.0)
    learning_momentum = round((0.7 * xp_trend) + (3.0 * mastery_delta_proxy), 4)

    row = _upsert_metrics(
        db,
        user_id=user_id,
        rhythm_score=rhythm_score,
        frustration_score=frustration_score,
        confidence_score=confidence_score,
        dropout_risk=dropout_risk,
        learning_momentum=learning_momentum,
    )

    inputs: dict[str, float | int] = {
        "xpLast7Days": xp_last_7,
        "xpPrevious7Days": xp_prev_7,
        "activeDays7": active_days_7,
        "errorRateLast20": round(error_rate_20, 4),
        "streak": streak,
        "inactivityDays": inactivity_days,
        "rapidRetryRatio": round(rapid_retry_ratio, 4),
        "sessionAbortRatio": round(session_abort_ratio, 4),
        "masteryDeltaProxy": round(mastery_delta_proxy, 4),
    }
    _log_decision(
        db,
        user_id=user_id,
        decision_type="BEHAVIOR_METRICS_COMPUTE",
        context="axion_intelligence_v2.computeBehaviorMetrics",
        payload={
            "inputs": inputs,
            "outputs": {
                "rhythmScore": round(rhythm_score, 4),
                "frustrationScore": round(frustration_score, 4),
                "confidenceScore": round(confidence_score, 4),
                "dropoutRisk": round(dropout_risk, 4),
                "learningMomentum": learning_momentum,
            },
        },
    )

    return BehaviorMetricsSnapshot(
        user_id=user_id,
        rhythm_score=float(row.rhythm_score),
        frustration_score=float(row.frustration_score),
        confidence_score=float(row.confidence_score),
        dropout_risk=float(row.dropout_risk),
        learning_momentum=float(row.learning_momentum),
        inputs=inputs,
        updated_at=row.updated_at,
    )


def get_behavior_metrics(db: Session, *, user_id: int) -> BehaviorMetricsSnapshot | None:
    row = db.scalar(select(UserBehaviorMetrics).where(UserBehaviorMetrics.user_id == user_id))
    if row is None:
        return None
    return BehaviorMetricsSnapshot(
        user_id=user_id,
        rhythm_score=float(row.rhythm_score),
        frustration_score=float(row.frustration_score),
        confidence_score=float(row.confidence_score),
        dropout_risk=float(row.dropout_risk),
        learning_momentum=float(row.learning_momentum),
        inputs={},
        updated_at=row.updated_at,
    )


def computeBehaviorMetrics(db: Session, userId: int) -> BehaviorMetricsSnapshot:
    return compute_behavior_metrics(db, user_id=userId)


def _push_decision(decisions: list[str], decision: str) -> None:
    if decision not in decisions:
        decisions.append(decision)


def _build_motivational_message(decisions: list[str]) -> str:
    if "SEND_MOTIVATIONAL_MESSAGE" in decisions and "REDUCE_DIFFICULTY" in decisions:
        return "Voce esta evoluindo. Vamos dar um passo por vez e continuar com confianca."
    if "INCREASE_DIFFICULTY" in decisions:
        return "Mandou muito bem! Vamos para um desafio novo com o Axion ao seu lado."
    if "TRIGGER_SURPRISE_REWARD" in decisions:
        return "Tem surpresa no mapa para te ajudar a voltar ao ritmo. Bora explorar."
    if "ACTIVATE_EASY_SESSION" in decisions:
        return "Vamos com uma sessao leve para aquecer e retomar o foco."
    if "SUGGEST_GAME_BREAK" in decisions:
        return "Pausa inteligente: um mini-jogo rapido e depois voce volta com energia."
    if "SUGGEST_REVIEW" in decisions:
        return "Que tal uma revisao curtinha para consolidar tudo?"
    return "Bom trabalho. O Axion preparou o melhor proximo passo para voce."


def generate_axion_decision(
    db: Session,
    *,
    user_id: int,
    context: str,
) -> AxionDecisionSnapshot:
    metrics = compute_behavior_metrics(db, user_id=user_id)
    decisions: list[str] = []

    frustration = float(metrics.frustration_score)
    confidence = float(metrics.confidence_score)
    dropout = float(metrics.dropout_risk)
    rhythm = float(metrics.rhythm_score)
    momentum = float(metrics.learning_momentum)
    inactivity_days = int(metrics.inputs.get("inactivityDays", 0))
    mastery_rising = momentum > 0.12

    if frustration > 0.7:
        _push_decision(decisions, "REDUCE_DIFFICULTY")
        _push_decision(decisions, "SEND_MOTIVATIONAL_MESSAGE")
        _push_decision(decisions, "ACTIVATE_EASY_SESSION")
    elif frustration >= 0.45:
        _push_decision(decisions, "SUGGEST_REVIEW")
        _push_decision(decisions, "SEND_MOTIVATIONAL_MESSAGE")

    if confidence > 0.8 and mastery_rising:
        _push_decision(decisions, "INCREASE_DIFFICULTY")
        _push_decision(decisions, "OFFER_BOOST")

    if dropout > 0.6:
        _push_decision(decisions, "TRIGGER_SURPRISE_REWARD")
        _push_decision(decisions, "INSERT_MICRO_MISSION")

    if rhythm < 0.35 and inactivity_days >= 2:
        _push_decision(decisions, "SUGGEST_GAME_BREAK")

    if not decisions:
        if confidence >= 0.65 and momentum > 0:
            _push_decision(decisions, "INCREASE_DIFFICULTY")
        else:
            _push_decision(decisions, "SUGGEST_REVIEW")

    message = _build_motivational_message(decisions)
    log_context = f"axion_intelligence_v2.generateAxionDecision:{context}"
    for index, decision in enumerate(decisions):
        _log_decision(
            db,
            user_id=user_id,
            decision_type=decision,
            context=log_context,
            payload={
                "order": index + 1,
                "message": message,
                "metrics": {
                    "rhythmScore": round(rhythm, 4),
                    "frustrationScore": round(frustration, 4),
                    "confidenceScore": round(confidence, 4),
                    "dropoutRisk": round(dropout, 4),
                    "learningMomentum": round(momentum, 4),
                },
            },
        )

    return AxionDecisionSnapshot(
        user_id=user_id,
        decisions=decisions,
        message=message,
    )


def generateAxionDecision(db: Session, userId: int, context: str) -> dict[str, list[str] | str]:
    snapshot = generate_axion_decision(db, user_id=userId, context=context)
    return {
        "decisions": snapshot.decisions,
        "message": snapshot.message,
    }


def get_recent_axion_decisions(
    db: Session,
    *,
    user_id: int,
    context: str,
    within_minutes: int = 180,
) -> list[str]:
    now = datetime.now(UTC)
    since = now - timedelta(minutes=max(1, within_minutes))
    context_prefix = f"axion_intelligence_v2.generateAxionDecision:{context}"
    rows = db.scalars(
        select(AxionDecisionLog)
        .where(
            AxionDecisionLog.user_id == user_id,
            AxionDecisionLog.context == context_prefix,
            AxionDecisionLog.created_at >= since,
        )
        .order_by(AxionDecisionLog.created_at.desc())
    ).all()

    ordered: list[str] = []
    for row in rows:
        decision = str(row.decision_type)
        if decision in {"BEHAVIOR_METRICS_COMPUTE", "AXION_MESSAGE"}:
            continue
        if decision not in ordered:
            ordered.append(decision)
    return ordered


def should_reduce_learning_energy_cost(db: Session, *, user_id: int) -> bool:
    metrics = get_behavior_metrics(db, user_id=user_id)
    if metrics is not None and float(metrics.frustration_score) > 0.7:
        return True
    recent = get_recent_axion_decisions(
        db,
        user_id=user_id,
        context="before_learning",
        within_minutes=240,
    )
    return ("REDUCE_DIFFICULTY" in recent) or ("ACTIVATE_EASY_SESSION" in recent)


def _activate_temporary_xp_boost(
    db: Session,
    *,
    user_id: int,
    multiplier: float,
    duration_hours: int,
) -> None:
    now = datetime.now(UTC)
    row = db.scalar(select(UserLearningStatus).where(UserLearningStatus.user_id == user_id))
    if row is None:
        row = UserLearningStatus(
            user_id=user_id,
            energy=5,
            last_energy_update=now,
            event_boost_multiplier=max(1.0, float(multiplier)),
            event_boost_expires_at=now + timedelta(hours=max(1, duration_hours)),
        )
        db.add(row)
        db.flush()
        return
    row.event_boost_multiplier = max(float(row.event_boost_multiplier), max(1.0, float(multiplier)))
    row.event_boost_expires_at = now + timedelta(hours=max(1, duration_hours))
    db.flush()


def apply_axion_decisions(
    db: Session,
    *,
    user_id: int,
    context: str,
    tenant_id: int | None = None,
) -> AxionDecisionSnapshot:
    snapshot = generate_axion_decision(db, user_id=user_id, context=context)

    if "OFFER_BOOST" in snapshot.decisions:
        _activate_temporary_xp_boost(
            db,
            user_id=user_id,
            multiplier=1.20,
            duration_hours=2,
        )

    if "INSERT_MICRO_MISSION" in snapshot.decisions:
        from app.services.learning_retention import inject_axion_micro_mission

        metrics = get_behavior_metrics(db, user_id=user_id)
        mission_kind: str | None = None
        if metrics is not None:
            frustration = float(metrics.frustration_score)
            confidence = float(metrics.confidence_score)
            dropout = float(metrics.dropout_risk)
            if frustration >= 0.7:
                mission_kind = "EASY_WIN"
            elif dropout >= 0.65:
                mission_kind = "QUICK_REVIEW"
            elif confidence >= 0.75:
                mission_kind = "WEAKEST_SKILL_BURST"
            elif context == "before_game":
                mission_kind = "MINI_GAME"

        inject_axion_micro_mission(
            db,
            user_id=user_id,
            tenant_id=tenant_id,
            mission_kind=mission_kind,
        )

    return snapshot

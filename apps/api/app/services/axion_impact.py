from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    AxionDecision,
    AxionDecisionContext,
    AxionOutcomeMetric,
    AxionOutcomeMetricType,
    GameSession,
    LearningSession,
    QuestionResult,
    UserCalendarActivity,
    UserQuestionHistory,
)


def _extract_score(decision: AxionDecision, score_key: str) -> float | None:
    debug = decision.debug if isinstance(decision.debug, dict) else {}
    scores = debug.get("scores") if isinstance(debug.get("scores"), dict) else {}
    raw = scores.get(score_key)
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def _decision_actions(decision: AxionDecision) -> list[dict[str, Any]]:
    if isinstance(decision.decisions, list):
        return [item for item in decision.decisions if isinstance(item, dict)]
    return []


def _has_action(decision: AxionDecision, action_type: str) -> bool:
    target = action_type.strip().upper()
    return any(str(item.get("type", "")).strip().upper() == target for item in _decision_actions(decision))


def _xp_in_window(db: Session, *, user_id: int, start: datetime, end: datetime) -> float:
    learning_xp = float(
        db.scalar(
            select(func.coalesce(func.sum(LearningSession.xp_earned), 0)).where(
                LearningSession.user_id == user_id,
                LearningSession.ended_at.is_not(None),
                LearningSession.ended_at >= start,
                LearningSession.ended_at < end,
            )
        )
        or 0
    )
    game_xp = float(
        db.scalar(
            select(func.coalesce(func.sum(GameSession.xp_earned), 0)).where(
                GameSession.user_id == user_id,
                GameSession.created_at >= start,
                GameSession.created_at < end,
            )
        )
        or 0
    )
    return learning_xp + game_xp


def _sessions_completed_in_window(db: Session, *, user_id: int, start: datetime, end: datetime) -> float:
    count = db.scalar(
        select(func.count(LearningSession.id)).where(
            LearningSession.user_id == user_id,
            LearningSession.ended_at.is_not(None),
            LearningSession.ended_at >= start,
            LearningSession.ended_at < end,
        )
    )
    return float(count or 0)


def _streak_proxy_at(db: Session, *, user_id: int, at: datetime) -> float:
    rows = db.scalars(
        select(UserCalendarActivity.date).where(
            UserCalendarActivity.user_id == user_id,
            UserCalendarActivity.date <= at.date(),
            UserCalendarActivity.streak_maintained.is_(True),
        )
    ).all()
    if not rows:
        return 0.0
    dates = {row for row in rows if isinstance(row, date)}
    current = at.date()
    streak = 0
    while current in dates:
        streak += 1
        current = current - timedelta(days=1)
    return float(streak)


def _reviews_done_in_window(db: Session, *, user_id: int, start: datetime, end: datetime) -> float:
    count = db.scalar(
        select(func.count(UserQuestionHistory.id)).where(
            UserQuestionHistory.user_id == user_id,
            UserQuestionHistory.created_at >= start,
            UserQuestionHistory.created_at < end,
            UserQuestionHistory.result == QuestionResult.CORRECT,
        )
    )
    return float(count or 0)


def _outcome_exists(
    db: Session,
    *,
    decision_id: str,
    metric_type: AxionOutcomeMetricType,
    measured_at: datetime,
) -> bool:
    row = db.scalar(
        select(AxionOutcomeMetric.id).where(
            AxionOutcomeMetric.decision_id == decision_id,
            AxionOutcomeMetric.metric_type == metric_type,
            AxionOutcomeMetric.measured_at == measured_at,
        )
    )
    return row is not None


def _write_metric(
    db: Session,
    *,
    user_id: int,
    decision_id: str,
    metric_type: AxionOutcomeMetricType,
    value_before: float,
    value_after: float,
    measured_at: datetime,
) -> None:
    if _outcome_exists(db, decision_id=decision_id, metric_type=metric_type, measured_at=measured_at):
        return
    db.add(
        AxionOutcomeMetric(
            user_id=user_id,
            decision_id=decision_id,
            metric_type=metric_type,
            value_before=value_before,
            value_after=value_after,
            delta=(value_after - value_before),
            measured_at=measured_at,
        )
    )


def sync_outcome_metrics_for_user(
    db: Session,
    *,
    user_id: int,
    lookback_days: int = 30,
) -> dict[str, int]:
    now = datetime.now(UTC)
    start = now - timedelta(days=max(1, int(lookback_days)))
    decisions = db.scalars(
        select(AxionDecision)
        .where(
            AxionDecision.user_id == user_id,
            AxionDecision.created_at >= start,
        )
        .order_by(AxionDecision.created_at.asc())
    ).all()

    created = 0
    considered = 0
    for decision in decisions:
        decision_time = decision.created_at
        for window_days in (1, 7):
            measured_at = decision_time + timedelta(days=window_days)
            if measured_at > now:
                continue
            considered += 1
            before_start = decision_time - timedelta(days=7)
            after_start = measured_at - timedelta(days=7)

            xp_before = _xp_in_window(db, user_id=user_id, start=before_start, end=decision_time)
            xp_after = _xp_in_window(db, user_id=user_id, start=after_start, end=measured_at)
            _write_metric(
                db,
                user_id=user_id,
                decision_id=decision.id,
                metric_type=AxionOutcomeMetricType.XP_GAIN,
                value_before=xp_before,
                value_after=xp_after,
                measured_at=measured_at,
            )

            sess_before = _sessions_completed_in_window(db, user_id=user_id, start=before_start, end=decision_time)
            sess_after = _sessions_completed_in_window(db, user_id=user_id, start=after_start, end=measured_at)
            _write_metric(
                db,
                user_id=user_id,
                decision_id=decision.id,
                metric_type=AxionOutcomeMetricType.SESSION_COMPLETED,
                value_before=sess_before,
                value_after=sess_after,
                measured_at=measured_at,
            )

            streak_before = _streak_proxy_at(db, user_id=user_id, at=decision_time)
            streak_after = _streak_proxy_at(db, user_id=user_id, at=measured_at)
            _write_metric(
                db,
                user_id=user_id,
                decision_id=decision.id,
                metric_type=AxionOutcomeMetricType.STREAK_MAINTAINED,
                value_before=streak_before,
                value_after=streak_after,
                measured_at=measured_at,
            )

            review_before = 0.0
            review_after = _reviews_done_in_window(db, user_id=user_id, start=decision_time, end=measured_at)
            _write_metric(
                db,
                user_id=user_id,
                decision_id=decision.id,
                metric_type=AxionOutcomeMetricType.REVIEW_DONE,
                value_before=review_before,
                value_after=review_after,
                measured_at=measured_at,
            )
            created += 4
    return {"decisions_considered": considered, "metrics_created_estimate": created}


@dataclass(slots=True)
class AxionImpactSummary:
    decisions_total: int
    improvement_rate_percent: float
    avg_xp_delta_after_boost: float
    avg_frustration_delta_after_difficulty_cap: float
    avg_dropout_risk_delta: float
    mastery_growth_proxy: float


def compute_axion_impact(db: Session, *, user_id: int, days: int) -> AxionImpactSummary:
    safe_days = max(1, int(days))
    sync_outcome_metrics_for_user(db, user_id=user_id, lookback_days=max(14, safe_days))
    now = datetime.now(UTC)
    start = now - timedelta(days=safe_days)

    decisions = db.scalars(
        select(AxionDecision)
        .where(
            AxionDecision.user_id == user_id,
            AxionDecision.created_at >= start,
        )
        .order_by(AxionDecision.created_at.asc())
    ).all()
    if not decisions:
        return AxionImpactSummary(
            decisions_total=0,
            improvement_rate_percent=0.0,
            avg_xp_delta_after_boost=0.0,
            avg_frustration_delta_after_difficulty_cap=0.0,
            avg_dropout_risk_delta=0.0,
            mastery_growth_proxy=0.0,
        )

    decision_ids = [item.id for item in decisions]
    metrics = db.scalars(
        select(AxionOutcomeMetric).where(
            AxionOutcomeMetric.user_id == user_id,
            AxionOutcomeMetric.decision_id.in_(decision_ids),
            AxionOutcomeMetric.measured_at >= start,
        )
    ).all()
    by_decision: dict[str, list[AxionOutcomeMetric]] = {}
    for metric in metrics:
        by_decision.setdefault(metric.decision_id, []).append(metric)

    improved = 0
    for decision in decisions:
        rows = by_decision.get(decision.id, [])
        xp_positive = any(row.metric_type == AxionOutcomeMetricType.XP_GAIN and float(row.delta) > 0 for row in rows)
        session_positive = any(row.metric_type == AxionOutcomeMetricType.SESSION_COMPLETED and float(row.delta) > 0 for row in rows)
        streak_maintained = any(row.metric_type == AxionOutcomeMetricType.STREAK_MAINTAINED and float(row.value_after) >= float(row.value_before) for row in rows)
        review_done = any(row.metric_type == AxionOutcomeMetricType.REVIEW_DONE and float(row.value_after) > 0 for row in rows)
        signals = sum(1 for flag in [xp_positive, session_positive, streak_maintained, review_done] if flag)
        if signals >= 2:
            improved += 1

    boost_deltas: list[float] = []
    frustration_deltas: list[float] = []
    dropout_deltas: list[float] = []
    mastery_deltas: list[float] = []
    for index, decision in enumerate(decisions):
        next_decision = decisions[index + 1] if index + 1 < len(decisions) else None
        if next_decision is None:
            continue
        this_fr = _extract_score(decision, "frustration")
        next_fr = _extract_score(next_decision, "frustration")
        if this_fr is not None and next_fr is not None:
            frustration_deltas.append(this_fr - next_fr)
        this_drop = _extract_score(decision, "dropoutRisk")
        next_drop = _extract_score(next_decision, "dropoutRisk")
        if this_drop is not None and next_drop is not None:
            dropout_deltas.append(this_drop - next_drop)

        this_facts = decision.debug.get("facts") if isinstance(decision.debug, dict) and isinstance(decision.debug.get("facts"), dict) else {}
        next_facts = next_decision.debug.get("facts") if isinstance(next_decision.debug, dict) and isinstance(next_decision.debug.get("facts"), dict) else {}
        this_mastery = []
        next_mastery = []
        for item in this_facts.get("weakestSkills", []) if isinstance(this_facts.get("weakestSkills"), list) else []:
            if isinstance(item, dict):
                try:
                    this_mastery.append(float(item.get("mastery", 0)))
                except (TypeError, ValueError):
                    pass
        for item in next_facts.get("weakestSkills", []) if isinstance(next_facts.get("weakestSkills"), list) else []:
            if isinstance(item, dict):
                try:
                    next_mastery.append(float(item.get("mastery", 0)))
                except (TypeError, ValueError):
                    pass
        if this_mastery and next_mastery:
            mastery_deltas.append((sum(next_mastery) / len(next_mastery)) - (sum(this_mastery) / len(this_mastery)))

        if _has_action(decision, "OFFER_BOOST"):
            for row in by_decision.get(decision.id, []):
                if row.metric_type == AxionOutcomeMetricType.XP_GAIN:
                    boost_deltas.append(float(row.delta))

    return AxionImpactSummary(
        decisions_total=len(decisions),
        improvement_rate_percent=round((improved / max(1, len(decisions))) * 100, 2),
        avg_xp_delta_after_boost=round((sum(boost_deltas) / len(boost_deltas)) if boost_deltas else 0.0, 2),
        avg_frustration_delta_after_difficulty_cap=round((sum(frustration_deltas) / len(frustration_deltas)) if frustration_deltas else 0.0, 4),
        avg_dropout_risk_delta=round((sum(dropout_deltas) / len(dropout_deltas)) if dropout_deltas else 0.0, 4),
        mastery_growth_proxy=round((sum(mastery_deltas) / len(mastery_deltas)) if mastery_deltas else 0.0, 4),
    )


def computeAxionImpact(db: Session, userId: int, days: int) -> dict[str, float | int]:
    summary = compute_axion_impact(db, user_id=userId, days=days)
    return {
        "decisionsTotal": summary.decisions_total,
        "improvementRatePercent": summary.improvement_rate_percent,
        "avgXpDeltaAfterBoost": summary.avg_xp_delta_after_boost,
        "avgFrustrationDeltaAfterDifficultyCap": summary.avg_frustration_delta_after_difficulty_cap,
        "avgDropoutRiskDelta": summary.avg_dropout_risk_delta,
        "masteryGrowthProxy": summary.mastery_growth_proxy,
    }


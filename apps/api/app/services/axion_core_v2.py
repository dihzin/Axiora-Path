from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    AxionDecision,
    AxionDecisionContext,
    AxionPolicyRule,
    AxionRiskStatus,
    AxionSignal,
    AxionSignalType,
    AxionUserState,
    GameSession,
    LearningSession,
    Membership,
    QuestionResult,
    TaskLog,
    TaskLogStatus,
    UserLearningStreak,
    UserQuestionHistory,
    UserSkillMastery,
)
from app.services.axion_facts import build_axion_facts
from app.services.axion_persona import resolve_user_persona


@dataclass(slots=True)
class AxionStateSnapshot:
    user_id: int
    rhythm_score: float
    frustration_score: float
    confidence_score: float
    dropout_risk_score: float
    learning_momentum: float
    last_active_at: datetime | None
    updated_at: datetime
    debug: dict[str, float | int]


@dataclass(slots=True)
class AxionDecisionSnapshot:
    user_id: int
    context: AxionDecisionContext
    actions: list[dict[str, Any]]
    primary_message_key: str | None
    debug: dict[str, Any]
    created_at: datetime


def _clamp(value: float, *, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, float(value)))


def _difficulty_factor_name(result_ratio: float) -> str:
    if result_ratio >= 0.75:
        return "strong"
    if result_ratio >= 0.45:
        return "balanced"
    return "gentle"


def record_axion_signal(
    db: Session,
    *,
    user_id: int,
    signal_type: AxionSignalType,
    payload: dict[str, Any] | None = None,
) -> AxionSignal:
    row = AxionSignal(
        user_id=user_id,
        type=signal_type,
        payload=payload or {},
    )
    db.add(row)
    db.flush()
    return row


def _active_days_learning_14(db: Session, *, user_id: int, start: datetime, end: datetime) -> tuple[int, int]:
    rows = db.execute(
        select(LearningSession.ended_at).where(
            LearningSession.user_id == user_id,
            LearningSession.ended_at.is_not(None),
            LearningSession.ended_at >= start,
            LearningSession.ended_at < end,
        )
    ).all()
    active_days = len({row[0].date() for row in rows if row[0] is not None})
    return active_days, len(rows)


def _xp_last_window(db: Session, *, user_id: int, start: datetime, end: datetime) -> int:
    learning_xp = int(
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
    game_xp = int(
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


def _max_consecutive(history_desc: list[UserQuestionHistory], *, target: QuestionResult) -> int:
    longest = 0
    current = 0
    for row in reversed(history_desc):
        if row.result == target:
            current += 1
            longest = max(longest, current)
        else:
            current = 0
    return longest


def _question_history_stats(
    db: Session,
    *,
    user_id: int,
    limit: int = 40,
) -> dict[str, float]:
    rows = db.scalars(
        select(UserQuestionHistory)
        .where(UserQuestionHistory.user_id == user_id)
        .order_by(UserQuestionHistory.created_at.desc())
        .limit(limit)
    ).all()
    if not rows:
        return {
            "wrong_rate": 0.0,
            "wrong_streak_norm": 0.0,
            "correct_streak_norm": 0.0,
            "slowdown_ratio": 0.0,
        }

    wrong = sum(1 for row in rows if row.result == QuestionResult.WRONG)
    wrong_rate = wrong / max(1, len(rows))
    wrong_streak_norm = _clamp(_max_consecutive(rows, target=QuestionResult.WRONG) / 6.0)
    correct_streak_norm = _clamp(_max_consecutive(rows, target=QuestionResult.CORRECT) / 6.0)
    slowdowns = sum(1 for row in rows if int(row.time_ms) >= 12000)
    slowdown_ratio = slowdowns / max(1, len(rows))
    return {
        "wrong_rate": wrong_rate,
        "wrong_streak_norm": wrong_streak_norm,
        "correct_streak_norm": correct_streak_norm,
        "slowdown_ratio": slowdown_ratio,
    }


def _session_abort_ratio(db: Session, *, user_id: int, now: datetime) -> float:
    start = now - timedelta(days=14)
    rows = db.execute(
        select(LearningSession.started_at, LearningSession.ended_at).where(
            LearningSession.user_id == user_id,
            LearningSession.started_at >= start,
        )
    ).all()
    if not rows:
        return 0.0
    cutoff = now - timedelta(minutes=20)
    aborted = sum(1 for started_at, ended_at in rows if ended_at is None and started_at <= cutoff)
    return aborted / max(1, len(rows))


def _mastery_velocity(db: Session, *, user_id: int, now: datetime) -> float:
    cur_start = now - timedelta(days=14)
    prev_start = now - timedelta(days=28)
    current_avg = float(
        db.scalar(
            select(func.avg(UserSkillMastery.mastery)).where(
                UserSkillMastery.user_id == user_id,
                UserSkillMastery.updated_at >= cur_start,
                UserSkillMastery.updated_at < now,
            )
        )
        or 0.0
    )
    previous_avg = float(
        db.scalar(
            select(func.avg(UserSkillMastery.mastery)).where(
                UserSkillMastery.user_id == user_id,
                UserSkillMastery.updated_at >= prev_start,
                UserSkillMastery.updated_at < cur_start,
            )
        )
        or 0.0
    )
    return current_avg - previous_avg


def _task_rates(db: Session, *, user_id: int) -> tuple[float, float]:
    tenant_ids = db.scalars(select(Membership.tenant_id).where(Membership.user_id == user_id)).all()
    if not tenant_ids:
        return 0.5, 0.0
    start_date = date.today() - timedelta(days=14)
    rows = db.execute(
        select(TaskLog.status).where(
            TaskLog.tenant_id.in_(tenant_ids),
            TaskLog.date >= start_date,
        )
    ).all()
    if not rows:
        return 0.5, 0.0
    approved = sum(1 for (status,) in rows if status == TaskLogStatus.APPROVED)
    rejected = sum(1 for (status,) in rows if status == TaskLogStatus.REJECTED)
    total = len(rows)
    return approved / max(1, total), rejected / max(1, total)


def _last_active_at(db: Session, *, user_id: int) -> datetime | None:
    last_learning = db.scalar(
        select(func.max(LearningSession.ended_at)).where(
            LearningSession.user_id == user_id,
            LearningSession.ended_at.is_not(None),
        )
    )
    last_game = db.scalar(select(func.max(GameSession.created_at)).where(GameSession.user_id == user_id))
    last_question = db.scalar(select(func.max(UserQuestionHistory.created_at)).where(UserQuestionHistory.user_id == user_id))
    candidates = [item for item in [last_learning, last_game, last_question] if item is not None]
    if not candidates:
        return None
    return max(candidates)


def _upsert_state(
    db: Session,
    *,
    user_id: int,
    rhythm_score: float,
    frustration_score: float,
    confidence_score: float,
    dropout_risk_score: float,
    learning_momentum: float,
    risk_status: AxionRiskStatus,
    last_active_at: datetime | None,
) -> AxionUserState:
    row = db.scalar(select(AxionUserState).where(AxionUserState.user_id == user_id))
    if row is None:
        row = AxionUserState(
            user_id=user_id,
            rhythm_score=rhythm_score,
            frustration_score=frustration_score,
            confidence_score=confidence_score,
            dropout_risk_score=dropout_risk_score,
            learning_momentum=learning_momentum,
            risk_status=risk_status,
            last_active_at=last_active_at,
        )
        db.add(row)
        db.flush()
        return row
    row.rhythm_score = rhythm_score
    row.frustration_score = frustration_score
    row.confidence_score = confidence_score
    row.dropout_risk_score = dropout_risk_score
    row.learning_momentum = learning_momentum
    row.risk_status = risk_status
    row.last_active_at = last_active_at
    row.updated_at = datetime.now(UTC)
    db.flush()
    return row


def compute_axion_state(
    db: Session,
    *,
    user_id: int,
) -> AxionStateSnapshot:
    now = datetime.now(UTC)
    start_7 = now - timedelta(days=7)
    start_14 = now - timedelta(days=14)
    start_prev_7 = now - timedelta(days=14)

    previous = db.scalar(select(AxionUserState).where(AxionUserState.user_id == user_id))

    xp_last_7 = _xp_last_window(db, user_id=user_id, start=start_7, end=now)
    xp_prev_7 = _xp_last_window(db, user_id=user_id, start=start_prev_7, end=start_7)
    active_days_14, sessions_14 = _active_days_learning_14(db, user_id=user_id, start=start_14, end=now)

    streak_row = db.scalar(select(UserLearningStreak).where(UserLearningStreak.user_id == user_id))
    streak = int(streak_row.current_streak if streak_row is not None else 0)

    history_stats = _question_history_stats(db, user_id=user_id, limit=40)
    abort_ratio = _session_abort_ratio(db, user_id=user_id, now=now)
    mastery_velocity = _mastery_velocity(db, user_id=user_id, now=now)
    task_approval_rate, task_rejection_rate = _task_rates(db, user_id=user_id)

    last_active_at = _last_active_at(db, user_id=user_id)
    inactivity_days = 30 if last_active_at is None else max(0, (now.date() - last_active_at.date()).days)
    inactivity_norm = _clamp(inactivity_days / 10.0)

    consistency = _clamp(active_days_14 / 14.0)
    streak_norm = _clamp(streak / 10.0)
    volume_norm = _clamp(sessions_14 / 14.0)
    rhythm_score = _clamp((0.45 * consistency) + (0.35 * streak_norm) + (0.20 * volume_norm))

    frustration_score = _clamp(
        (0.35 * float(history_stats["wrong_rate"]))
        + (0.25 * float(history_stats["wrong_streak_norm"]))
        + (0.20 * abort_ratio)
        + (0.20 * float(history_stats["slowdown_ratio"]))
    )

    mastery_growth_norm = _clamp((mastery_velocity + 0.15) / 0.30)
    confidence_score = _clamp(
        (0.40 * mastery_growth_norm)
        + (0.35 * float(history_stats["correct_streak_norm"]))
        + (0.25 * (1.0 - frustration_score))
    )

    prev_rhythm = float(previous.rhythm_score) if previous is not None else rhythm_score
    prev_frustration = float(previous.frustration_score) if previous is not None else frustration_score
    prev_dropout_risk = float(previous.dropout_risk_score) if previous is not None else 0.0
    rhythm_drop = _clamp(prev_rhythm - rhythm_score)
    frustration_rise = _clamp(frustration_score - prev_frustration)
    dropout_risk_score = _clamp(
        (0.40 * inactivity_norm)
        + (0.25 * rhythm_drop)
        + (0.20 * frustration_rise)
        + (0.15 * task_rejection_rate)
    )

    xp_trend = _clamp((xp_last_7 - xp_prev_7) / max(30.0, float(xp_prev_7 + 20)), low=-1.0, high=1.0)
    learning_momentum = round((0.60 * xp_trend) + (2.20 * mastery_velocity) + (0.20 * (task_approval_rate - task_rejection_rate)), 4)

    streak_broken = bool(
        streak_row is not None
        and int(streak_row.longest_streak) > 0
        and int(streak_row.current_streak) == 0
        and (
            streak_row.last_lesson_date is None
            or (now.date() - streak_row.last_lesson_date).days >= 1
        )
    )
    frustration_rising = frustration_rise >= 0.08
    rhythm_falling = rhythm_drop >= 0.08
    inactivity_high = inactivity_days > 3
    is_at_risk = bool(inactivity_high and frustration_rising and rhythm_falling and streak_broken)
    risk_status = AxionRiskStatus.AT_RISK if is_at_risk else AxionRiskStatus.HEALTHY

    state = _upsert_state(
        db,
        user_id=user_id,
        rhythm_score=rhythm_score,
        frustration_score=frustration_score,
        confidence_score=confidence_score,
        dropout_risk_score=dropout_risk_score,
        learning_momentum=learning_momentum,
        risk_status=risk_status,
        last_active_at=last_active_at,
    )
    return AxionStateSnapshot(
        user_id=user_id,
        rhythm_score=float(state.rhythm_score),
        frustration_score=float(state.frustration_score),
        confidence_score=float(state.confidence_score),
        dropout_risk_score=float(state.dropout_risk_score),
        learning_momentum=float(state.learning_momentum),
        last_active_at=state.last_active_at,
        updated_at=state.updated_at,
        debug={
            "xpLast7Days": xp_last_7,
            "xpPrevious7Days": xp_prev_7,
            "activeDays14": active_days_14,
            "sessions14": sessions_14,
            "streak": streak,
            "inactivityDays": inactivity_days,
            "taskApprovalRate": round(task_approval_rate, 4),
            "taskRejectionRate": round(task_rejection_rate, 4),
            "abortRatio": round(abort_ratio, 4),
            "masteryVelocity": round(mastery_velocity, 4),
            "dropoutRiskDelta": round(float(dropout_risk_score - prev_dropout_risk), 4),
            "frustrationRise": round(float(frustration_rise), 4),
            "rhythmDrop": round(float(rhythm_drop), 4),
            "streakBroken": int(streak_broken),
            "atRisk": int(is_at_risk),
        },
    )


def _is_early_dropout_risk(state: AxionStateSnapshot) -> bool:
    debug = state.debug if isinstance(state.debug, dict) else {}
    inactivity = int(debug.get("inactivityDays", 0))
    frustration_rise = float(debug.get("frustrationRise", 0.0))
    rhythm_drop = float(debug.get("rhythmDrop", 0.0))
    streak_broken = bool(int(debug.get("streakBroken", 0) or 0))
    return bool(
        inactivity > 3
        and frustration_rise >= 0.08
        and rhythm_drop >= 0.08
        and streak_broken
    )


def _append_early_dropout_actions(actions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    protective = [
        {
            "type": "ADJUST_DIFFICULTY",
            "params": {
                "mode": "down",
                "difficultyCap": "MEDIUM",
                "easyRatioBoost": 0.25,
                "hardRatioBoost": -0.15,
                "ttlMinutes": 240,
                "reason": "early_dropout_warning",
            },
        },
        {
            "type": "SURPRISE_REWARD",
            "params": {
                "coins": 8,
                "reason": "welcome_back_reward",
                "ttlMinutes": 30,
            },
        },
        {
            "type": "OFFER_BOOST",
            "params": {
                "xpMultiplier": 1.30,
                "durationHours": 24,
                "reason": "reduce_xp_grind_pressure",
            },
        },
        {
            "type": "NUDGE_PARENT",
            "params": {
                "reason": "early_dropout_warning",
                "tone": "friendly",
                "suggestion": "Apoio leve hoje: uma sessao curta com celebracao ao final.",
            },
        },
    ]
    seen = {str(item.get("type", "")).strip().upper() for item in actions if isinstance(item, dict)}
    prefix = [item for item in protective if str(item.get("type", "")).upper() not in seen]
    return [*prefix, *actions]


def _to_float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _matches_operator(actual: Any, expression: dict[str, Any]) -> bool:
    for operator, expected in expression.items():
        if operator == "gt":
            actual_n = _to_float(actual)
            expected_n = _to_float(expected)
            if actual_n is None or expected_n is None or not (actual_n > expected_n):
                return False
        elif operator == "gte":
            actual_n = _to_float(actual)
            expected_n = _to_float(expected)
            if actual_n is None or expected_n is None or not (actual_n >= expected_n):
                return False
        elif operator == "lt":
            actual_n = _to_float(actual)
            expected_n = _to_float(expected)
            if actual_n is None or expected_n is None or not (actual_n < expected_n):
                return False
        elif operator == "lte":
            actual_n = _to_float(actual)
            expected_n = _to_float(expected)
            if actual_n is None or expected_n is None or not (actual_n <= expected_n):
                return False
        elif operator == "eq":
            if actual != expected:
                return False
        elif operator == "neq":
            if actual == expected:
                return False
        elif operator == "in":
            if not isinstance(expected, list) or actual not in expected:
                return False
        elif operator == "notIn":
            if isinstance(expected, list) and actual in expected:
                return False
        else:
            return False
    return True


def _state_lookup(
    state: AxionStateSnapshot,
    *,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    base: dict[str, Any] = {
        "rhythmScore": state.rhythm_score,
        "frustrationScore": state.frustration_score,
        "confidenceScore": state.confidence_score,
        "dropoutRiskScore": state.dropout_risk_score,
        "learningMomentum": state.learning_momentum,
    }
    if extra:
        base.update(extra)
    return base


def evaluate_policies(
    db: Session,
    *,
    state: AxionStateSnapshot,
    context: AxionDecisionContext,
    extra: dict[str, Any] | None = None,
    user_id: int | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    persona_resolution = None
    if user_id is not None:
        persona_resolution = resolve_user_persona(
            db,
            user_id=user_id,
            state=state,
            auto_switch=True,
        )
    reward_bias = float(persona_resolution.persona.reward_bias) if persona_resolution is not None else 1.0
    challenge_bias = float(persona_resolution.persona.challenge_bias) if persona_resolution is not None else 1.0

    rules = db.scalars(
        select(AxionPolicyRule)
        .where(
            AxionPolicyRule.enabled.is_(True),
            AxionPolicyRule.context == context,
        )
        .order_by(AxionPolicyRule.priority.desc(), AxionPolicyRule.id.asc())
    ).all()
    lookup = _state_lookup(state, extra=extra)
    actions: list[dict[str, Any]] = []
    matched_rules: list[dict[str, Any]] = []
    seen_types: set[str] = set()

    for rule in rules:
        condition = rule.condition if isinstance(rule.condition, dict) else {}
        matched = True
        for key, expression in condition.items():
            if key not in lookup:
                matched = False
                break
            if isinstance(expression, dict):
                if not _matches_operator(lookup[key], expression):
                    matched = False
                    break
            else:
                if lookup[key] != expression:
                    matched = False
                    break
        if not matched:
            continue

        rule_actions = rule.actions if isinstance(rule.actions, list) else []
        score = float(rule.priority)
        for item in rule_actions:
            if not isinstance(item, dict):
                continue
            action_type = str(item.get("type", "")).strip().upper()
            if action_type in {"OFFER_BOOST", "SURPRISE_REWARD"}:
                score *= max(0.5, reward_bias)
            if action_type in {"ADJUST_DIFFICULTY", "TRIGGER_REVIEW"}:
                score *= max(0.5, challenge_bias)

        matched_rules.append(
            {
                "id": rule.id,
                "name": rule.name,
                "priority": rule.priority,
                "weightedPriority": round(score, 4),
                "actions": rule_actions,
            }
        )
    matched_rules.sort(key=lambda item: (float(item.get("weightedPriority", 0)), int(item.get("id", 0))), reverse=True)

    for matched in matched_rules:
        for action in matched.get("actions", []):
            if not isinstance(action, dict):
                continue
            action_type = str(action.get("type", "")).strip()
            if not action_type or action_type in seen_types:
                continue
            upper = action_type.upper()
            if user_id is not None and upper in {"OFFER_BOOST", "SURPRISE_REWARD"}:
                cooldown_hours = 8 if reward_bias >= 1.1 else 14 if reward_bias >= 0.95 else 24
                cutoff = datetime.now(UTC) - timedelta(hours=cooldown_hours)
                recent = db.scalars(
                    select(AxionDecision)
                    .where(
                        AxionDecision.user_id == user_id,
                        AxionDecision.created_at >= cutoff,
                    )
                    .order_by(AxionDecision.created_at.desc())
                    .limit(25)
                ).all()
                had_recent_reward = any(
                    any(
                        str(item.get("type", "")).strip().upper() in {"OFFER_BOOST", "SURPRISE_REWARD"}
                        for item in (row.decisions if isinstance(row.decisions, list) else [])
                        if isinstance(item, dict)
                    )
                    for row in recent
                )
                if had_recent_reward and reward_bias < 1.2:
                    continue
            seen_types.add(action_type)
            params = {key: value for key, value in action.items() if key != "type"}
            params.setdefault("ruleId", matched.get("id"))
            actions.append({"type": action_type, "params": params})

    if _is_early_dropout_risk(state):
        actions = _append_early_dropout_actions(actions)

    return actions, matched_rules


def evaluatePolicies(
    state: AxionStateSnapshot,
    context: AxionDecisionContext,
    db: Session,
    user_id: int | None = None,
) -> list[dict[str, Any]]:
    actions, _ = evaluate_policies(
        db,
        state=state,
        context=context,
        user_id=user_id,
    )
    return actions


def decide_axion_actions(
    db: Session,
    *,
    user_id: int,
    context: AxionDecisionContext,
) -> AxionDecisionSnapshot:
    state = compute_axion_state(db, user_id=user_id)
    facts = build_axion_facts(db, user_id=user_id)
    due_reviews = int(facts.due_reviews_count)
    actions, matched_rules = evaluate_policies(
        db,
        state=state,
        context=context,
        extra={
            "dueReviews": due_reviews,
            "weeklyCompletionRate": float(facts.weekly_completion_rate),
            "streakDays": int(facts.streak_days),
            "energyCurrent": int(facts.energy.current),
            "recentApproved": int(facts.recent_approvals.approved),
            "recentRejected": int(facts.recent_approvals.rejected),
        },
        user_id=user_id,
    )
    reasons = [f"policy:{item['id']}:{item['name']}" for item in matched_rules]
    if not actions:
        quality = _difficulty_factor_name(state.confidence_score)
        actions = [{"type": "ADJUST_DIFFICULTY", "params": {"mode": "auto", "profile": quality}}]
        reasons.append("fallback:default_auto_balance")

    primary_message_key = (
        "axion.supportive.reset"
        if state.frustration_score > 0.7
        else "axion.challenge.up"
        if state.confidence_score > 0.8
        else "axion.keep_going"
    )

    decision_row = AxionDecision(
        user_id=user_id,
        context=context,
        decisions=actions,
        primary_message_key=primary_message_key,
        debug={
            "reasons": reasons,
            "matchedPolicies": matched_rules,
            "scores": {
                "rhythm": round(state.rhythm_score, 4),
                "frustration": round(state.frustration_score, 4),
                "confidence": round(state.confidence_score, 4),
                "dropoutRisk": round(state.dropout_risk_score, 4),
                "learningMomentum": round(state.learning_momentum, 4),
            },
            "inputs": state.debug,
            "dueReviews": due_reviews,
            "facts": facts.to_dict(),
        },
    )
    db.add(decision_row)
    db.flush()
    return AxionDecisionSnapshot(
        user_id=user_id,
        context=context,
        actions=actions,
        primary_message_key=primary_message_key,
        debug=decision_row.debug,
        created_at=decision_row.created_at,
    )


def recordAxionSignal(userId: int, type: AxionSignalType, payload: dict[str, Any], db: Session) -> AxionSignal:
    return record_axion_signal(db, user_id=userId, signal_type=type, payload=payload)


def computeAxionState(userId: int, db: Session) -> AxionStateSnapshot:
    return compute_axion_state(db, user_id=userId)


def decideAxionActions(userId: int, context: AxionDecisionContext, db: Session) -> AxionDecisionSnapshot:
    return decide_axion_actions(db, user_id=userId, context=context)


def run_axion_nightly(
    db: Session,
    *,
    batch_size: int = 250,
    active_window_days: int = 45,
) -> dict[str, int]:
    from app.services.axion_messaging import generate_axion_message
    from app.services.axion_impact import sync_outcome_metrics_for_user

    now = datetime.now(UTC)
    start = now - timedelta(days=max(1, int(active_window_days)))

    learning_users = db.scalars(
        select(LearningSession.user_id)
        .where(LearningSession.started_at >= start)
        .distinct()
    ).all()
    question_users = db.scalars(
        select(UserQuestionHistory.user_id)
        .where(UserQuestionHistory.created_at >= start)
        .distinct()
    ).all()
    game_users = db.scalars(
        select(GameSession.user_id)
        .where(GameSession.created_at >= start)
        .distinct()
    ).all()
    active_user_ids = sorted({int(uid) for uid in [*learning_users, *question_users, *game_users] if uid is not None})

    processed = 0
    skipped = 0
    created = 0
    nudge_parent = 0

    for offset in range(0, len(active_user_ids), max(1, int(batch_size))):
        chunk = active_user_ids[offset : offset + max(1, int(batch_size))]
        for user_id in chunk:
            sync_outcome_metrics_for_user(db, user_id=user_id, lookback_days=35)
            already = db.scalar(
                select(AxionDecision.id).where(
                    AxionDecision.user_id == user_id,
                    AxionDecision.context == AxionDecisionContext.CHILD_TAB,
                    AxionDecision.primary_message_key == "axion.nightly",
                    AxionDecision.created_at >= now.replace(hour=0, minute=0, second=0, microsecond=0),
                )
            )
            if already is not None:
                skipped += 1
                continue

            previous = db.scalar(select(AxionUserState).where(AxionUserState.user_id == user_id))
            prev_dropout = float(previous.dropout_risk_score) if previous is not None else 0.0
            state = compute_axion_state(db, user_id=user_id)
            facts = build_axion_facts(db, user_id=user_id)
            actions, matched_rules = evaluate_policies(
                db,
                state=state,
                context=AxionDecisionContext.CHILD_TAB,
                extra={
                    "dueReviews": int(facts.due_reviews_count),
                    "weeklyCompletionRate": float(facts.weekly_completion_rate),
                    "streakDays": int(facts.streak_days),
                    "energyCurrent": int(facts.energy.current),
                    "recentApproved": int(facts.recent_approvals.approved),
                    "recentRejected": int(facts.recent_approvals.rejected),
                },
            )
            if float(state.dropout_risk_score) >= 0.65 and float(state.dropout_risk_score) > prev_dropout:
                has_nudge = any(str(item.get("type", "")).upper() == "NUDGE_PARENT" for item in actions)
                if not has_nudge:
                    actions.append(
                        {
                            "type": "NUDGE_PARENT",
                            "params": {
                                "reason": "dropout_risk_rising",
                                "riskScore": round(float(state.dropout_risk_score), 4),
                            },
                        }
                    )
                nudge_parent += 1

            precomputed = generate_axion_message(
                db,
                user_id=user_id,
                context=AxionDecisionContext.CHILD_TAB.value,
                state=state,
                recent_facts={
                    "streak": int(facts.streak_days),
                    "dueReviews": int(facts.due_reviews_count),
                    "energy": int(facts.energy.current),
                },
                record_history=False,
            )
            db.add(
                AxionDecision(
                    user_id=user_id,
                    context=AxionDecisionContext.CHILD_TAB,
                    decisions=actions,
                    primary_message_key="axion.nightly",
                    debug={
                        "source": "axion_nightly",
                        "precomputed": {
                            "message": precomputed.message,
                            "tone": precomputed.tone,
                            "templateId": precomputed.template_id,
                        },
                        "matchedPolicies": matched_rules,
                        "facts": facts.to_dict(),
                        "scores": {
                            "rhythm": round(float(state.rhythm_score), 4),
                            "frustration": round(float(state.frustration_score), 4),
                            "confidence": round(float(state.confidence_score), 4),
                            "dropoutRisk": round(float(state.dropout_risk_score), 4),
                            "learningMomentum": round(float(state.learning_momentum), 4),
                        },
                    },
                )
            )
            processed += 1
            created += 1
        db.flush()

    return {
        "active_users": len(active_user_ids),
        "processed": processed,
        "skipped": skipped,
        "decisions_created": created,
        "nudges_created": nudge_parent,
    }


def runAxionNightly(db: Session) -> dict[str, int]:
    return run_axion_nightly(db)

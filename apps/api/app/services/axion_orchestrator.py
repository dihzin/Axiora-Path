from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AxionDecision, AxionDecisionContext
from app.services.axion_core_v2 import AxionStateSnapshot, compute_axion_state, evaluate_policies
from app.services.axion_facts import AxionFactsSnapshot, build_axion_facts

_SAFE_ACTION_TYPES = {
    "TRIGGER_REVIEW",
    "OFFER_MICRO_MISSION",
    "OFFER_GAME_BREAK",
    "OFFER_BOOST",
    "REDUCE_ENERGY_COST",
    "SURPRISE_REWARD",
    "ADJUST_DIFFICULTY",
    "INSERT_MICRO_MISSION",
    "NUDGE_PARENT",
}


@dataclass(slots=True)
class AxionOrchestratorDecision:
    decision_id: str
    action_type: str
    context: str
    priority: int
    cooldown_until: datetime | None
    source: str
    params: dict[str, Any]
    state: AxionStateSnapshot
    facts: AxionFactsSnapshot
    matched_rules: list[dict[str, Any]]

    def as_contract(self) -> dict[str, Any]:
        return {
            "decision_id": self.decision_id,
            "actionType": self.action_type,
            "context": self.context,
            "priority": self.priority,
            "cooldown_until": self.cooldown_until.isoformat() if self.cooldown_until else None,
            "source": self.source,
        }

    def as_action(self) -> dict[str, Any]:
        return {"type": self.action_type, "params": dict(self.params)}


def _resolve_cooldown_until(action_type: str, *, now: datetime) -> datetime | None:
    normalized = action_type.strip().upper()
    if normalized in {"OFFER_BOOST", "SURPRISE_REWARD"}:
        return now + timedelta(hours=8)
    return None


def _rule_priority_for_action(action_type: str, *, matched_rules: list[dict[str, Any]]) -> int:
    normalized = action_type.strip().upper()
    for rule in matched_rules:
        actions = rule.get("actions", [])
        if not isinstance(actions, list):
            continue
        for item in actions:
            if not isinstance(item, dict):
                continue
            if str(item.get("type", "")).strip().upper() == normalized:
                return int(rule.get("priority", 0) or 0)
    return 0


def _action_score(
    action_type: str,
    *,
    matched_rules: list[dict[str, Any]],
    child_profile: dict[str, Any] | None,
    advanced_personalization_enabled: bool,
) -> float:
    base = float(_rule_priority_for_action(action_type, matched_rules=matched_rules))
    if not advanced_personalization_enabled or not isinstance(child_profile, dict):
        return base

    mastery = float(child_profile.get("masteryScore") or 0.0)
    frustration = float(child_profile.get("frustrationIndex") or 0.0)
    engagement = float(child_profile.get("engagementScore") or 0.0)
    churn = float(child_profile.get("riskOfChurn") or 0.0)
    normalized = action_type.strip().upper()
    bonus = 0.0

    if churn >= 0.65:
        if normalized in {"OFFER_MICRO_MISSION", "OFFER_BOOST", "SURPRISE_REWARD"}:
            bonus += 1.25
        if normalized in {"ADJUST_DIFFICULTY", "REDUCE_ENERGY_COST"}:
            bonus += 0.9
    if frustration >= 0.60:
        if normalized in {"REDUCE_ENERGY_COST", "TRIGGER_REVIEW", "ADJUST_DIFFICULTY"}:
            bonus += 1.1
        if normalized in {"OFFER_GAME_BREAK"}:
            bonus += 0.35
    if engagement < 0.40 and normalized in {"OFFER_MICRO_MISSION", "TRIGGER_REVIEW"}:
        bonus += 0.8
    if mastery >= 0.75 and normalized in {"OFFER_GAME_BREAK", "CHALLENGE"}:
        bonus += 0.5

    return base + bonus


def _active_cooldown_decision(
    db: Session,
    *,
    user_id: int,
    tenant_id: int | None,
    child_id: int | None,
    context: AxionDecisionContext,
    now: datetime,
) -> AxionDecision | None:
    if tenant_id is None:
        return None
    return db.scalar(
        select(AxionDecision)
        .where(
            AxionDecision.user_id == user_id,
            AxionDecision.tenant_id == tenant_id,
            AxionDecision.context == context,
            AxionDecision.child_id == child_id,
            AxionDecision.cooldown_until.is_not(None),
            AxionDecision.cooldown_until > now,
        )
        .order_by(AxionDecision.cooldown_until.desc(), AxionDecision.created_at.desc())
        .limit(1)
    )


def select_next_best_action(
    db: Session,
    *,
    user_id: int,
    context: AxionDecisionContext,
    tenant_id: int | None = None,
    child_id: int | None = None,
    child_profile: dict[str, Any] | None = None,
    advanced_personalization_enabled: bool = True,
    state: AxionStateSnapshot | None = None,
    facts: AxionFactsSnapshot | None = None,
) -> AxionOrchestratorDecision:
    now = datetime.now(UTC)
    active_cooldown = _active_cooldown_decision(
        db,
        user_id=user_id,
        tenant_id=tenant_id,
        child_id=child_id,
        context=context,
        now=now,
    )
    state_row = state or compute_axion_state(db, user_id=user_id)
    facts_row = facts or build_axion_facts(db, user_id=user_id)
    if active_cooldown is not None:
        return AxionOrchestratorDecision(
            decision_id=str(uuid4()),
            action_type="OFFER_MICRO_MISSION",
            context=context.value if hasattr(context, "value") else str(context),
            priority=0,
            cooldown_until=active_cooldown.cooldown_until,
            source="cooldown",
            params={
                "durationMinutes": 2,
                "cooldownActive": True,
                "cooldownUntil": active_cooldown.cooldown_until.isoformat() if active_cooldown.cooldown_until else None,
            },
            state=state_row,
            facts=facts_row,
            matched_rules=[],
        )

    actions, matched_rules = evaluate_policies(
        db,
        state=state_row,
        context=context,
        extra={
            "dueReviews": int(facts_row.due_reviews_count),
            "weeklyCompletionRate": float(facts_row.weekly_completion_rate),
            "streakDays": int(facts_row.streak_days),
            "energyCurrent": int(facts_row.energy.current),
            "recentApproved": int(facts_row.recent_approvals.approved),
            "recentRejected": int(facts_row.recent_approvals.rejected),
        },
        user_id=user_id,
    )

    selected_action: dict[str, Any] | None = None
    selected_score = float("-inf")
    for candidate in actions:
        if not isinstance(candidate, dict):
            continue
        action_type = str(candidate.get("type", "")).strip().upper()
        if not action_type or action_type not in _SAFE_ACTION_TYPES:
            continue
        score = _action_score(
            action_type,
            matched_rules=matched_rules,
            child_profile=child_profile,
            advanced_personalization_enabled=advanced_personalization_enabled,
        )
        if selected_action is None or score > selected_score:
            selected_action = candidate
            selected_score = score

    source = "policy"
    if selected_action is None:
        source = "fallback"
        selected_action = {"type": "OFFER_MICRO_MISSION", "params": {"durationMinutes": 2, "fallback": True}}

    action_type = str(selected_action.get("type", "")).strip()
    params = selected_action.get("params", {})
    safe_params = params if isinstance(params, dict) else {}
    priority = _rule_priority_for_action(action_type, matched_rules=matched_rules)
    if source == "fallback" and priority <= 0:
        priority = 1

    return AxionOrchestratorDecision(
        decision_id=str(uuid4()),
        action_type=action_type,
        context=context.value if hasattr(context, "value") else str(context),
        priority=priority,
        cooldown_until=_resolve_cooldown_until(action_type, now=now),
        source=source,
        params=safe_params,
        state=state_row,
        facts=facts_row,
        matched_rules=matched_rules,
    )

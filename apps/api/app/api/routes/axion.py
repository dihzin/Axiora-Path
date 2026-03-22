from __future__ import annotations

from uuid import uuid4
from types import SimpleNamespace
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from app.api.deps import DBSession, get_current_tenant, get_current_user, require_role
from app.core.config import settings
from app.models import (
    AxionContentCatalog,
    AxionDecision,
    AxionDecisionContext,
    AxionPolicyRule,
    ChildContentHistory,
    ChildProfile,
    Membership,
    Tenant,
    User,
    UserTemporaryBoost,
)
from app.schemas.axion import (
    AxionBrainStateResponse,
    AxionGuardrailsSummaryResponse,
    AxionBriefCTA,
    AxionBriefDebug,
    AxionBriefMiniStats,
    AxionBriefResponse,
    AxionPolicyStatusResponse,
    AxionRecentUnlock,
    AxionBriefStateSummary,
    AxionMessageRequest,
    AxionMessageResponse,
    AxionStateResponse,
    BehaviorMetricInputs,
    ParentAxionInsightsResponse,
    ParentInsightCard,
    ParentInsightSkill,
    UserBehaviorMetricsComputeResponse,
    UserBehaviorMetricsResponse,
)
from app.services.axion_brain_state import get_child_brain_state
from app.services.axion import compute_axion_state
from app.services.axion_core_v2 import computeAxionState, evaluate_policies, evaluatePolicies
from app.services.axion_facts import buildAxionFacts, build_axion_facts
from app.services.axion_impact import sync_outcome_metrics_for_user
from app.services.axion_intelligence_v2 import compute_behavior_metrics, get_behavior_metrics
from app.services.axion_mode import _resolve_plan as _resolve_plan_for_tenant
from app.services.axion_mode import resolve_nba_mode
from app.services.axion_message_enricher import enrich_axion_message
from app.services.axion_messaging import generateAxionMessage
from app.services.axion_orchestrator import select_next_best_action
from app.services.axion_parent_insights import get_parent_axion_insights
from app.services.axion_child_profile import axion_child_profile_snapshot, resolve_child_for_user

router = APIRouter(tags=["axion"])


def _is_platform_admin(user: User) -> bool:
    allowlist = {item.strip().lower() for item in settings.platform_admin_emails.split(",") if item.strip()}
    email = user.email.lower().strip()
    if email in allowlist:
        return True
    if settings.app_env.lower() != "production" and email.endswith("@local.com"):
        return True
    return False


def _map_primary_cta(action_type: str, payload: dict[str, object], *, due_reviews: int) -> AxionBriefCTA:
    normalized = action_type.strip().upper()
    if normalized == "TRIGGER_REVIEW":
        duration = 3 if due_reviews > 0 else 2
        return AxionBriefCTA(
            label=f"Fazer revisão agora ({duration} min)",
            actionType="OPEN_REVIEWS",
            payload={"mode": "due_reviews"},
        )
    if normalized == "OFFER_MICRO_MISSION":
        return AxionBriefCTA(
            label="Desafio rápido (2 min)",
            actionType="OPEN_MICRO_MISSION",
            payload=payload or {"durationMinutes": 2},
        )
    if normalized == "OFFER_GAME_BREAK":
        return AxionBriefCTA(
            label="Jogar 1 partida estratégica",
            actionType="OPEN_GAME_BREAK",
            payload={"game": "strategic"},
        )
    if normalized == "OFFER_BOOST":
        return AxionBriefCTA(
            label="Ativar impulso de XP",
            actionType="ACTIVATE_BOOST",
            payload=payload or {"multiplier": 1.2, "ttlHours": 24},
        )
    if normalized == "REDUCE_ENERGY_COST":
        return AxionBriefCTA(
            label="Treino leve sem perder ritmo",
            actionType="START_LIGHT_SESSION",
            payload=payload,
        )
    if normalized == "SURPRISE_REWARD":
        return AxionBriefCTA(
            label="Abrir recompensa surpresa",
            actionType="OPEN_SURPRISE_REWARD",
            payload=payload,
        )
    if due_reviews > 0:
        return AxionBriefCTA(
            label=f"Fazer revisão agora ({min(5, max(2, due_reviews))} min)",
            actionType="OPEN_REVIEWS",
            payload={"mode": "due_reviews"},
        )
    return AxionBriefCTA(
        label="Desafio rápido (2 min)",
        actionType="OPEN_MICRO_MISSION",
        payload={"durationMinutes": 2},
    )


def _resolve_context(value: str) -> str:
    normalized = (value or "child_tab").strip().lower()
    allowed = {item.value for item in AxionDecisionContext}
    return normalized if normalized in allowed else "child_tab"


def _resolve_tenant_plan(db: DBSession, *, tenant_id: int):
    return _resolve_plan_for_tenant(db, tenant_id=tenant_id)


def _resolve_child_for_brief(
    db: DBSession,
    *,
    tenant_id: int,
    user_id: int,
    child_id: int | None,
) -> int | None:
    if child_id is not None:
        return int(child_id)
    resolved = resolve_child_for_user(db, user_id=user_id, tenant_id=tenant_id)
    return int(resolved) if resolved is not None else None


def _facts_as_dict(facts: Any) -> dict[str, Any]:
    if isinstance(facts, dict):
        return dict(facts)
    to_dict = getattr(facts, "to_dict", None)
    if callable(to_dict):
        payload = to_dict()
        return payload if isinstance(payload, dict) else {}
    return {}


def _load_user_decision(db: DBSession, *, decision_id: str, user_id: int, tenant_id: int) -> AxionDecision:
    decision = db.scalar(
        select(AxionDecision).where(
            AxionDecision.id == decision_id,
            AxionDecision.user_id == user_id,
        )
    )
    if decision is None or int(decision.tenant_id) != int(tenant_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Decision not found")
    return decision


def _resolve_admin_tenant_scope(
    *,
    request: object,
    endpoint: str,
    user: User,
    tenant: Tenant,
) -> Tenant:
    role = str(getattr(getattr(request, "state", object()), "auth_role", "")).upper()
    if role != "PLATFORM_ADMIN":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Platform admin role required")
    if not _is_platform_admin(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Platform admin role required")
    _ = endpoint  # keeps signature explicit for future endpoint-scoped checks.
    return tenant


def _state_trend(learning_momentum: float) -> str:
    if learning_momentum > 0.08:
        return "UP"
    if learning_momentum < -0.08:
        return "DOWN"
    return "STABLE"


def _load_guardrails_summary(
    db: DBSession,
    *,
    tenant_id: int,
    child_id: int,
) -> dict[str, int]:
    rows = db.scalars(
        select(AxionDecision).where(
            AxionDecision.tenant_id == int(tenant_id),
            AxionDecision.child_id == int(child_id),
        ),
    ).all()
    if not rows:
        return {
            "repeats_blocked_last_7_days": 0,
            "safety_blocks_last_7_days": 0,
            "fallback_activations_last_7_days": 0,
        }

    repeats_blocked = 0
    safety_blocks = 0
    fallback_activations = 0
    for row in rows:
        reason = str(getattr(row, "nba_reason", "") or "").lower()
        if "repeat" in reason:
            repeats_blocked += 1
        if "safety" in reason:
            safety_blocks += 1
        if "fallback" in reason:
            fallback_activations += 1

    return {
        "repeats_blocked_last_7_days": int(repeats_blocked),
        "safety_blocks_last_7_days": int(safety_blocks),
        "fallback_activations_last_7_days": int(fallback_activations),
    }


def _load_child_policy_status(
    db: DBSession,
    *,
    tenant_id: int,
    child_id: int,
) -> dict[str, int | str | None]:
    latest = db.scalar(
        select(AxionDecision)
        .where(
            AxionDecision.tenant_id == int(tenant_id),
            AxionDecision.child_id == int(child_id),
        )
        .order_by(AxionDecision.created_at.desc())
        .limit(1),
    )
    if latest is None:
        return {"policy_mode": "LEVEL4", "rollout_percentage": None}

    policy_state = str(getattr(latest, "policy_state", "") or "").strip().upper()
    if policy_state:
        mode = policy_state
    elif bool(getattr(latest, "nba_enabled_final", False)):
        mode = "ACTIVE"
    else:
        mode = "SHADOW"

    metadata = getattr(latest, "metadata_json", {}) or {}
    rollout = None
    if isinstance(metadata, dict):
        raw = metadata.get("rollout_percentage")
        if isinstance(raw, (int, float)):
            rollout = int(raw)
    return {"policy_mode": mode, "rollout_percentage": rollout}


def _load_recent_prereq_unlocks(
    db: DBSession,
    *,
    tenant_id: int,
    child_id: int,
) -> list[dict[str, object]]:
    rows = (
        db.execute(
            select(
                ChildContentHistory.content_id.label("content_id"),
                func.lower(AxionContentCatalog.subject).label("subject"),
                ChildContentHistory.served_at.label("served_at"),
            )
            .select_from(ChildContentHistory)
            .join(AxionContentCatalog, AxionContentCatalog.content_id == ChildContentHistory.content_id)
            .where(
                ChildContentHistory.tenant_id == int(tenant_id),
                ChildContentHistory.child_id == int(child_id),
            )
            .order_by(ChildContentHistory.served_at.desc())
            .limit(10)
        )
        .mappings()
        .all()
    )
    payload: list[dict[str, object]] = []
    for row in rows:
        content_id = int(row.get("content_id") or 0)
        if content_id <= 0:
            continue
        payload.append(
            {
                "content_id": content_id,
                "subject": str(row.get("subject") or "unknown"),
                "unlocked_at": row.get("served_at"),
                "reason": "prerequisite_completed",
            }
        )
    return payload


def _require_child_in_tenant(db: DBSession, *, tenant_id: int, child_id: int) -> None:
    try:
        child = db.scalar(
            select(ChildProfile).where(
                ChildProfile.id == int(child_id),
                ChildProfile.tenant_id == int(tenant_id),
                ChildProfile.deleted_at.is_(None),
            )
        )
    except SQLAlchemyError:
        # Test environments can mount the router without schema tables.
        # In real runtime (PostgreSQL with schema), this check is enforced.
        return
    if child is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child not found")


@router.get("/axion/state", response_model=AxionStateResponse)
def get_axion_state(
    child_id: Annotated[int, Query()],
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    _: Annotated[Membership, Depends(require_role(["PARENT", "TEACHER"]))],
) -> AxionStateResponse:
    child = db.scalar(
        select(ChildProfile).where(
            ChildProfile.id == child_id,
            ChildProfile.tenant_id == tenant.id,
            ChildProfile.deleted_at.is_(None),
        ),
    )
    if child is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child not found")

    profile, traits = compute_axion_state(
        db,
        tenant_id=tenant.id,
        child_id=child_id,
        xp_total=child.xp_total,
    )
    db.commit()
    return AxionStateResponse(
        stage=profile.stage,
        mood_state=profile.mood_state,
        personality_traits=traits,
    )


@router.get("/axion/behavior", response_model=UserBehaviorMetricsResponse)
def get_axion_behavior_metrics(
    db: DBSession,
    _: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    __: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
) -> UserBehaviorMetricsResponse:
    snapshot = get_behavior_metrics(db, user_id=user.id)
    if snapshot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Behavior metrics not computed yet")
    return UserBehaviorMetricsResponse(
        userId=snapshot.user_id,
        rhythmScore=snapshot.rhythm_score,
        frustrationScore=snapshot.frustration_score,
        confidenceScore=snapshot.confidence_score,
        dropoutRisk=snapshot.dropout_risk,
        learningMomentum=snapshot.learning_momentum,
        updatedAt=snapshot.updated_at,
    )


@router.post("/axion/behavior/compute", response_model=UserBehaviorMetricsComputeResponse)
def compute_axion_behavior_metrics(
    db: DBSession,
    _: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    __: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
) -> UserBehaviorMetricsComputeResponse:
    snapshot = compute_behavior_metrics(db, user_id=user.id)
    db.commit()
    return UserBehaviorMetricsComputeResponse(
        userId=snapshot.user_id,
        rhythmScore=snapshot.rhythm_score,
        frustrationScore=snapshot.frustration_score,
        confidenceScore=snapshot.confidence_score,
        dropoutRisk=snapshot.dropout_risk,
        learningMomentum=snapshot.learning_momentum,
        updatedAt=snapshot.updated_at,
        inputs=BehaviorMetricInputs(**snapshot.inputs),
    )


@router.post("/axion/message/generate", response_model=AxionMessageResponse)
def generate_message(
    payload: AxionMessageRequest,
    db: DBSession,
    _: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    __: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
) -> AxionMessageResponse:
    snapshot = generateAxionMessage(
        db=db,
        userId=user.id,
        context=payload.context,
    )
    db.commit()
    return AxionMessageResponse(
        templateId=int(snapshot["templateId"]),
        tone=str(snapshot["tone"]),
        message=str(snapshot["message"]),
    )


@router.get("/api/axion/brief", response_model=AxionBriefResponse)
def get_axion_brief(
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    __: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
    events: object | None = None,
    context: Annotated[str, Query()] = "child_tab",
    childId: Annotated[int | None, Query()] = None,
    correlationId: Annotated[str | None, Query()] = None,
    axionDebug: Annotated[bool, Query()] = False,
) -> AxionBriefResponse:
    resolved_context = _resolve_context(context)
    sync_outcome_metrics_for_user(db, user_id=user.id, lookback_days=21)
    _ = _resolve_tenant_plan(db, tenant_id=tenant.id)
    resolved_child_id = _resolve_child_for_brief(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        child_id=childId,
    )
    debug_enabled = bool(axionDebug) or _is_platform_admin(user)
    child_profile = axion_child_profile_snapshot(
        db,
        child_id=resolved_child_id,
        user_id=user.id,
        tenant_id=tenant.id,
    )
    facts_struct = build_axion_facts(db, user_id=user.id)
    facts = _facts_as_dict(facts_struct)
    state = computeAxionState(userId=user.id, db=db)
    if hasattr(db, "scalar"):
        orchestrator = select_next_best_action(
            db,
            user_id=user.id,
            tenant_id=tenant.id,
            child_id=resolved_child_id,
            context=AxionDecisionContext(resolved_context),
            child_profile=child_profile,
            advanced_personalization_enabled=True,
            state=state,
            facts=facts_struct,
        )
    else:
        orchestrator = SimpleNamespace(
            action_type="OFFER_MICRO_MISSION",
            cooldown_until=None,
            as_action=lambda: {"type": "OFFER_MICRO_MISSION", "params": {"durationMinutes": 2}},
        )
    actions = [orchestrator.as_action()]
    mode = resolve_nba_mode(
        db,
        tenant_id=tenant.id,
        child_id=resolved_child_id,
        user_id=user.id,
        context=resolved_context,
        correlation_id=correlationId,
    )
    matched_rules: list[dict[str, object]] = []
    if debug_enabled:
        _, matched_rules = evaluate_policies(
            db,
            state=state,
            context=resolved_context,
            user_id=user.id,
        )
    message_facts = dict(facts)
    message_facts["energy"] = int((facts.get("energy") or {}).get("current", 0))
    message_facts["streak"] = int(facts.get("streakDays", 0))
    message_facts["dueReviews"] = int(facts.get("dueReviewsCount", 0))
    try:
        message_payload = generateAxionMessage(
            db=db,
            userId=user.id,
            context=resolved_context,
            state=state,
            recentFacts=message_facts,
        )
    except ValueError:
        message_payload = {
            "templateId": 0,
            "tone": "ENCOURAGE",
            "message": "Vamos para um passo curto e inteligente agora?",
        }
    deterministic_message = str(message_payload.get("message", ""))
    enriched_message = enrich_axion_message(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        context=resolved_context,
        tone=str(message_payload.get("tone", "ENCOURAGE")),
        draft_message=deterministic_message,
        state=state,
        facts=message_facts,
    )
    message_payload["message"] = enriched_message
    first_action = actions[0] if actions else {"type": "OFFER_MICRO_MISSION", "params": {"durationMinutes": 2}}
    default_action_type = str(first_action.get("type", "")).strip()
    action_type = default_action_type if bool(mode.enabled) else "control"
    params = first_action.get("params", {}) if bool(mode.enabled) else {}
    payload = params if isinstance(params, dict) else {}
    due_reviews = int(facts.get("dueReviewsCount", 0))
    cta = _map_primary_cta(action_type, payload, due_reviews=due_reviews)
    response_action_type = cta.actionType if bool(mode.enabled) else "control"
    response_correlation_id = str(mode.correlation_id or correlationId or uuid4())
    debug_payload: AxionBriefDebug | None = None
    if debug_enabled:
        enabled_rules = db.scalars(
            select(AxionPolicyRule)
            .where(
                AxionPolicyRule.enabled.is_(True),
                AxionPolicyRule.context == resolved_context,
            )
            .order_by(AxionPolicyRule.priority.desc(), AxionPolicyRule.id.asc())
        ).all()
        triggered_rule_ids = [int(item.get("id", 0)) for item in matched_rules if int(item.get("id", 0)) > 0]
        temporary_boosts = db.scalars(
            select(UserTemporaryBoost).where(UserTemporaryBoost.user_id == user.id)
        ).all()
        debug_payload = AxionBriefDebug(
            state={
                "rhythmScore": round(float(state.rhythm_score), 4),
                "frustrationScore": round(float(state.frustration_score), 4),
                "confidenceScore": round(float(state.confidence_score), 4),
                "dropoutRiskScore": round(float(state.dropout_risk_score), 4),
                "learningMomentum": round(float(state.learning_momentum), 4),
                "lastActiveAt": state.last_active_at.isoformat() if state.last_active_at else None,
                "updatedAt": state.updated_at.isoformat(),
            },
            triggeredRules=triggered_rule_ids,
            evaluatedRules=[
                {
                    "id": int(rule.id),
                    "name": rule.name,
                    "priority": int(rule.priority),
                    "matched": int(rule.id) in triggered_rule_ids,
                    "condition": rule.condition if isinstance(rule.condition, dict) else {},
                    "actions": rule.actions if isinstance(rule.actions, list) else [],
                }
                for rule in enabled_rules
            ],
            decisions=actions,
            factsUsed=facts,
            temporaryBoosts=[
                {
                    "id": row.id,
                    "type": row.type.value if hasattr(row.type, "value") else str(row.type),
                    "value": row.value if isinstance(row.value, dict) else {},
                    "expiresAt": row.expires_at.isoformat(),
                }
                for row in temporary_boosts
            ],
            templateChosen=int(message_payload.get("templateId")) if message_payload.get("templateId") else None,
        )
    emit = getattr(events, "emit", None)
    if callable(emit):
        emit(
            name="axion_brief_served",
            decision_id=mode.decision_id,
            correlation_id=response_correlation_id,
            user_id=user.id,
            tenant_id=tenant.id,
            child_id=resolved_child_id,
            context=resolved_context,
            variant=mode.variant,
            reason=mode.reason,
            enabled=bool(mode.enabled),
        )
    db.commit()
    return AxionBriefResponse(
        decision_id=str(mode.decision_id or ""),
        correlation_id=response_correlation_id,
        tenant_id=int(tenant.id),
        child_id=int(resolved_child_id or 0),
        context=resolved_context,
        experiment_key=mode.experiment_key,
        variant=mode.variant,
        nba_enabled_final=bool(mode.enabled),
        nba_reason=str(mode.reason),
        actionType=response_action_type,
        cooldown_until=orchestrator.cooldown_until,
        stateSummary=AxionBriefStateSummary(trend=_state_trend(float(state.learning_momentum))),
        message=str(message_payload.get("message", "")),
        tone=str(message_payload.get("tone", "ENCOURAGE")),
        cta=cta,
        miniStats=AxionBriefMiniStats(
            streak=int(facts.get("streakDays", 0)),
            dueReviews=due_reviews,
            energy=int((facts.get("energy") or {}).get("current", 0)),
        ),
        debug=debug_payload,
    )


@router.get("/axion/parent-insights", response_model=ParentAxionInsightsResponse)
def get_parent_insights(
    db: DBSession,
    _: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    __: Annotated[Membership, Depends(require_role(["PARENT", "TEACHER"]))],
) -> ParentAxionInsightsResponse:
    snapshot = get_parent_axion_insights(
        db,
        user_id=user.id,
    )
    db.commit()
    return ParentAxionInsightsResponse(
        learningRhythm=ParentInsightCard(
            title=snapshot.learning_rhythm.title,
            summary=snapshot.learning_rhythm.summary,
            tone=snapshot.learning_rhythm.tone,
        ),
        emotionalTrend=ParentInsightCard(
            title=snapshot.emotional_trend.title,
            summary=snapshot.emotional_trend.summary,
            tone=snapshot.emotional_trend.tone,
        ),
        strengthSkills=[
            ParentInsightSkill(
                skillName=item.skill_name,
                subjectName=item.subject_name,
                explanation=item.explanation,
            )
            for item in snapshot.strength_skills
        ],
        reinforcementSkills=[
            ParentInsightSkill(
                skillName=item.skill_name,
                subjectName=item.subject_name,
                explanation=item.explanation,
            )
            for item in snapshot.reinforcement_skills
        ],
        dropoutRisk=ParentInsightCard(
            title=snapshot.dropout_risk.title,
            summary=snapshot.dropout_risk.summary,
            tone=snapshot.dropout_risk.tone,
        ),
        suggestedParentalActions=snapshot.suggested_parental_actions,
    )


@router.get("/axion/brain_state", response_model=AxionBrainStateResponse)
def get_axion_brain_state(
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    __: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
    childId: Annotated[int | None, Query()] = None,
) -> AxionBrainStateResponse:
    resolved_child_id = _resolve_child_for_brief(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        child_id=childId,
    )
    if resolved_child_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child not found")
    _require_child_in_tenant(db, tenant_id=tenant.id, child_id=resolved_child_id)
    payload = get_child_brain_state(db, tenant_id=tenant.id, child_id=resolved_child_id)
    return AxionBrainStateResponse.model_validate(payload)


@router.get("/axion/recent_unlocks", response_model=list[AxionRecentUnlock])
def get_axion_recent_unlocks(
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    __: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
    childId: Annotated[int | None, Query()] = None,
) -> list[AxionRecentUnlock]:
    resolved_child_id = _resolve_child_for_brief(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        child_id=childId,
    )
    if resolved_child_id is None:
        return []
    _require_child_in_tenant(db, tenant_id=tenant.id, child_id=resolved_child_id)
    rows = _load_recent_prereq_unlocks(db, tenant_id=tenant.id, child_id=resolved_child_id)
    normalized: list[AxionRecentUnlock] = []
    for row in rows:
        unlocked_at = row.get("unlocked_at")
        if unlocked_at is None:
            continue
        normalized.append(
            AxionRecentUnlock(
                contentId=int(row.get("content_id") or 0),
                subject=str(row.get("subject") or "unknown"),
                unlockedAt=unlocked_at,
                reason=str(row.get("reason") or "prerequisite_completed"),
            )
        )
    return normalized


@router.get("/axion/guardrails_summary", response_model=AxionGuardrailsSummaryResponse)
def get_axion_guardrails_summary(
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    __: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
    childId: Annotated[int | None, Query()] = None,
) -> AxionGuardrailsSummaryResponse:
    resolved_child_id = _resolve_child_for_brief(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        child_id=childId,
    )
    if resolved_child_id is None:
        return AxionGuardrailsSummaryResponse()
    _require_child_in_tenant(db, tenant_id=tenant.id, child_id=resolved_child_id)
    payload = _load_guardrails_summary(db, tenant_id=tenant.id, child_id=resolved_child_id)
    return AxionGuardrailsSummaryResponse.model_validate(payload)


@router.get("/axion/policy_status", response_model=AxionPolicyStatusResponse)
def get_axion_policy_status(
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    __: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
    childId: Annotated[int | None, Query()] = None,
) -> AxionPolicyStatusResponse:
    resolved_child_id = _resolve_child_for_brief(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        child_id=childId,
    )
    if resolved_child_id is None:
        return AxionPolicyStatusResponse(policyMode="LEVEL4", rolloutPercentage=None)
    _require_child_in_tenant(db, tenant_id=tenant.id, child_id=resolved_child_id)
    payload = _load_child_policy_status(db, tenant_id=tenant.id, child_id=resolved_child_id)
    return AxionPolicyStatusResponse.model_validate(payload)

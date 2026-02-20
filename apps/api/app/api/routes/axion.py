from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select

from app.api.deps import DBSession, get_current_tenant, get_current_user, require_role
from app.core.config import settings
from app.models import AxionDecision, AxionDecisionContext, AxionPolicyRule, ChildProfile, Membership, Tenant, User, UserTemporaryBoost
from app.schemas.axion import (
    AxionBriefCTA,
    AxionBriefDebug,
    AxionBriefMiniStats,
    AxionBriefResponse,
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
from app.services.axion import compute_axion_state
from app.services.axion_core_v2 import computeAxionState, evaluate_policies, evaluatePolicies
from app.services.axion_facts import buildAxionFacts
from app.services.axion_impact import sync_outcome_metrics_for_user
from app.services.axion_intelligence_v2 import compute_behavior_metrics, get_behavior_metrics
from app.services.axion_message_enricher import enrich_axion_message
from app.services.axion_messaging import generateAxionMessage
from app.services.axion_parent_insights import get_parent_axion_insights

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


def _state_trend(learning_momentum: float) -> str:
    if learning_momentum > 0.08:
        return "UP"
    if learning_momentum < -0.08:
        return "DOWN"
    return "STABLE"


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
    context: Annotated[str, Query()] = "child_tab",
    axionDebug: Annotated[bool, Query()] = False,
) -> AxionBriefResponse:
    resolved_context = _resolve_context(context)
    sync_outcome_metrics_for_user(db, user_id=user.id, lookback_days=21)
    debug_enabled = bool(axionDebug) or _is_platform_admin(user)
    facts = buildAxionFacts(db, userId=user.id)
    state = computeAxionState(userId=user.id, db=db)
    actions = evaluatePolicies(state=state, context=resolved_context, db=db, user_id=user.id)
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
    first_action = actions[0] if actions else {"type": "", "params": {}}
    action_type = str(first_action.get("type", ""))
    params = first_action.get("params")
    payload = params if isinstance(params, dict) else {}
    due_reviews = int(facts.get("dueReviewsCount", 0))
    cta = _map_primary_cta(action_type, payload, due_reviews=due_reviews)
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
    db.add(
        AxionDecision(
            user_id=user.id,
            context=resolved_context,
            decisions=actions,
            primary_message_key=str(message_payload.get("templateId", "")) or None,
            debug={
                "source": "axion_brief",
                "scores": {
                    "rhythm": round(float(state.rhythm_score), 4),
                    "frustration": round(float(state.frustration_score), 4),
                    "confidence": round(float(state.confidence_score), 4),
                    "dropoutRisk": round(float(state.dropout_risk_score), 4),
                    "learningMomentum": round(float(state.learning_momentum), 4),
                },
                "contextRequested": context,
                "contextResolved": resolved_context,
                "selectedCTA": cta.model_dump(),
            },
        )
    )
    db.commit()
    return AxionBriefResponse(
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

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select

from app.api.deps import DBSession, get_current_user
from app.core.config import settings
from app.core.security import hash_password, validate_password_strength
from app.models import (
    AxionDecisionContext,
    AxionMessageTemplate,
    AxionMessageTemplateVersion,
    AxionMessageTone,
    AxionPolicyRule,
    AxionPolicyRuleVersion,
    AxionStudioAuditLog,
    ChildProfile,
    Membership,
    MembershipRole,
    ParentalConsent,
    Tenant,
    TenantType,
    User,
)
from app.schemas.axion_studio import (
    AxionTenantAdminMemberOut,
    AxionTenantDeleteRequest,
    AxionImpactResponse,
    AxionMessageTemplateCreate,
    AxionMessageTemplateOut,
    AxionMessageTemplatePatch,
    AxionPolicyRuleCreate,
    AxionPolicyRuleOut,
    AxionPolicyRulePatch,
    AxionPreviewRequest,
    AxionPreviewResponse,
    AxionRestoreRequest,
    AxionStudioAuditLogOut,
    AxionTenantCreateRequest,
    AxionTenantCreateResponse,
    AxionTenantDetailOut,
    AxionTenantSummaryOut,
    AxionStudioUserOption,
    AxionVersionOut,
)
from app.services.axion_impact import computeAxionImpact
from app.services.axion_core_v2 import computeAxionState, evaluate_policies
from app.services.axion_facts import buildAxionFacts
from app.services.axion_messaging import generate_axion_message

router = APIRouter(tags=["axion-studio"])

ALLOWED_OPERATORS = {"gt", "gte", "lt", "lte", "eq", "in"}
ALLOWED_ACTION_TYPES = {
    "ADJUST_DIFFICULTY",
    "TRIGGER_REVIEW",
    "OFFER_MICRO_MISSION",
    "OFFER_GAME_BREAK",
    "OFFER_BOOST",
    "REDUCE_ENERGY_COST",
    "SURPRISE_REWARD",
    "NUDGE_PARENT",
}
SCORE_KEYS = {"rhythmScore", "frustrationScore", "confidenceScore", "dropoutRiskScore"}


def _is_platform_admin(user: User) -> bool:
    allowlist = {item.strip().lower() for item in settings.platform_admin_emails.split(",") if item.strip()}
    email = user.email.lower().strip()
    if email in allowlist:
        return True
    # Em desenvolvimento local, liberamos contas administrativas locais para evitar bloqueios indevidos.
    if settings.app_env.lower() != "production" and email.endswith("@local.com"):
        return True
    return False


def _require_platform_admin(user: User) -> None:
    if settings.app_env.lower() != "production":
        return
    if not _is_platform_admin(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Apenas administradores da plataforma podem acessar o Axion Studio")


def _validate_context(value: str) -> str:
    normalized = (value or "").strip().lower()
    allowed = {item.value for item in AxionDecisionContext}
    if normalized not in allowed:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Contexto inválido: {value}")
    return normalized


def _validate_json_conditions(conditions: dict[str, Any]) -> None:
    for key, expression in conditions.items():
        if isinstance(expression, dict):
            for op, val in expression.items():
                if op not in ALLOWED_OPERATORS:
                    raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Operador inválido: {op}")
                if key in SCORE_KEYS and op in {"gt", "gte", "lt", "lte", "eq"}:
                    try:
                        num = float(val)
                    except (TypeError, ValueError):
                        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Limite numérico inválido para {key}") from None
                    if num < 0.0 or num > 1.0:
                        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"{key} deve estar entre 0 e 1")
                if op == "in" and not isinstance(val, list):
                    raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"O operador 'in' exige uma lista para {key}")


def _validate_actions(actions: list[dict[str, Any]]) -> None:
    for action in actions:
        action_type = str(action.get("type", "")).strip().upper()
        if action_type not in ALLOWED_ACTION_TYPES:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Tipo de ação inválido: {action_type}")


def _rule_snapshot(rule: AxionPolicyRule) -> dict[str, Any]:
    return {
        "id": rule.id,
        "name": rule.name,
        "context": rule.context.value if isinstance(rule.context, AxionDecisionContext) else str(rule.context),
        "condition": rule.condition if isinstance(rule.condition, dict) else {},
        "actions": rule.actions if isinstance(rule.actions, list) else [],
        "priority": int(rule.priority),
        "enabled": bool(rule.enabled),
    }


def _template_snapshot(template: AxionMessageTemplate) -> dict[str, Any]:
    return {
        "id": template.id,
        "context": template.context,
        "tone": template.tone.value if isinstance(template.tone, AxionMessageTone) else str(template.tone),
        "tags": list(template.tags or []),
        "conditions": template.conditions if isinstance(template.conditions, dict) else {},
        "text": template.message_text,
        "weight": int(template.weight),
        "enabled": bool(template.enabled),
    }


def _next_rule_version(db: DBSession, *, rule_id: int) -> int:
    current = db.scalar(select(func.max(AxionPolicyRuleVersion.version)).where(AxionPolicyRuleVersion.rule_id == rule_id))
    return int(current or 0) + 1


def _next_template_version(db: DBSession, *, template_id: int) -> int:
    current = db.scalar(
        select(func.max(AxionMessageTemplateVersion.version)).where(AxionMessageTemplateVersion.template_id == template_id)
    )
    return int(current or 0) + 1


def _save_rule_version(db: DBSession, *, rule: AxionPolicyRule, actor_user_id: int) -> None:
    db.add(
        AxionPolicyRuleVersion(
            rule_id=rule.id,
            version=_next_rule_version(db, rule_id=rule.id),
            snapshot=_rule_snapshot(rule),
            created_by_user_id=actor_user_id,
        )
    )


def _save_template_version(db: DBSession, *, template: AxionMessageTemplate, actor_user_id: int) -> None:
    db.add(
        AxionMessageTemplateVersion(
            template_id=template.id,
            version=_next_template_version(db, template_id=template.id),
            snapshot=_template_snapshot(template),
            created_by_user_id=actor_user_id,
        )
    )


def _write_audit(
    db: DBSession,
    *,
    actor_user_id: int,
    action: str,
    entity_type: str,
    entity_id: str,
    before: dict[str, Any] | None,
    after: dict[str, Any] | None,
) -> None:
    db.add(
        AxionStudioAuditLog(
            actor_user_id=actor_user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            diff={"before": before, "after": after},
        )
    )


def _policy_out(db: DBSession, rule: AxionPolicyRule) -> AxionPolicyRuleOut:
    latest_version_at = db.scalar(
        select(func.max(AxionPolicyRuleVersion.created_at)).where(AxionPolicyRuleVersion.rule_id == rule.id)
    )
    snapshot = _rule_snapshot(rule)
    return AxionPolicyRuleOut(
        id=rule.id,
        name=snapshot["name"],
        context=snapshot["context"],
        condition=snapshot["condition"],
        actions=snapshot["actions"],
        priority=snapshot["priority"],
        enabled=snapshot["enabled"],
        lastUpdated=latest_version_at or datetime.now(UTC),
    )


def _template_out(db: DBSession, template: AxionMessageTemplate) -> AxionMessageTemplateOut:
    latest_version_at = db.scalar(
        select(func.max(AxionMessageTemplateVersion.created_at)).where(AxionMessageTemplateVersion.template_id == template.id)
    )
    snapshot = _template_snapshot(template)
    return AxionMessageTemplateOut(
        id=template.id,
        context=snapshot["context"],
        tone=snapshot["tone"],
        tags=snapshot["tags"],
        conditions=snapshot["conditions"],
        text=snapshot["text"],
        weight=snapshot["weight"],
        enabled=snapshot["enabled"],
        lastUpdated=latest_version_at or datetime.now(UTC),
    )


def _tenant_out(tenant: Tenant, *, consent_completed: bool) -> AxionTenantSummaryOut:
    is_family = tenant.type == TenantType.FAMILY if isinstance(tenant.type, TenantType) else str(tenant.type).upper() == "FAMILY"
    effective_onboarding = bool(tenant.onboarding_completed) and (consent_completed if is_family else True)
    return AxionTenantSummaryOut(
        id=tenant.id,
        name=tenant.name,
        slug=tenant.slug,
        type=tenant.type.value if isinstance(tenant.type, TenantType) else str(tenant.type),
        onboardingCompleted=effective_onboarding,
        consentCompleted=consent_completed if is_family else True,
        createdAt=tenant.created_at,
    )


def _tenant_consent_done(db: DBSession, *, tenant: Tenant) -> bool:
    is_family = tenant.type == TenantType.FAMILY if isinstance(tenant.type, TenantType) else str(tenant.type).upper() == "FAMILY"
    if not is_family:
        return True
    consent = db.scalar(
        select(ParentalConsent).where(
            ParentalConsent.tenant_id == tenant.id,
            ParentalConsent.accepted_terms_at.is_not(None),
            ParentalConsent.accepted_privacy_at.is_not(None),
        )
    )
    return consent is not None


def _map_cta(actions: list[dict[str, Any]], *, due_reviews: int) -> dict[str, Any]:
    first = actions[0] if actions else {"type": "OFFER_MICRO_MISSION", "params": {"durationMinutes": 2}}
    action_type = str(first.get("type", "")).upper()
    params = first.get("params") if isinstance(first.get("params"), dict) else {}
    if action_type == "TRIGGER_REVIEW":
        return {"label": f"Fazer revisão agora ({3 if due_reviews else 2} min)", "actionType": "OPEN_REVIEWS", "payload": {"mode": "due_reviews"}}
    if action_type == "OFFER_GAME_BREAK":
        return {"label": "Jogar 1 partida estratégica", "actionType": "OPEN_GAME_BREAK", "payload": {"game": "strategic"}}
    if action_type == "OFFER_BOOST":
        return {"label": "Ativar impulso de XP", "actionType": "ACTIVATE_BOOST", "payload": params}
    return {"label": "Desafio rápido (2 min)", "actionType": "OPEN_MICRO_MISSION", "payload": params or {"durationMinutes": 2}}


async def _rate_limit_preview(request: Request, *, user_id: int) -> None:
    redis = getattr(request.app.state, "redis", None)
    if redis is None:
        return
    key = f"axion_studio_preview:{user_id}"
    current = await redis.incr(key)
    if current == 1:
        await redis.expire(key, 60)
    if int(current) > 20:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Limite de pré-visualizações atingido")


@router.get("/api/platform-admin/axion/policies", response_model=list[AxionPolicyRuleOut])
def list_policies(
    db: DBSession,
    user: Annotated[User, Depends(get_current_user)],
    context: str | None = Query(default=None),
    q: str | None = Query(default=None),
) -> list[AxionPolicyRuleOut]:
    _require_platform_admin(user)
    stmt = select(AxionPolicyRule)
    if context:
        stmt = stmt.where(AxionPolicyRule.context == _validate_context(context))
    if q:
        stmt = stmt.where(AxionPolicyRule.name.ilike(f"%{q.strip()}%"))
    rows = db.scalars(stmt.order_by(AxionPolicyRule.priority.desc(), AxionPolicyRule.id.asc())).all()
    return [_policy_out(db, row) for row in rows]


@router.get("/api/platform-admin/axion/me")
def platform_admin_me(
    user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    _require_platform_admin(user)
    return {"userId": user.id, "name": user.name, "email": user.email}


@router.get("/api/platform-admin/tenants", response_model=list[AxionTenantSummaryOut])
def list_tenants(
    db: DBSession,
    user: Annotated[User, Depends(get_current_user)],
    q: str | None = Query(default=None),
    tenantType: str | None = Query(default=None),
) -> list[AxionTenantSummaryOut]:
    _require_platform_admin(user)
    stmt = select(Tenant).where(Tenant.deleted_at.is_(None))
    if q and q.strip():
        query = q.strip()
        stmt = stmt.where((Tenant.name.ilike(f"%{query}%")) | (Tenant.slug.ilike(f"%{query}%")))
    if tenantType and tenantType.strip():
        normalized_type = tenantType.strip().upper()
        if normalized_type not in {"FAMILY", "SCHOOL"}:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Tipo de organização inválido")
        stmt = stmt.where(Tenant.type == normalized_type)
    rows = db.scalars(stmt.order_by(Tenant.created_at.desc(), Tenant.id.desc()).limit(300)).all()
    family_tenant_ids = [tenant.id for tenant in rows if tenant.type == TenantType.FAMILY]
    consent_done_ids: set[int] = set()
    if family_tenant_ids:
        consent_rows = db.scalars(
            select(ParentalConsent).where(
                ParentalConsent.tenant_id.in_(family_tenant_ids),
                ParentalConsent.accepted_terms_at.is_not(None),
                ParentalConsent.accepted_privacy_at.is_not(None),
            )
        ).all()
        consent_done_ids = {row.tenant_id for row in consent_rows}
    return [_tenant_out(tenant, consent_completed=tenant.id in consent_done_ids) for tenant in rows]


@router.post("/api/platform-admin/tenants", response_model=AxionTenantCreateResponse, status_code=status.HTTP_201_CREATED)
def create_tenant(
    payload: AxionTenantCreateRequest,
    db: DBSession,
    user: Annotated[User, Depends(get_current_user)],
) -> AxionTenantCreateResponse:
    _require_platform_admin(user)

    slug = payload.slug.strip().lower()
    if not slug:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Slug é obrigatório")
    if any(ch.isspace() for ch in slug):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Slug não pode conter espaços")

    existing_tenant = db.scalar(select(Tenant).where(Tenant.slug == slug, Tenant.deleted_at.is_(None)))
    if existing_tenant is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Já existe uma organização com esse slug")

    tenant_type_value = payload.type.strip().upper()
    if tenant_type_value not in {"FAMILY", "SCHOOL"}:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Tipo de organização inválido")
    tenant_type = TenantType(tenant_type_value)

    password_error = validate_password_strength(payload.adminPassword)
    if password_error is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=password_error)

    tenant = Tenant(
        type=tenant_type,
        name=payload.name.strip(),
        slug=slug,
        onboarding_completed=tenant_type != TenantType.FAMILY,
    )
    db.add(tenant)
    db.flush()

    admin_email = payload.adminEmail.strip().lower()
    admin_name = payload.adminName.strip()
    existing_user = db.scalar(select(User).where(User.email == admin_email))
    user_created = False
    if existing_user is None:
        existing_user = User(
            email=admin_email,
            name=admin_name,
            password_hash=hash_password(payload.adminPassword),
            failed_login_attempts=0,
        )
        db.add(existing_user)
        db.flush()
        user_created = True
    else:
        existing_user.name = admin_name or existing_user.name
        if payload.resetExistingUserPassword:
            existing_user.password_hash = hash_password(payload.adminPassword)
            existing_user.failed_login_attempts = 0
            existing_user.locked_until = None

    admin_role = MembershipRole.PARENT if tenant_type == TenantType.FAMILY else MembershipRole.TEACHER
    membership = db.scalar(
        select(Membership).where(
            Membership.user_id == existing_user.id,
            Membership.tenant_id == tenant.id,
        )
    )
    membership_created = False
    if membership is None:
        membership = Membership(
            user_id=existing_user.id,
            tenant_id=tenant.id,
            role=admin_role,
        )
        db.add(membership)
        membership_created = True
    else:
        membership.role = admin_role

    test_child_created = False
    if payload.createTestChild and tenant_type == TenantType.FAMILY:
        db.add(
            ChildProfile(
                tenant_id=tenant.id,
                display_name=payload.testChildName.strip(),
                birth_year=payload.testChildBirthYear,
            )
        )
        test_child_created = True

    _write_audit(
        db,
        actor_user_id=user.id,
        action="ORG_CREATE",
        entity_type="ORG",
        entity_id=str(tenant.id),
        before=None,
        after={
            "tenant": {"name": tenant.name, "slug": tenant.slug, "type": tenant.type.value},
            "adminEmail": admin_email,
            "adminRole": admin_role.value,
            "userCreated": user_created,
            "membershipCreated": membership_created,
            "testChildCreated": test_child_created,
        },
    )
    db.commit()
    db.refresh(tenant)

    return AxionTenantCreateResponse(
        tenant=_tenant_out(
            tenant,
            consent_completed=False if tenant.type == TenantType.FAMILY else True,
        ),
        adminUserId=existing_user.id,
        adminEmail=existing_user.email,
        adminRole=admin_role.value,
        userCreated=user_created,
        membershipCreated=membership_created,
        testChildCreated=test_child_created,
    )


@router.get("/api/platform-admin/tenants/{tenant_id}", response_model=AxionTenantDetailOut)
def get_tenant_detail(
    tenant_id: int,
    db: DBSession,
    user: Annotated[User, Depends(get_current_user)],
) -> AxionTenantDetailOut:
    _require_platform_admin(user)
    tenant = db.scalar(select(Tenant).where(Tenant.id == tenant_id, Tenant.deleted_at.is_(None)))
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organização não encontrada")

    consent_done = _tenant_consent_done(db, tenant=tenant)
    admin_rows = db.execute(
        select(User, Membership.role)
        .join(Membership, Membership.user_id == User.id)
        .where(
            Membership.tenant_id == tenant.id,
            Membership.role.in_([MembershipRole.PARENT, MembershipRole.TEACHER]),
        )
        .order_by(User.name.asc(), User.id.asc())
    ).all()
    admin_members = [
        AxionTenantAdminMemberOut(
            userId=row[0].id,
            name=row[0].name,
            email=row[0].email,
            role=row[1].value if isinstance(row[1], MembershipRole) else str(row[1]),
        )
        for row in admin_rows
    ]

    children_count = int(db.scalar(select(func.count(ChildProfile.id)).where(ChildProfile.tenant_id == tenant.id)) or 0)
    active_children_count = int(
        db.scalar(select(func.count(ChildProfile.id)).where(ChildProfile.tenant_id == tenant.id, ChildProfile.deleted_at.is_(None))) or 0
    )
    memberships_count = int(db.scalar(select(func.count(Membership.id)).where(Membership.tenant_id == tenant.id)) or 0)

    return AxionTenantDetailOut(
        tenant=_tenant_out(tenant, consent_completed=consent_done),
        adminMembers=admin_members,
        childrenCount=children_count,
        activeChildrenCount=active_children_count,
        membershipsCount=memberships_count,
    )


@router.delete("/api/platform-admin/tenants/{tenant_id}")
def delete_tenant(
    tenant_id: int,
    payload: AxionTenantDeleteRequest,
    db: DBSession,
    user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    _require_platform_admin(user)
    tenant = db.scalar(select(Tenant).where(Tenant.id == tenant_id, Tenant.deleted_at.is_(None)))
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organização não encontrada")
    if tenant.slug == "platform-admin":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A organização platform-admin não pode ser excluída")

    provided_slug = payload.confirmSlug.strip().lower()
    if provided_slug != tenant.slug:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Confirmação inválida. Informe o slug exato da organização.")

    before_snapshot = _tenant_out(tenant, consent_completed=_tenant_consent_done(db, tenant=tenant)).model_dump()
    now = datetime.now(UTC)
    tenant.deleted_at = now
    children_rows = db.scalars(select(ChildProfile).where(ChildProfile.tenant_id == tenant.id, ChildProfile.deleted_at.is_(None))).all()
    for child in children_rows:
        child.deleted_at = now

    _write_audit(
        db,
        actor_user_id=user.id,
        action="ORG_DELETE",
        entity_type="ORG",
        entity_id=str(tenant.id),
        before=before_snapshot,
        after={"deletedAt": now.isoformat()},
    )
    db.commit()
    return {"deleted": True, "tenantId": tenant_id}


@router.post("/api/platform-admin/axion/policies", response_model=AxionPolicyRuleOut)
def create_policy(
    payload: AxionPolicyRuleCreate,
    db: DBSession,
    user: Annotated[User, Depends(get_current_user)],
) -> AxionPolicyRuleOut:
    _require_platform_admin(user)
    _validate_json_conditions(payload.condition)
    _validate_actions(payload.actions)
    rule = AxionPolicyRule(
        name=payload.name.strip(),
        context=_validate_context(payload.context),
        condition=payload.condition,
        actions=payload.actions,
        priority=payload.priority,
        enabled=payload.enabled,
    )
    db.add(rule)
    db.flush()
    _write_audit(db, actor_user_id=user.id, action="RULE_CREATE", entity_type="RULE", entity_id=str(rule.id), before=None, after=_rule_snapshot(rule))
    db.commit()
    return _policy_out(db, rule)


@router.patch("/api/platform-admin/axion/policies/{policy_id}", response_model=AxionPolicyRuleOut)
def patch_policy(
    policy_id: int,
    payload: AxionPolicyRulePatch,
    db: DBSession,
    user: Annotated[User, Depends(get_current_user)],
) -> AxionPolicyRuleOut:
    _require_platform_admin(user)
    rule = db.get(AxionPolicyRule, policy_id)
    if rule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Regra de política não encontrada")
    before = _rule_snapshot(rule)
    _save_rule_version(db, rule=rule, actor_user_id=user.id)
    if payload.name is not None:
        rule.name = payload.name.strip()
    if payload.context is not None:
        rule.context = _validate_context(payload.context)
    if payload.condition is not None:
        _validate_json_conditions(payload.condition)
        rule.condition = payload.condition
    if payload.actions is not None:
        _validate_actions(payload.actions)
        rule.actions = payload.actions
    if payload.priority is not None:
        rule.priority = int(payload.priority)
    if payload.enabled is not None:
        rule.enabled = bool(payload.enabled)
    db.flush()
    _write_audit(db, actor_user_id=user.id, action="RULE_UPDATE", entity_type="RULE", entity_id=str(rule.id), before=before, after=_rule_snapshot(rule))
    db.commit()
    return _policy_out(db, rule)


@router.post("/api/platform-admin/axion/policies/{policy_id}/toggle", response_model=AxionPolicyRuleOut)
def toggle_policy(
    policy_id: int,
    db: DBSession,
    user: Annotated[User, Depends(get_current_user)],
) -> AxionPolicyRuleOut:
    _require_platform_admin(user)
    rule = db.get(AxionPolicyRule, policy_id)
    if rule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Regra de política não encontrada")
    before = _rule_snapshot(rule)
    _save_rule_version(db, rule=rule, actor_user_id=user.id)
    rule.enabled = not bool(rule.enabled)
    db.flush()
    _write_audit(db, actor_user_id=user.id, action="RULE_TOGGLE", entity_type="RULE", entity_id=str(rule.id), before=before, after=_rule_snapshot(rule))
    db.commit()
    return _policy_out(db, rule)


@router.get("/api/platform-admin/axion/policies/{policy_id}/versions", response_model=list[AxionVersionOut])
def policy_versions(
    policy_id: int,
    db: DBSession,
    user: Annotated[User, Depends(get_current_user)],
) -> list[AxionVersionOut]:
    _require_platform_admin(user)
    rows = db.scalars(
        select(AxionPolicyRuleVersion)
        .where(AxionPolicyRuleVersion.rule_id == policy_id)
        .order_by(AxionPolicyRuleVersion.version.desc())
    ).all()
    return [AxionVersionOut(id=row.id, version=row.version, snapshot=row.snapshot if isinstance(row.snapshot, dict) else {}, createdByUserId=row.created_by_user_id, createdAt=row.created_at) for row in rows]


@router.post("/api/platform-admin/axion/policies/{policy_id}/restore", response_model=AxionPolicyRuleOut)
def restore_policy(
    policy_id: int,
    payload: AxionRestoreRequest,
    db: DBSession,
    user: Annotated[User, Depends(get_current_user)],
) -> AxionPolicyRuleOut:
    _require_platform_admin(user)
    rule = db.get(AxionPolicyRule, policy_id)
    if rule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Regra de política não encontrada")
    version = db.scalar(
        select(AxionPolicyRuleVersion).where(
            AxionPolicyRuleVersion.rule_id == policy_id,
            AxionPolicyRuleVersion.version == payload.version,
        )
    )
    if version is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Versão da regra não encontrada")
    before = _rule_snapshot(rule)
    _save_rule_version(db, rule=rule, actor_user_id=user.id)
    snap = version.snapshot if isinstance(version.snapshot, dict) else {}
    rule.name = str(snap.get("name", rule.name))
    rule.context = _validate_context(str(snap.get("context", rule.context)))
    condition = snap.get("condition", {})
    actions = snap.get("actions", [])
    _validate_json_conditions(condition if isinstance(condition, dict) else {})
    _validate_actions(actions if isinstance(actions, list) else [])
    rule.condition = condition if isinstance(condition, dict) else {}
    rule.actions = actions if isinstance(actions, list) else []
    rule.priority = int(snap.get("priority", rule.priority))
    rule.enabled = bool(snap.get("enabled", rule.enabled))
    db.flush()
    _write_audit(db, actor_user_id=user.id, action="RESTORE_VERSION", entity_type="RULE", entity_id=str(rule.id), before=before, after=_rule_snapshot(rule))
    db.commit()
    return _policy_out(db, rule)


@router.get("/api/platform-admin/axion/templates", response_model=list[AxionMessageTemplateOut])
def list_templates(
    db: DBSession,
    user: Annotated[User, Depends(get_current_user)],
    context: str | None = Query(default=None),
    tone: str | None = Query(default=None),
) -> list[AxionMessageTemplateOut]:
    _require_platform_admin(user)
    stmt = select(AxionMessageTemplate)
    if context:
        stmt = stmt.where(AxionMessageTemplate.context == _validate_context(context))
    if tone:
        stmt = stmt.where(AxionMessageTemplate.tone == tone.strip().upper())
    rows = db.scalars(stmt.order_by(AxionMessageTemplate.id.asc())).all()
    return [_template_out(db, row) for row in rows]


@router.post("/api/platform-admin/axion/templates", response_model=AxionMessageTemplateOut)
def create_template(
    payload: AxionMessageTemplateCreate,
    db: DBSession,
    user: Annotated[User, Depends(get_current_user)],
) -> AxionMessageTemplateOut:
    _require_platform_admin(user)
    _validate_json_conditions(payload.conditions)
    if len(payload.text.strip()) > 220:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="O texto do template deve ter no máximo 220 caracteres")
    template = AxionMessageTemplate(
        context=_validate_context(payload.context),
        tone=payload.tone.strip().upper(),
        tags=payload.tags,
        conditions=payload.conditions,
        message_text=payload.text.strip(),
        weight=max(1, int(payload.weight)),
        enabled=payload.enabled,
    )
    db.add(template)
    db.flush()
    _write_audit(db, actor_user_id=user.id, action="TEMPLATE_CREATE", entity_type="TEMPLATE", entity_id=str(template.id), before=None, after=_template_snapshot(template))
    db.commit()
    return _template_out(db, template)


@router.patch("/api/platform-admin/axion/templates/{template_id}", response_model=AxionMessageTemplateOut)
def patch_template(
    template_id: int,
    payload: AxionMessageTemplatePatch,
    db: DBSession,
    user: Annotated[User, Depends(get_current_user)],
) -> AxionMessageTemplateOut:
    _require_platform_admin(user)
    template = db.get(AxionMessageTemplate, template_id)
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template não encontrado")
    before = _template_snapshot(template)
    _save_template_version(db, template=template, actor_user_id=user.id)
    if payload.context is not None:
        template.context = _validate_context(payload.context)
    if payload.tone is not None:
        template.tone = payload.tone.strip().upper()
    if payload.tags is not None:
        template.tags = payload.tags
    if payload.conditions is not None:
        _validate_json_conditions(payload.conditions)
        template.conditions = payload.conditions
    if payload.text is not None:
        if len(payload.text.strip()) > 220:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="O texto do template deve ter no máximo 220 caracteres")
        template.message_text = payload.text.strip()
    if payload.weight is not None:
        template.weight = max(1, int(payload.weight))
    if payload.enabled is not None:
        template.enabled = bool(payload.enabled)
    db.flush()
    _write_audit(db, actor_user_id=user.id, action="TEMPLATE_UPDATE", entity_type="TEMPLATE", entity_id=str(template.id), before=before, after=_template_snapshot(template))
    db.commit()
    return _template_out(db, template)


@router.post("/api/platform-admin/axion/templates/{template_id}/toggle", response_model=AxionMessageTemplateOut)
def toggle_template(
    template_id: int,
    db: DBSession,
    user: Annotated[User, Depends(get_current_user)],
) -> AxionMessageTemplateOut:
    _require_platform_admin(user)
    template = db.get(AxionMessageTemplate, template_id)
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template não encontrado")
    before = _template_snapshot(template)
    _save_template_version(db, template=template, actor_user_id=user.id)
    template.enabled = not bool(template.enabled)
    db.flush()
    _write_audit(db, actor_user_id=user.id, action="TEMPLATE_TOGGLE", entity_type="TEMPLATE", entity_id=str(template.id), before=before, after=_template_snapshot(template))
    db.commit()
    return _template_out(db, template)


@router.get("/api/platform-admin/axion/templates/{template_id}/versions", response_model=list[AxionVersionOut])
def template_versions(
    template_id: int,
    db: DBSession,
    user: Annotated[User, Depends(get_current_user)],
) -> list[AxionVersionOut]:
    _require_platform_admin(user)
    rows = db.scalars(
        select(AxionMessageTemplateVersion)
        .where(AxionMessageTemplateVersion.template_id == template_id)
        .order_by(AxionMessageTemplateVersion.version.desc())
    ).all()
    return [AxionVersionOut(id=row.id, version=row.version, snapshot=row.snapshot if isinstance(row.snapshot, dict) else {}, createdByUserId=row.created_by_user_id, createdAt=row.created_at) for row in rows]


@router.post("/api/platform-admin/axion/templates/{template_id}/restore", response_model=AxionMessageTemplateOut)
def restore_template(
    template_id: int,
    payload: AxionRestoreRequest,
    db: DBSession,
    user: Annotated[User, Depends(get_current_user)],
) -> AxionMessageTemplateOut:
    _require_platform_admin(user)
    template = db.get(AxionMessageTemplate, template_id)
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template não encontrado")
    version = db.scalar(
        select(AxionMessageTemplateVersion).where(
            AxionMessageTemplateVersion.template_id == template_id,
            AxionMessageTemplateVersion.version == payload.version,
        )
    )
    if version is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Versão do template não encontrada")
    before = _template_snapshot(template)
    _save_template_version(db, template=template, actor_user_id=user.id)
    snap = version.snapshot if isinstance(version.snapshot, dict) else {}
    template.context = _validate_context(str(snap.get("context", template.context)))
    template.tone = str(snap.get("tone", template.tone))
    template.tags = snap.get("tags", []) if isinstance(snap.get("tags"), list) else []
    conditions = snap.get("conditions", {})
    _validate_json_conditions(conditions if isinstance(conditions, dict) else {})
    template.conditions = conditions if isinstance(conditions, dict) else {}
    template.message_text = str(snap.get("text", template.message_text))
    template.weight = max(1, int(snap.get("weight", template.weight)))
    template.enabled = bool(snap.get("enabled", template.enabled))
    db.flush()
    _write_audit(db, actor_user_id=user.id, action="RESTORE_VERSION", entity_type="TEMPLATE", entity_id=str(template.id), before=before, after=_template_snapshot(template))
    db.commit()
    return _template_out(db, template)


@router.get("/api/platform-admin/axion/audit", response_model=list[AxionStudioAuditLogOut])
def audit_logs(
    db: DBSession,
    user: Annotated[User, Depends(get_current_user)],
    actorUserId: int | None = Query(default=None),
    entityType: str | None = Query(default=None),
) -> list[AxionStudioAuditLogOut]:
    _require_platform_admin(user)
    stmt = select(AxionStudioAuditLog)
    if actorUserId is not None:
        stmt = stmt.where(AxionStudioAuditLog.actor_user_id == actorUserId)
    if entityType:
        stmt = stmt.where(AxionStudioAuditLog.entity_type == entityType.strip().upper())
    rows = db.scalars(stmt.order_by(AxionStudioAuditLog.created_at.desc()).limit(300)).all()
    return [
        AxionStudioAuditLogOut(
            id=row.id,
            actorUserId=row.actor_user_id,
            action=row.action,
            entityType=row.entity_type,
            entityId=row.entity_id,
            diff=row.diff if isinstance(row.diff, dict) else {},
            createdAt=row.created_at,
        )
        for row in rows
    ]


@router.get("/api/platform-admin/axion/users", response_model=list[AxionStudioUserOption])
def preview_users(
    db: DBSession,
    user: Annotated[User, Depends(get_current_user)],
) -> list[AxionStudioUserOption]:
    _require_platform_admin(user)
    rows = db.scalars(
        select(User)
        .join(Membership, Membership.user_id == User.id)
        .where(Membership.role == MembershipRole.CHILD)
        .order_by(User.name.asc())
    ).all()
    dedup: dict[int, AxionStudioUserOption] = {}
    for row in rows:
        dedup[row.id] = AxionStudioUserOption(userId=row.id, name=row.name, email=row.email)
    return list(dedup.values())


@router.get("/api/platform-admin/axion/impact", response_model=AxionImpactResponse)
def axion_impact(
    db: DBSession,
    user: Annotated[User, Depends(get_current_user)],
    userId: int = Query(...),
    days: int = Query(default=7),
) -> AxionImpactResponse:
    _require_platform_admin(user)
    summary = computeAxionImpact(db, userId=userId, days=max(1, days))
    return AxionImpactResponse(
        userId=userId,
        days=max(1, days),
        decisionsTotal=int(summary["decisionsTotal"]),
        improvementRatePercent=float(summary["improvementRatePercent"]),
        avgXpDeltaAfterBoost=float(summary["avgXpDeltaAfterBoost"]),
        avgFrustrationDeltaAfterDifficultyCap=float(summary["avgFrustrationDeltaAfterDifficultyCap"]),
        avgDropoutRiskDelta=float(summary["avgDropoutRiskDelta"]),
        masteryGrowthProxy=float(summary["masteryGrowthProxy"]),
    )


@router.post("/api/platform-admin/axion/preview", response_model=AxionPreviewResponse)
async def preview_axion(
    payload: AxionPreviewRequest,
    request: Request,
    db: DBSession,
    user: Annotated[User, Depends(get_current_user)],
) -> AxionPreviewResponse:
    _require_platform_admin(user)
    await _rate_limit_preview(request, user_id=user.id)
    context = _validate_context(payload.context)
    facts = buildAxionFacts(db, userId=payload.userId)
    state = computeAxionState(userId=payload.userId, db=db)
    actions, matched_rules = evaluate_policies(
        db,
        state=state,
        context=context,
        extra={
            "dueReviews": int(facts.get("dueReviewsCount", 0)),
            "weeklyCompletionRate": float(facts.get("weeklyCompletionRate", 0)),
            "streakDays": int(facts.get("streakDays", 0)),
            "energyCurrent": int((facts.get("energy") or {}).get("current", 0)),
            "recentApproved": int((facts.get("recentApprovals") or {}).get("approved", 0)),
            "recentRejected": int((facts.get("recentApprovals") or {}).get("rejected", 0)),
        },
        user_id=payload.userId,
    )
    message_facts = dict(facts)
    message_facts["energy"] = int((facts.get("energy") or {}).get("current", 0))
    message_facts["streak"] = int(facts.get("streakDays", 0))
    message_facts["dueReviews"] = int(facts.get("dueReviewsCount", 0))
    msg_snapshot = generate_axion_message(
        db,
        user_id=payload.userId,
        context=context,
        state=state,
        recent_facts=message_facts,
        record_history=False,
    )
    cta = _map_cta(actions, due_reviews=int(message_facts["dueReviews"]))
    return AxionPreviewResponse(
        state={
            "trend": "UP" if float(state.learning_momentum) > 0.08 else "DOWN" if float(state.learning_momentum) < -0.08 else "STABLE",
            "focus": "calm" if float(state.frustration_score) > 0.65 else "challenge" if float(state.confidence_score) > 0.75 else "steady",
        },
        facts={
            "streak": int(facts.get("streakDays", 0)),
            "dueReviews": int(facts.get("dueReviewsCount", 0)),
            "energy": int((facts.get("energy") or {}).get("current", 0)),
            "weakestSkill": ((facts.get("weakestSkills") or [{}])[0]).get("name", "Sem dados"),
            "strongestSkill": ((facts.get("strongestSkills") or [{}])[0]).get("name", "Sem dados"),
        },
        actions=actions,
        message=msg_snapshot.message,
        tone=msg_snapshot.tone,
        cta=cta,
        chosenRuleIds=[int(item.get("id", 0)) for item in matched_rules if int(item.get("id", 0)) > 0],
        chosenTemplateId=int(msg_snapshot.template_id) if msg_snapshot.template_id else None,
    )

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from secrets import token_urlsafe

from app.api.deps import DBSession, EventSvc, get_current_tenant, get_current_user, require_role
from app.core.config import settings
from app.core.security import hash_password, validate_password_strength
from app.models import ChildGuardian, ChildProfile, FamilyGuardianInvitation, Membership, MembershipRole, Tenant, TenantType, User
from app.schemas.children import (
    ChildGuardianOut,
    ChildOut,
    FamilyChildCreateRequest,
    FamilyEnableChildLoginRequest,
    FamilyEnableChildLoginResponse,
    FamilyChildOut,
    FamilyGuardianAcceptInviteRequest,
    FamilyGuardianAcceptInviteResponse,
    FamilyGuardianInviteRequest,
    FamilyGuardianInviteResponse,
)

router = APIRouter(prefix="/family", tags=["family"])


def _ensure_family_tenant(tenant: Tenant, *, detail: str) -> None:
    if tenant.type != TenantType.FAMILY:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


def _to_child_out(child: ChildProfile) -> ChildOut:
    return ChildOut(
        id=child.id,
        display_name=child.display_name,
        avatar_key=child.avatar_key,
        date_of_birth=child.date_of_birth,
        birth_year=child.birth_year,
        needs_profile_completion=child.needs_profile_completion,
        theme=child.theme,
        avatar_stage=child.avatar_stage,
    )


@router.get("/children", response_model=list[FamilyChildOut])
def list_family_children(
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    _: Annotated[Membership, Depends(require_role(["PARENT", "GUARDIAN"]))],
) -> list[FamilyChildOut]:
    _ensure_family_tenant(tenant, detail="Family child listing is only allowed for family tenants")

    rows = db.execute(
        select(ChildProfile, ChildGuardian, User)
        .outerjoin(ChildGuardian, ChildGuardian.child_id == ChildProfile.id)
        .outerjoin(User, User.id == ChildGuardian.user_id)
        .where(
            ChildProfile.tenant_id == tenant.id,
            ChildProfile.deleted_at.is_(None),
        )
        .order_by(ChildProfile.id.asc(), ChildGuardian.id.asc()),
    ).all()

    children_by_id: dict[int, FamilyChildOut] = {}
    for child, guardian, user in rows:
        existing = children_by_id.get(child.id)
        if existing is None:
            existing = FamilyChildOut(
                id=child.id,
                name=child.display_name,
                birth_date=child.date_of_birth,
                guardians=[],
            )
            children_by_id[child.id] = existing

        if guardian is not None and user is not None:
            existing.guardians.append(
                ChildGuardianOut(
                    user_id=user.id,
                    name=user.name,
                    email=user.email,
                    relationship=guardian.relationship,
                )
            )

    return list(children_by_id.values())


def _resolve_invite_base_url() -> str:
    origin = settings.cors_allowed_origins.split(",")[0].strip()
    return origin.rstrip("/") if origin else "http://localhost:3000"


@router.post("/invite-guardian", response_model=FamilyGuardianInviteResponse, status_code=status.HTTP_201_CREATED)
def invite_family_guardian(
    payload: FamilyGuardianInviteRequest,
    db: DBSession,
    events: EventSvc,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    _: Annotated[Membership, Depends(require_role(["PARENT"]))],
) -> FamilyGuardianInviteResponse:
    _ensure_family_tenant(tenant, detail="Guardian invitations are only allowed for family tenants")

    normalized_email = payload.email.strip().lower()
    if not normalized_email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email is required")

    token = token_urlsafe(32)
    expires_at = datetime.now(UTC) + timedelta(days=7)
    invitation = FamilyGuardianInvitation(
        tenant_id=tenant.id,
        email=normalized_email,
        relationship=payload.relationship.strip().lower(),
        token=token,
        invited_by_user_id=user.id,
        expires_at=expires_at,
    )
    db.add(invitation)
    db.flush()

    invite_link = f"{_resolve_invite_base_url()}/accept-guardian-invite?token={token}"
    events.emit(
        type="family.guardian.invited",
        tenant_id=tenant.id,
        actor_user_id=user.id,
        payload={
            "invitation_id": invitation.id,
            "email": normalized_email,
            "relationship": invitation.relationship,
            "invite_link": invite_link,
        },
    )
    db.commit()
    return FamilyGuardianInviteResponse(
        message="Guardian invitation created",
        invite_token=token,
        invite_link=invite_link,
        expires_at=expires_at,
    )


@router.post("/accept-guardian-invite", response_model=FamilyGuardianAcceptInviteResponse)
def accept_family_guardian_invite(
    payload: FamilyGuardianAcceptInviteRequest,
    db: DBSession,
) -> FamilyGuardianAcceptInviteResponse:
    invitation = db.scalar(select(FamilyGuardianInvitation).where(FamilyGuardianInvitation.token == payload.token))
    if invitation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found")
    if invitation.accepted_at is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Invitation already accepted")
    if invitation.expires_at < datetime.now(UTC):
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Invitation expired")

    tenant = db.get(Tenant, invitation.tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    _ensure_family_tenant(tenant, detail="Guardian invitations are only allowed for family tenants")

    user = db.scalar(select(User).where(User.email == invitation.email))
    if user is None:
        if not payload.name or not payload.name.strip():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Name is required to accept this invitation")
        if not payload.password:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password is required to accept this invitation")
        password_error = validate_password_strength(payload.password)
        if password_error is not None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=password_error)

        user = User(
            email=invitation.email,
            name=payload.name.strip(),
            password_hash=hash_password(payload.password),
        )
        db.add(user)
        db.flush()

    membership = db.scalar(
        select(Membership).where(
            Membership.user_id == user.id,
            Membership.tenant_id == tenant.id,
        )
    )
    if membership is None:
        membership = Membership(
            tenant_id=tenant.id,
            user_id=user.id,
            role=MembershipRole.GUARDIAN,
        )
        db.add(membership)
    elif membership.role not in {MembershipRole.GUARDIAN, MembershipRole.PARENT}:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User already belongs to this tenant with an incompatible role")

    children = db.scalars(
        select(ChildProfile).where(
            ChildProfile.tenant_id == tenant.id,
            ChildProfile.deleted_at.is_(None),
        )
    ).all()

    linked_children_count = 0
    for child in children:
        existing_guardian = db.scalar(
            select(ChildGuardian).where(
                ChildGuardian.child_id == child.id,
                ChildGuardian.user_id == user.id,
            )
        )
        if existing_guardian is not None:
            continue
        db.add(
            ChildGuardian(
                child_id=child.id,
                user_id=user.id,
                relationship=invitation.relationship,
            )
        )
        linked_children_count += 1

    invitation.accepted_by_user_id = user.id
    invitation.accepted_at = datetime.now(UTC)
    db.commit()
    return FamilyGuardianAcceptInviteResponse(
        message="Guardian invitation accepted",
        tenant_slug=tenant.slug,
        linked_children_count=linked_children_count,
    )


@router.post("/children/{child_id}/enable-login", response_model=FamilyEnableChildLoginResponse)
def enable_family_child_login(
    child_id: int,
    payload: FamilyEnableChildLoginRequest,
    db: DBSession,
    events: EventSvc,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    _: Annotated[Membership, Depends(require_role(["PARENT", "GUARDIAN"]))],
) -> FamilyEnableChildLoginResponse:
    _ensure_family_tenant(tenant, detail="Child login enablement is only allowed for family tenants")

    child = db.scalar(
        select(ChildProfile).where(
            ChildProfile.id == child_id,
            ChildProfile.tenant_id == tenant.id,
            ChildProfile.deleted_at.is_(None),
        )
    )
    if child is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child not found")
    if child.user_id is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Child login is already enabled")

    normalized_email = payload.email.strip().lower()
    if not normalized_email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email is required")
    existing_user = db.scalar(select(User).where(User.email == normalized_email))
    if existing_user is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already in use")

    password_error = validate_password_strength(payload.password)
    if password_error is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=password_error)

    child_user = User(
        email=normalized_email,
        name=(payload.name or child.display_name).strip(),
        password_hash=hash_password(payload.password),
    )
    db.add(child_user)
    db.flush()

    child.user_id = child_user.id
    membership = db.scalar(
        select(Membership).where(
            Membership.user_id == child_user.id,
            Membership.tenant_id == tenant.id,
        )
    )
    if membership is None:
        db.add(
            Membership(
                tenant_id=tenant.id,
                user_id=child_user.id,
                role=MembershipRole.CHILD,
            )
        )

    events.emit(
        type="family.child_login_enabled",
        tenant_id=tenant.id,
        actor_user_id=user.id,
        child_id=child.id,
        payload={"child_id": child.id, "user_id": child_user.id, "email": child_user.email},
    )
    db.commit()
    return FamilyEnableChildLoginResponse(
        child_id=child.id,
        user_id=child_user.id,
        email=child_user.email,
        name=child_user.name,
    )


@router.post("/children", response_model=ChildOut, status_code=status.HTTP_201_CREATED)
def create_family_child(
    payload: FamilyChildCreateRequest,
    db: DBSession,
    events: EventSvc,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    _: Annotated[Membership, Depends(require_role(["PARENT", "GUARDIAN"]))],
) -> ChildOut:
    _ensure_family_tenant(tenant, detail="Family child creation is only allowed for family tenants")

    child = ChildProfile(
        tenant_id=tenant.id,
        created_by_user_id=user.id,
        display_name=payload.name,
        date_of_birth=payload.birth_date,
        birth_year=payload.birth_date.year,
        needs_profile_completion=False,
        theme="default",
        avatar_stage=1,
        xp_total=0,
    )
    db.add(child)
    db.flush()
    db.add(
        ChildGuardian(
            child_id=child.id,
            user_id=user.id,
            relationship="guardian",
        )
    )
    events.emit(
        type="child.created",
        tenant_id=tenant.id,
        actor_user_id=user.id,
        child_id=child.id,
        payload={"child_id": child.id, "source": "family.children.create"},
    )
    db.commit()
    return _to_child_out(child)

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from app.api.deps import DBSession, get_current_tenant, get_current_user, require_role
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models import ChildProfile, Membership, MembershipRole, Tenant, TenantType, User
from app.schemas.auth import (
    AuthTokens,
    ChildProfileOut,
    LoginRequest,
    MeResponse,
    MembershipOut,
    MessageResponse,
    RefreshRequest,
    SignupRequest,
    UserOut,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", response_model=AuthTokens, status_code=status.HTTP_201_CREATED)
def signup(payload: SignupRequest, db: DBSession) -> AuthTokens:
    existing_user = db.scalar(select(User).where(User.email == payload.email))
    if existing_user is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already in use")

    existing_tenant = db.scalar(select(Tenant).where(Tenant.slug == payload.tenant_slug))
    if existing_tenant is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Tenant slug already in use")

    tenant = Tenant(
        type=TenantType.FAMILY,
        name=payload.tenant_name,
        slug=payload.tenant_slug,
    )
    user = User(
        email=payload.email,
        name=payload.name,
        password_hash=hash_password(payload.password),
    )
    db.add(tenant)
    db.add(user)
    db.flush()

    membership = Membership(
        tenant_id=tenant.id,
        user_id=user.id,
        role=MembershipRole.PARENT,
    )
    db.add(membership)
    db.commit()

    access_token = create_access_token(
        user_id=user.id,
        tenant_id=tenant.id,
        role=membership.role.value,
    )
    refresh_token = create_refresh_token(
        user_id=user.id,
        tenant_id=tenant.id,
        role=membership.role.value,
    )
    return AuthTokens(access_token=access_token, refresh_token=refresh_token)


@router.post("/login", response_model=AuthTokens)
def login(
    payload: LoginRequest,
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
) -> AuthTokens:
    user = db.scalar(select(User).where(User.email == payload.email))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    membership = db.scalar(
        select(Membership).where(
            Membership.user_id == user.id,
            Membership.tenant_id == tenant.id,
        ),
    )
    if membership is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is not in this tenant")

    if membership.role == MembershipRole.CHILD:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Children cannot login in MVP")

    access_token = create_access_token(
        user_id=user.id,
        tenant_id=tenant.id,
        role=membership.role.value,
    )
    refresh_token = create_refresh_token(
        user_id=user.id,
        tenant_id=tenant.id,
        role=membership.role.value,
    )
    return AuthTokens(access_token=access_token, refresh_token=refresh_token)


@router.post("/refresh", response_model=AuthTokens)
def refresh(
    payload: RefreshRequest,
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
) -> AuthTokens:
    try:
        claims = decode_token(payload.refresh_token)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token") from exc

    if claims.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token type")

    sub = claims.get("sub")
    token_tenant_id = claims.get("tenant_id")
    if not isinstance(sub, str) or not sub.isdigit() or not isinstance(token_tenant_id, int):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Malformed refresh token")

    if token_tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Tenant mismatch in refresh token")

    user = db.get(User, int(sub))
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    membership = db.scalar(
        select(Membership).where(
            Membership.user_id == user.id,
            Membership.tenant_id == tenant.id,
        ),
    )
    if membership is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is not in this tenant")

    if membership.role == MembershipRole.CHILD:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Children cannot login in MVP")

    access_token = create_access_token(
        user_id=user.id,
        tenant_id=tenant.id,
        role=membership.role.value,
    )
    refresh_token = create_refresh_token(
        user_id=user.id,
        tenant_id=tenant.id,
        role=membership.role.value,
    )
    return AuthTokens(access_token=access_token, refresh_token=refresh_token)


@router.post("/logout", response_model=MessageResponse)
def logout() -> MessageResponse:
    return MessageResponse(message="Logged out")


@router.get("/me", response_model=MeResponse)
def me(
    db: DBSession,
    user: Annotated[User, Depends(get_current_user)],
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    _: Annotated[Membership, Depends(require_role(["PARENT", "TEACHER"]))],
) -> MeResponse:
    membership = db.scalar(
        select(Membership).where(
            Membership.user_id == user.id,
            Membership.tenant_id == tenant.id,
        ),
    )
    if membership is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is not in this tenant")

    children = db.scalars(
        select(ChildProfile).where(ChildProfile.tenant_id == tenant.id).order_by(ChildProfile.id.asc()),
    ).all()

    return MeResponse(
        user=UserOut(
            id=user.id,
            email=user.email,
            name=user.name,
            created_at=user.created_at,
        ),
        membership=MembershipOut(
            role=membership.role.value,
            tenant_id=tenant.id,
            tenant_slug=tenant.slug,
            onboarding_completed=tenant.onboarding_completed,
        ),
        child_profiles=[
            ChildProfileOut(
                id=child.id,
                display_name=child.display_name,
                avatar_key=child.avatar_key,
                birth_year=child.birth_year,
            )
            for child in children
        ],
    )

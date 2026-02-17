from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select

from app.api.deps import DBSession, get_current_tenant, get_current_user, require_role
from app.core.config import settings
from app.core.security import (
    CSRF_COOKIE_NAME,
    REFRESH_COOKIE_NAME,
    create_access_token,
    create_refresh_token,
    decode_token,
    generate_csrf_token,
    hash_password,
    validate_password_strength,
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


def _set_auth_cookies(response: Response, refresh_token: str, csrf_token: str) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=refresh_token,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite="strict",
        max_age=int(timedelta(days=7).total_seconds()),
        path="/auth",
        domain=settings.auth_cookie_domain,
    )
    response.set_cookie(
        key=CSRF_COOKIE_NAME,
        value=csrf_token,
        httponly=False,
        secure=settings.auth_cookie_secure,
        samesite="strict",
        max_age=int(timedelta(days=7).total_seconds()),
        path="/",
        domain=settings.auth_cookie_domain,
    )


@router.post("/signup", response_model=AuthTokens, status_code=status.HTTP_201_CREATED)
def signup(payload: SignupRequest, db: DBSession, response: Response) -> AuthTokens:
    existing_user = db.scalar(select(User).where(User.email == payload.email))
    if existing_user is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already in use")

    existing_tenant = db.scalar(select(Tenant).where(Tenant.slug == payload.tenant_slug))
    if existing_tenant is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Tenant slug already in use")

    password_error = validate_password_strength(payload.password)
    if password_error is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=password_error)

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
    _set_auth_cookies(response, refresh_token, generate_csrf_token())
    return AuthTokens(access_token=access_token, refresh_token=refresh_token)


@router.post("/login", response_model=AuthTokens)
def login(
    payload: LoginRequest,
    db: DBSession,
    response: Response,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
) -> AuthTokens:
    user = db.scalar(select(User).where(User.email == payload.email))
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if user.locked_until is not None and user.locked_until > datetime.now(UTC):
        raise HTTPException(status_code=status.HTTP_423_LOCKED, detail="Account temporarily locked")

    if not verify_password(payload.password, user.password_hash):
        user.failed_login_attempts += 1
        if user.failed_login_attempts >= settings.account_lock_max_attempts:
            user.locked_until = datetime.now(UTC) + timedelta(minutes=settings.account_lock_minutes)
            user.failed_login_attempts = 0
            db.commit()
            raise HTTPException(status_code=status.HTTP_423_LOCKED, detail="Account temporarily locked")
        db.commit()
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
    user.failed_login_attempts = 0
    user.locked_until = None
    _set_auth_cookies(response, refresh_token, generate_csrf_token())
    db.commit()
    return AuthTokens(access_token=access_token, refresh_token=refresh_token)


@router.post("/refresh", response_model=AuthTokens)
def refresh(
    payload: RefreshRequest,
    request: Request,
    response: Response,
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
) -> AuthTokens:
    refresh_token = payload.refresh_token or request.cookies.get(REFRESH_COOKIE_NAME)
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing refresh token")

    try:
        claims = decode_token(refresh_token)
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
    _set_auth_cookies(response, refresh_token, generate_csrf_token())
    return AuthTokens(access_token=access_token, refresh_token=refresh_token)


@router.post("/logout", response_model=MessageResponse)
def logout(response: Response) -> MessageResponse:
    response.delete_cookie(
        key=REFRESH_COOKIE_NAME,
        path="/auth",
        domain=settings.auth_cookie_domain,
        secure=settings.auth_cookie_secure,
        samesite="strict",
    )
    response.delete_cookie(
        key=CSRF_COOKIE_NAME,
        path="/",
        domain=settings.auth_cookie_domain,
        secure=settings.auth_cookie_secure,
        samesite="strict",
    )
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
        select(ChildProfile)
        .where(ChildProfile.tenant_id == tenant.id, ChildProfile.deleted_at.is_(None))
        .order_by(ChildProfile.id.asc()),
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
                theme=child.theme,
                avatar_stage=child.avatar_stage,
            )
            for child in children
        ],
    )

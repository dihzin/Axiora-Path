from __future__ import annotations

from collections.abc import Callable, Iterator
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import decode_token
from app.db.session import SessionLocal
from app.models import Membership, Tenant, User
from app.services.events import EventService

auth_scheme = HTTPBearer(auto_error=False)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


DBSession = Annotated[Session, Depends(get_db)]


def get_event_service(db: DBSession) -> EventService:
    return EventService(db)


EventSvc = Annotated[EventService, Depends(get_event_service)]


def get_current_tenant(
    db: DBSession,
    request: Request,
    x_tenant_slug: Annotated[str | None, Header(alias="X-Tenant-Slug")] = None,
) -> Tenant:
    if not x_tenant_slug:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-Tenant-Slug header is required",
        )

    tenant = db.scalar(select(Tenant).where(Tenant.slug == x_tenant_slug, Tenant.deleted_at.is_(None)))
    if tenant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found",
        )
    request.state.tenant_id = tenant.id
    return tenant


def get_current_user(
    db: DBSession,
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(auth_scheme)],
) -> User:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization token",
        )

    try:
        payload = decode_token(credentials.credentials)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        ) from exc

    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid access token",
        )

    sub = payload.get("sub")
    if not isinstance(sub, str) or not sub.isdigit():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token subject",
        )

    user = db.get(User, int(sub))
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    # Guest multiplayer tokens are sandboxed to multiplayer endpoints only.
    if payload.get("guest_mode") is True:
        path = request.url.path or ""
        if not path.startswith("/api/games/multiplayer"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Guest token cannot access this route",
            )

    request.state.user_id = user.id
    return user


def get_current_membership(
    db: DBSession,
    user: Annotated[User, Depends(get_current_user)],
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
) -> Membership:
    membership = db.scalar(
        select(Membership).where(
            Membership.user_id == user.id,
            Membership.tenant_id == tenant.id,
        ),
    )
    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is not a member of this tenant",
        )
    return membership


def require_role(roles: list[str]) -> Callable[[Membership], Membership]:
    allowed = set(roles)

    def dependency(
        membership: Annotated[Membership, Depends(get_current_membership)],
    ) -> Membership:
        if membership.role.value not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient role",
            )
        return membership

    return dependency

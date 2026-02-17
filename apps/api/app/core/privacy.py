from __future__ import annotations

from fastapi import Request
from fastapi.responses import JSONResponse
from sqlalchemy import select
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

from app.db.session import SessionLocal
from app.models import ParentalConsent, Tenant

_ALLOWED_PREFIXES = (
    "/health",
    "/auth/",
    "/legal",
    "/docs",
    "/redoc",
    "/openapi.json",
)


def _is_allowed_path(path: str) -> bool:
    if path == "/health" or path == "/legal":
        return True
    return any(path.startswith(prefix) for prefix in _ALLOWED_PREFIXES)


class PrivacyConsentMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if _is_allowed_path(request.url.path):
            return await call_next(request)

        tenant_slug = request.headers.get("X-Tenant-Slug")
        if not tenant_slug:
            return await call_next(request)

        db = SessionLocal()
        try:
            tenant = db.scalar(select(Tenant).where(Tenant.slug == tenant_slug, Tenant.deleted_at.is_(None)))
            if tenant is None:
                return await call_next(request)

            consent = db.get(ParentalConsent, tenant.id)
            consent_ok = (
                consent is not None
                and consent.accepted_terms_at is not None
                and consent.accepted_privacy_at is not None
            )
            if not consent_ok:
                return JSONResponse(
                    status_code=403,
                    content={
                        "code": "PARENTAL_CONSENT_REQUIRED",
                        "message": "Parental consent required",
                    },
                )
        finally:
            db.close()

        return await call_next(request)

from __future__ import annotations

import re

from fastapi import Request
from fastapi.responses import JSONResponse
from sqlalchemy import select
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

from app.db.session import SessionLocal
from app.models import Tenant
from app.services.features import is_feature_enabled

_DAILY_MISSION_PATTERNS = (
    re.compile(r"^/children/\d+/daily-mission$"),
    re.compile(r"^/children/\d+/daily-mission/history$"),
    re.compile(r"^/daily-mission/[^/]+/complete$"),
)


def _is_daily_mission_path(path: str) -> bool:
    return any(pattern.match(path) for pattern in _DAILY_MISSION_PATTERNS)


class DailyMissionsFeatureMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if not _is_daily_mission_path(request.url.path):
            return await call_next(request)

        tenant_slug = request.headers.get("X-Tenant-Slug")
        if not tenant_slug:
            return await call_next(request)

        db = SessionLocal()
        try:
            tenant = db.scalar(select(Tenant).where(Tenant.slug == tenant_slug, Tenant.deleted_at.is_(None)))
            if tenant is None:
                return await call_next(request)

            if not is_feature_enabled("feature_daily_missions", db, tenant_id=tenant.id):
                return JSONResponse(
                    status_code=403,
                    content={
                        "code": "FEATURE_DISABLED",
                        "message": "Feature is disabled for this tenant",
                    },
                )
        finally:
            db.close()

        return await call_next(request)

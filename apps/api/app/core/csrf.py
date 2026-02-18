from __future__ import annotations

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

from app.core.config import settings
from app.core.security import CSRF_COOKIE_NAME, REFRESH_COOKIE_NAME

_SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
_PROTECTED_PATHS = {"/auth/refresh", "/auth/logout"}


def _is_exempt_path(path: str) -> bool:
    raw_items = settings.csrf_exempt_paths.split(",")
    exempt_paths = [item.strip() for item in raw_items if item.strip()]
    return path in exempt_paths


class CSRFMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.method.upper() in _SAFE_METHODS or _is_exempt_path(request.url.path):
            return await call_next(request)

        has_cookie_session = request.cookies.get(REFRESH_COOKIE_NAME) is not None
        # If the request is not using cookie-session auth, skip CSRF check.
        # The frontend sends refresh token via JSON body in this project.
        if not has_cookie_session:
            return await call_next(request)

        if request.url.path not in _PROTECTED_PATHS:
            return await call_next(request)

        csrf_cookie = request.cookies.get(CSRF_COOKIE_NAME)
        csrf_header = request.headers.get("X-CSRF-Token")
        if not csrf_cookie or not csrf_header or csrf_cookie != csrf_header:
            return JSONResponse(
                status_code=403,
                content={"code": "CSRF_VALIDATION_FAILED", "message": "CSRF token validation failed"},
            )

        return await call_next(request)

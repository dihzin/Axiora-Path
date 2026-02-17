from __future__ import annotations

import logging
from time import perf_counter
from uuid import uuid4

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

logger = logging.getLogger("axiora.api.request")


def _resolve_route(request: Request) -> str:
    route = request.scope.get("route")
    route_path = getattr(route, "path", None)
    if isinstance(route_path, str):
        return route_path
    return request.url.path


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        started = perf_counter()
        request_id = request.headers.get("X-Request-Id") or str(uuid4())
        request.state.request_id = request_id

        try:
            response = await call_next(request)
        except Exception:
            elapsed_ms = round((perf_counter() - started) * 1000, 2)
            logger.exception(
                "request.failed",
                extra={
                    "request_id": request_id,
                    "tenant_id": getattr(request.state, "tenant_id", None),
                    "user_id": getattr(request.state, "user_id", None),
                    "route": _resolve_route(request),
                    "method": request.method,
                    "status_code": 500,
                    "execution_time_ms": elapsed_ms,
                    "provider_targets": ["datadog", "logtail", "elk"],
                },
            )
            raise

        elapsed_ms = round((perf_counter() - started) * 1000, 2)
        logger.info(
            "request.completed",
            extra={
                "request_id": request_id,
                "tenant_id": getattr(request.state, "tenant_id", None),
                "user_id": getattr(request.state, "user_id", None),
                "route": _resolve_route(request),
                "method": request.method,
                "status_code": response.status_code,
                "execution_time_ms": elapsed_ms,
                "provider_targets": ["datadog", "logtail", "elk"],
            },
        )
        response.headers["X-Request-Id"] = request_id
        return response

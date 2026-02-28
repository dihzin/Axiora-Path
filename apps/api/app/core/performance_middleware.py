from __future__ import annotations

import json
import logging
import os
from time import perf_counter

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

from app.core.query_counter import finish_request_query_counter, start_request_query_counter


def _is_perf_monitor_enabled() -> bool:
    return os.getenv("PERF_MONITOR", "false").strip().lower() == "true"


def _build_performance_logger() -> logging.Logger:
    logger = logging.getLogger("axiora.api.performance")
    if logger.handlers:
        return logger

    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    logger.propagate = False
    return logger


performance_logger = _build_performance_logger()


class PerformanceMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if not _is_perf_monitor_enabled():
            return await call_next(request)

        started = perf_counter()
        query_counter_tokens = start_request_query_counter()
        status_code = 500

        try:
            response = await call_next(request)
            status_code = response.status_code
            return response
        finally:
            duration_ms = round((perf_counter() - started) * 1000)
            query_count = finish_request_query_counter(query_counter_tokens)
            payload = {
                "type": "performance",
                "endpoint": request.url.path,
                "method": request.method,
                "status": status_code,
                "duration_ms": duration_ms,
                "query_count": query_count,
            }
            performance_logger.info(json.dumps(payload, ensure_ascii=True))

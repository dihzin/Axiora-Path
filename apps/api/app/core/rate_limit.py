from __future__ import annotations

from dataclasses import dataclass

from fastapi import Request
from fastapi.responses import JSONResponse
from redis.asyncio import Redis
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response


@dataclass(frozen=True)
class RateLimitRule:
    key_prefix: str
    limit: int
    window_seconds: int


GLOBAL_RULE = RateLimitRule(key_prefix="global", limit=100, window_seconds=60)
LOGIN_RULE = RateLimitRule(key_prefix="login", limit=10, window_seconds=300)


def _extract_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


async def _increment_and_check(redis: Redis, *, rule: RateLimitRule, ip: str) -> bool:
    key = f"rate:{rule.key_prefix}:{ip}"
    value = await redis.incr(key)
    if value == 1:
        await redis.expire(key, rule.window_seconds)
    return int(value) <= rule.limit


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        redis: Redis | None = request.app.state.redis
        if redis is None:
            return await call_next(request)

        ip = _extract_ip(request)
        try:
            allowed_global = await _increment_and_check(redis, rule=GLOBAL_RULE, ip=ip)
            if not allowed_global:
                return JSONResponse(
                    status_code=429,
                    content={"code": "RATE_LIMIT", "message": "Too many requests"},
                )

            if request.url.path == "/auth/login" and request.method.upper() == "POST":
                allowed_login = await _increment_and_check(redis, rule=LOGIN_RULE, ip=ip)
                if not allowed_login:
                    return JSONResponse(
                        status_code=429,
                        content={"code": "RATE_LIMIT", "message": "Too many requests"},
                    )
        except Exception:
            # Keep API available if Redis is temporarily unavailable.
            return await call_next(request)

        return await call_next(request)

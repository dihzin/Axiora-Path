from __future__ import annotations

from dataclasses import dataclass

from fastapi import Request
from fastapi.responses import JSONResponse
from redis.asyncio import Redis
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

from app.core.config import settings


@dataclass(frozen=True)
class RateLimitRule:
    key_prefix: str
    limit: int
    window_seconds: int


GLOBAL_RULE = RateLimitRule(key_prefix="global", limit=100, window_seconds=60)
LOGIN_RULE = RateLimitRule(key_prefix="login", limit=10, window_seconds=300)
# Tools: geração envolve chamada LLM — limita por IP. O rate limit fino fica no
# anonymous_id (Redis, na rota), então o IP pode ser mais generoso para não
# penalizar NAT escolar (muitos alunos no mesmo IP).
TOOLS_GENERATE_RULE = RateLimitRule(key_prefix="tools_gen", limit=30, window_seconds=60)
# Checkout: evita criação massiva de sessões Stripe.
TOOLS_CHECKOUT_RULE = RateLimitRule(key_prefix="tools_checkout", limit=5, window_seconds=300)

LOGIN_PATHS = {"/auth/login", "/auth/login-primary"}
# Ambas as rotas de consumo de crédito anônimo são tratadas com o mesmo limite.
# /generate = fluxo LLM; /anon-use = fluxo gerador local (sheet-generator)
TOOLS_GENERATE_PATHS = {"/api/tools/generate", "/api/tools/anon-use"}
TOOLS_CHECKOUT_PATH = "/api/tools/checkout/create"


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
        # Local/dev should never be throttled by global API limits during normal navigation.
        if settings.app_env.strip().lower() == "development":
            return await call_next(request)

        redis: Redis | None = request.app.state.redis
        if redis is None:
            return await call_next(request)

        # Do not consume rate-limit budget with CORS preflight requests.
        if request.method.upper() == "OPTIONS":
            return await call_next(request)

        ip = _extract_ip(request)
        method = request.method.upper()
        path = request.url.path
        try:
            allowed_global = await _increment_and_check(redis, rule=GLOBAL_RULE, ip=ip)
            if not allowed_global:
                return JSONResponse(
                    status_code=429,
                    content={"code": "RATE_LIMIT", "message": "Too many requests"},
                )

            if path in LOGIN_PATHS and method == "POST":
                allowed_login = await _increment_and_check(redis, rule=LOGIN_RULE, ip=ip)
                if not allowed_login:
                    return JSONResponse(
                        status_code=429,
                        content={"code": "RATE_LIMIT", "message": "Too many requests"},
                    )

            if path in TOOLS_GENERATE_PATHS and method == "POST":
                allowed_gen = await _increment_and_check(redis, rule=TOOLS_GENERATE_RULE, ip=ip)
                if not allowed_gen:
                    return JSONResponse(
                        status_code=429,
                        content={"code": "RATE_LIMIT", "message": "Too many requests. Try again in a minute."},
                    )

            if path == TOOLS_CHECKOUT_PATH and method == "POST":
                allowed_checkout = await _increment_and_check(redis, rule=TOOLS_CHECKOUT_RULE, ip=ip)
                if not allowed_checkout:
                    return JSONResponse(
                        status_code=429,
                        content={"code": "RATE_LIMIT", "message": "Too many checkout attempts. Try again later."},
                    )

        except Exception:
            # Keep API available if Redis is temporarily unavailable.
            return await call_next(request)

        return await call_next(request)

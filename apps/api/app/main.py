from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from redis.asyncio import Redis

from app import models  # noqa: F401
from app.api.routes.ai import router as ai_router
from app.api.routes.achievements import router as achievements_router
from app.api.routes.analytics import router as analytics_router
from app.api.routes.audit import router as audit_router
from app.api.routes.auth import router as auth_router
from app.api.routes.axion import router as axion_router
from app.api.routes.children import router as children_router
from app.api.routes.export import router as export_router
from app.api.routes.features import router as features_router
from app.api.routes.legal import router as legal_router
from app.api.routes.mood import router as mood_router
from app.api.routes.onboarding import router as onboarding_router
from app.api.routes.recommendations import router as recommendations_router
from app.api.routes.routine import router as routine_router
from app.api.routes.sync import router as sync_router
from app.api.routes.wallet import router as wallet_router
from app.core.config import settings
from app.core.csrf import CSRFMiddleware
from app.core.exceptions import register_exception_handlers
from app.core.logging import setup_json_logging
from app.core.privacy import PrivacyConsentMiddleware
from app.core.rate_limit import RateLimitMiddleware
from app.core.request_logging import RequestLoggingMiddleware

setup_json_logging()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    redis = Redis.from_url(settings.redis_url, encoding="utf-8", decode_responses=True)
    app.state.redis = redis
    try:
        yield
    finally:
        await redis.aclose()


app = FastAPI(title="axiora-path api", lifespan=lifespan)
register_exception_handlers(app)
allowed_origins = [item.strip() for item in settings.cors_allowed_origins.split(",") if item.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Tenant-Slug", "X-CSRF-Token", "X-Request-Id"],
)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(PrivacyConsentMiddleware)
app.add_middleware(CSRFMiddleware)
app.add_middleware(RequestLoggingMiddleware)
app.include_router(ai_router)
app.include_router(achievements_router)
app.include_router(analytics_router)
app.include_router(audit_router)
app.include_router(auth_router)
app.include_router(axion_router)
app.include_router(children_router)
app.include_router(export_router)
app.include_router(features_router)
app.include_router(legal_router)
app.include_router(mood_router)
app.include_router(onboarding_router)
app.include_router(routine_router)
app.include_router(sync_router)
app.include_router(wallet_router)
app.include_router(recommendations_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}

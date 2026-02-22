from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from redis.asyncio import Redis

from app import models  # noqa: F401
from app.api.routes.ai import router as ai_router
from app.api.routes.achievements import router as achievements_router
from app.api.routes.aprender import router as aprender_router
from app.api.routes.analytics import router as analytics_router
from app.api.routes.audit import router as audit_router
from app.api.routes.auth import router as auth_router
from app.api.routes.axion import router as axion_router
from app.api.routes.axion_studio import router as axion_studio_router
from app.api.routes.children import router as children_router
from app.api.routes.coins import router as coins_router
from app.api.routes.daily_missions import router as daily_missions_router
from app.api.routes.export import router as export_router
from app.api.routes.features import router as features_router
from app.api.routes.game_settings import router as game_settings_router
from app.api.routes.games import router as games_router
from app.api.routes.games_multiplayer import router as games_multiplayer_router
from app.api.routes.legal import router as legal_router
from app.api.routes.learning_settings import router as learning_settings_router
from app.api.routes.learning import router as learning_router
from app.api.routes.mood import router as mood_router
from app.api.routes.onboarding import router as onboarding_router
from app.api.routes.recommendations import router as recommendations_router
from app.api.routes.retention import router as retention_router
from app.api.routes.routine import router as routine_router
from app.api.routes.sync import router as sync_router
from app.api.routes.store import router as store_router
from app.api.routes.wallet import router as wallet_router
from app.api.routes.user_ux_settings import router as user_ux_settings_router
from app.core.config import settings
from app.core.csrf import CSRFMiddleware
from app.core.exceptions import register_exception_handlers
from app.core.feature_gate import DailyMissionsFeatureMiddleware
from app.core.logging import setup_json_logging
from app.core.privacy import PrivacyConsentMiddleware
from app.core.rate_limit import RateLimitMiddleware
from app.core.request_logging import RequestLoggingMiddleware
from app.services.providers.config_validation import (
    validate_llm_provider_config_on_boot,
    validate_runtime_security_on_boot,
)

setup_json_logging()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    validate_llm_provider_config_on_boot()
    validate_runtime_security_on_boot()
    redis = Redis.from_url(settings.redis_url, encoding="utf-8", decode_responses=True)
    app.state.redis = redis
    try:
        yield
    finally:
        await redis.aclose()


app = FastAPI(title="axiora-path api", lifespan=lifespan)
register_exception_handlers(app)
allowed_origins = [item.strip() for item in settings.cors_allowed_origins.split(",") if item.strip()]
app.add_middleware(RateLimitMiddleware)
app.add_middleware(PrivacyConsentMiddleware)
app.add_middleware(DailyMissionsFeatureMiddleware)
app.add_middleware(CSRFMiddleware)
app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Tenant-Slug", "X-CSRF-Token", "X-Request-Id"],
)
app.include_router(ai_router)
app.include_router(achievements_router)
app.include_router(aprender_router)
app.include_router(analytics_router)
app.include_router(audit_router)
app.include_router(auth_router)
app.include_router(axion_router)
app.include_router(axion_studio_router)
app.include_router(children_router)
app.include_router(coins_router)
app.include_router(daily_missions_router)
app.include_router(export_router)
app.include_router(features_router)
app.include_router(game_settings_router)
app.include_router(games_router)
app.include_router(games_multiplayer_router)
app.include_router(legal_router)
app.include_router(learning_settings_router)
app.include_router(learning_router)
app.include_router(mood_router)
app.include_router(onboarding_router)
app.include_router(routine_router)
app.include_router(sync_router)
app.include_router(store_router)
app.include_router(wallet_router)
app.include_router(recommendations_router)
app.include_router(user_ux_settings_router)
app.include_router(retention_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "env": settings.app_env,
        "commit": settings.git_sha or "unknown",
        "build": settings.build_id or "unknown",
    }

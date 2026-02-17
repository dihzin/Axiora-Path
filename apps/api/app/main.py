from fastapi import FastAPI

from app import models  # noqa: F401
from app.api.routes.ai import router as ai_router
from app.api.routes.auth import router as auth_router
from app.api.routes.recommendations import router as recommendations_router
from app.api.routes.routine import router as routine_router
from app.api.routes.sync import router as sync_router
from app.api.routes.wallet import router as wallet_router

app = FastAPI(title="axiora-path api")
app.include_router(ai_router)
app.include_router(auth_router)
app.include_router(routine_router)
app.include_router(sync_router)
app.include_router(wallet_router)
app.include_router(recommendations_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}

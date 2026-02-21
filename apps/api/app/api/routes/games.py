from __future__ import annotations

from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from app.api.deps import DBSession, get_current_tenant, get_current_user, require_role
from app.models import ChildProfile, GameSettings, GameType, Membership, Tenant, User
from app.schemas.games import (
    DailyXpLimitOut,
    GameSessionCreateRequest,
    GameSessionOut,
    GameSessionRegisterResponse,
    UserGameProfileOut,
)
from app.schemas.game_engines import (
    FinishGameSessionResponse,
    GameAnswerRequest,
    GameAnswerResponse,
    GameCatalogItemOut,
    GamesCatalogResponse,
    StartGameSessionRequest,
    StartGameSessionResponse,
)
from app.services.gamification import MAX_XP_PER_DAY, registerGameSession
from app.services.learning_retention import MissionDelta, track_mission_progress

router = APIRouter(prefix="/api/games", tags=["games"])

_GAME_CATALOG: list[dict[str, object]] = [
    {
        "template_id": "7f9d501f-7c56-4690-9da5-bf1b95818801",
        "title": "Corrida da Soma",
        "subject": "Matemática",
        "age_group": "6-8",
        "engine_key": "QUIZ",
        "difficulty": "EASY",
        "status": "AVAILABLE",
        "description": "Desafios rápidos de soma com progresso por sessão.",
        "play_route": "/child/games/quiz",
        "estimated_minutes": 3,
        "xp_reward": 20,
        "coins_reward": 5,
        "tags": ["aritmética", "soma"],
    },
    {
        "template_id": "f3db2b95-89d8-4c1c-9cda-87fd357f7f9e",
        "title": "Mercado do Troco",
        "subject": "Educação Financeira",
        "age_group": "9-12",
        "engine_key": "SIMULATION",
        "difficulty": "MEDIUM",
        "status": "AVAILABLE",
        "description": "Simulação prática de decisões financeiras com eventos.",
        "play_route": "/child/games/finance-sim",
        "estimated_minutes": 5,
        "xp_reward": 30,
        "coins_reward": 8,
        "tags": ["troco", "decisão"],
    },
    {
        "template_id": "b1b7b17d-306f-4f95-8f42-3f1727205fe2",
        "title": "Pontos e Frases",
        "subject": "Português",
        "age_group": "9-12",
        "engine_key": "DRAG_DROP",
        "difficulty": "MEDIUM",
        "status": "COMING_SOON",
        "description": "Organize frases e pontuação em desafios progressivos.",
        "play_route": None,
        "estimated_minutes": 4,
        "xp_reward": 26,
        "coins_reward": 6,
        "tags": ["pontuação", "sintaxe"],
    },
    {
        "template_id": "f80b40cf-e8a9-4f3c-a2dd-c2d3cfe6d2fd",
        "title": "Compara Números",
        "subject": "Matemática",
        "age_group": "6-8",
        "engine_key": "QUIZ",
        "difficulty": "EASY",
        "status": "AVAILABLE",
        "description": "Compare números e avance em rodadas curtas.",
        "play_route": "/child/games/quiz",
        "estimated_minutes": 3,
        "xp_reward": 22,
        "coins_reward": 5,
        "tags": ["comparação", "números"],
    },
    {
        "template_id": "7a19ad6b-7480-4d0f-a9d1-d94a3b0a548f",
        "title": "Juros no Dia a Dia",
        "subject": "Educação Financeira",
        "age_group": "13-15",
        "engine_key": "SIMULATION",
        "difficulty": "HARD",
        "status": "COMING_SOON",
        "description": "Decisões de juros e orçamento em cenários avançados.",
        "play_route": None,
        "estimated_minutes": 6,
        "xp_reward": 40,
        "coins_reward": 12,
        "tags": ["juros", "planejamento"],
    },
    {
        "template_id": "7ed50523-7a97-4d65-a687-d2f878f2c199",
        "title": "Mapa de Capitais",
        "subject": "Geografia",
        "age_group": "9-12",
        "engine_key": "MEMORY",
        "difficulty": "MEDIUM",
        "status": "AVAILABLE",
        "description": "Treine memória ligando capitais às regiões corretas.",
        "play_route": "/child/games/memory",
        "estimated_minutes": 5,
        "xp_reward": 28,
        "coins_reward": 7,
        "tags": ["mapa", "capitais"],
    },
    {
        "template_id": "7d0b9986-f1d0-457f-936b-c6ad4cda0eba",
        "title": "Circuito de Frações",
        "subject": "Matemática",
        "age_group": "9-12",
        "engine_key": "QUIZ",
        "difficulty": "MEDIUM",
        "status": "AVAILABLE",
        "description": "Frações em missões curtas com feedback imediato.",
        "play_route": "/child/games/quiz",
        "estimated_minutes": 4,
        "xp_reward": 30,
        "coins_reward": 8,
        "tags": ["frações", "raciocínio"],
    },
    {
        "template_id": "72a462df-fe14-4479-beb5-e85e4d90d1f3",
        "title": "Ordem da Frase",
        "subject": "Português",
        "age_group": "6-8",
        "engine_key": "DRAG_DROP",
        "difficulty": "EASY",
        "status": "COMING_SOON",
        "description": "Monte frases com lógica e leitura guiada.",
        "play_route": None,
        "estimated_minutes": 3,
        "xp_reward": 20,
        "coins_reward": 5,
        "tags": ["frases", "leitura"],
    },
    {
        "template_id": "e2a87d87-df4c-4bb8-ac96-6fd274a469ac",
        "title": "Desafio do Bioma",
        "subject": "Ciências",
        "age_group": "9-12",
        "engine_key": "QUIZ",
        "difficulty": "MEDIUM",
        "status": "AVAILABLE",
        "description": "Exploração de biomas com perguntas dinâmicas.",
        "play_route": "/child/games/quiz",
        "estimated_minutes": 4,
        "xp_reward": 26,
        "coins_reward": 6,
        "tags": ["biomas", "natureza"],
    },
    {
        "template_id": "218f4fb3-848f-434e-a419-79d570dcfef9",
        "title": "Tática do Robô",
        "subject": "Lógica",
        "age_group": "13-15",
        "engine_key": "STRATEGY",
        "difficulty": "HARD",
        "status": "COMING_SOON",
        "description": "Missões táticas para fortalecer planejamento.",
        "play_route": None,
        "estimated_minutes": 6,
        "xp_reward": 38,
        "coins_reward": 11,
        "tags": ["estratégia", "planejamento"],
    },
    {
        "template_id": "63b8fdd6-a512-487f-b0a4-9860904f7558",
        "title": "Estação de Inglês",
        "subject": "Inglês",
        "age_group": "9-12",
        "engine_key": "QUIZ",
        "difficulty": "MEDIUM",
        "status": "AVAILABLE",
        "description": "Vocabulário e leitura em desafios rápidos.",
        "play_route": "/child/games/quiz",
        "estimated_minutes": 4,
        "xp_reward": 24,
        "coins_reward": 6,
        "tags": ["vocabulary", "listening"],
    },
    {
        "template_id": "cf9c56e9-92a2-4d5d-a9f8-38906f13fc8c",
        "title": "Laboratório Seguro",
        "subject": "Ciências",
        "age_group": "13-15",
        "engine_key": "SIMULATION",
        "difficulty": "HARD",
        "status": "COMING_SOON",
        "description": "Laboratório interativo com foco em segurança.",
        "play_route": None,
        "estimated_minutes": 7,
        "xp_reward": 42,
        "coins_reward": 12,
        "tags": ["experimento", "segurança"],
    },
]


@router.get("/catalog", response_model=GamesCatalogResponse)
def get_games_catalog(
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    __user: Annotated[User, Depends(get_current_user)],
    __membership: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
    ageGroup: str | None = None,
    subject: str | None = None,
    limit: int = 20,
) -> GamesCatalogResponse:
    _ = db, tenant
    normalized_age = ageGroup.strip() if ageGroup else None
    normalized_subject = subject.strip().lower() if subject else None
    max_limit = min(max(limit, 1), 100)
    filtered: list[GameCatalogItemOut] = []
    for raw in _GAME_CATALOG:
        if normalized_age and raw["age_group"] != normalized_age:
            continue
        if normalized_subject and str(raw["subject"]).lower() != normalized_subject:
            continue
        filtered.append(GameCatalogItemOut.model_validate(raw))
        if len(filtered) >= max_limit:
            break
    return GamesCatalogResponse(items=filtered)


@router.post("/session/start", response_model=StartGameSessionResponse)
def start_game_session_v1(
    payload: StartGameSessionRequest,
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    __user: Annotated[User, Depends(get_current_user)],
    __membership: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
) -> StartGameSessionResponse:
    _ = db, tenant
    match = next((item for item in _GAME_CATALOG if item["template_id"] == payload.template_id), None)
    if match is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Game template not found")
    runtime_config = {
        "difficulty": match["difficulty"],
        "estimatedMinutes": match["estimated_minutes"],
        "xpReward": match["xp_reward"],
        "coinsReward": match["coins_reward"],
    }
    return StartGameSessionResponse(
        sessionId=str(uuid4()),
        game={
            "engineKey": match["engine_key"],
            "runtimeConfig": runtime_config,
            "initialPayload": {"title": match["title"], "tags": match["tags"]},
        },
        axion={"difficultyMix": {"easy": 40, "medium": 45, "hard": 15}, "activeBoosts": []},
    )


@router.post("/session/{session_id}/answer", response_model=GameAnswerResponse)
def submit_game_answer(
    session_id: str,
    payload: GameAnswerRequest,
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    __user: Annotated[User, Depends(get_current_user)],
    __membership: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
) -> GameAnswerResponse:
    _ = session_id, db, tenant
    correct = bool(payload.answer.get("isCorrect", False))
    score_delta = 15 if correct else 0
    feedback = "Boa! Você avançou mais um passo." if correct else "Quase lá! Vamos tentar de novo com calma."
    signals = [
        {"signalType": "RESPONSE_TIME_MS", "value": float(payload.elapsed_ms)},
        {"signalType": "HINTS_USED", "value": float(payload.hints_used)},
    ]
    return GameAnswerResponse(
        correct=correct,
        scoreDelta=score_delta,
        feedback=feedback,
        cognitiveSignals=signals,
        nextStep=None,
    )


@router.post("/session/{session_id}/finish", response_model=FinishGameSessionResponse)
def finish_game_session_v1(
    session_id: str,
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    __user: Annotated[User, Depends(get_current_user)],
    __membership: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
) -> FinishGameSessionResponse:
    _ = db, tenant
    return FinishGameSessionResponse(
        sessionId=session_id,
        totalScore=100,
        accuracy=0.9,
        timeSpentMs=120000,
        xpEarned=30,
        coinsEarned=8,
        updatedSkills=[
            {"skillKey": "problem_solving", "mastery": 0.62, "confidence": 0.67, "velocity": 0.05},
        ],
    )


@router.post(
    "/session",
    response_model=GameSessionRegisterResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_game_session(
    payload: GameSessionCreateRequest,
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    __: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
) -> GameSessionRegisterResponse:
    children = db.scalars(
        select(ChildProfile).where(
            ChildProfile.tenant_id == tenant.id,
            ChildProfile.deleted_at.is_(None),
        ),
    ).all()
    settings: GameSettings | None = None
    max_xp_per_day = MAX_XP_PER_DAY
    if len(children) == 1:
        child_id = children[0].id
        settings = db.scalar(
            select(GameSettings).where(
                GameSettings.tenant_id == tenant.id,
                GameSettings.child_id == child_id,
            ),
        )
        if settings is not None:
            max_xp_per_day = settings.max_daily_xp

            game_enabled = settings.enabled_games.get(payload.game_type, True)
            if not game_enabled:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Game disabled by parental control")

    result = registerGameSession(
        db,
        user_id=user.id,
        game_type=GameType(payload.game_type),
        score=payload.score,
        max_xp_per_day=max_xp_per_day,
    )
    try:
        track_mission_progress(
            db,
            user_id=user.id,
            tenant_id=tenant.id,
            delta=MissionDelta(
                xp_gained=result.granted_xp,
                from_game=True,
            ),
            auto_claim=True,
        )
    except SQLAlchemyError:
        db.rollback()
    db.commit()

    return GameSessionRegisterResponse(
        profile=UserGameProfileOut(
            id=result.profile.id,
            userId=result.profile.user_id,
            xp=result.profile.xp,
            level=result.profile.level,
            axionCoins=result.profile.axion_coins,
            dailyXp=result.profile.daily_xp,
            lastXpReset=result.profile.last_xp_reset,
            createdAt=result.profile.created_at,
            updatedAt=result.profile.updated_at,
        ),
        session=GameSessionOut(
            id=result.session.id,
            userId=result.session.user_id,
            gameType=result.session.game_type.value,
            score=result.session.score,
            xpEarned=result.session.xp_earned,
            coinsEarned=result.session.coins_earned,
            createdAt=result.session.created_at,
        ),
        dailyLimit=DailyXpLimitOut(
            maxXpPerDay=result.max_xp_per_day,
            grantedXp=result.granted_xp,
            requestedXp=result.requested_xp,
            remainingXpToday=result.remaining_xp_today,
        ),
        unlockedAchievements=result.unlocked_achievements,
    )

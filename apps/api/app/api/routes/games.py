from __future__ import annotations

from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from app.api.deps import DBSession, get_current_tenant, get_current_user, require_role
from app.models import ChildProfile, GamePersonalBest, GameSettings, GameType, Membership, Tenant, User
from app.schemas.games import (
    DailyXpLimitOut,
    GameMetagameBadgeOut,
    GameMetagameClaimRequest,
    GameMetagameClaimResponse,
    GameMetagameMissionOut,
    GameMetagameStatsOut,
    GameMetagameStreakOut,
    GameMetagameSummaryResponse,
    GameLeagueClaimResponse,
    GameLeagueImpactOut,
    GameLeagueSummaryResponse,
    GamePersonalRankingItemOut,
    GamePersonalRankingResponse,
    GamePersonalBestOut,
    GameRankingMetricOut,
    GameSessionCompleteRequest,
    GameSessionCompleteResponse,
    GameSessionCreateRequest,
    GameSessionOut,
    GameSessionRegisterResponse,
    GameWeeklyPlayerRankingOut,
    GameWeeklyRankingEntryOut,
    GameWeeklyRankingResponse,
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
from app.services.gamification import MAX_XP_PER_DAY, complete_game_session, get_personal_best, registerGameSession
from app.services.gamification import resolve_game_type_strict
from app.services.game_metagame import (
    GameMetagameSummary,
    build_games_metagame_summary,
    claim_games_metagame_mission,
)
from app.services.game_league import build_games_league_summary, claim_games_league_reward
from app.services.game_ranking import get_personal_ranking_snapshot, get_weekly_ranking_snapshot
from app.services.learning_retention import MissionDelta, track_mission_progress

router = APIRouter(prefix="/api/games", tags=["games"])

_GAME_CATALOG: list[dict[str, object]] = [
    {
        "template_id": "0f4f06ad-3f7c-4ac3-89b8-3e6af40f7d10",
        "title": "Jogo da Velha",
        "subject": "Lógica",
        "age_group": "6-8",
        "engine_key": "STRATEGY",
        "difficulty": "EASY",
        "status": "AVAILABLE",
        "description": "Treine lógica, antecipação e tomada de decisão em partidas rápidas.",
        "play_route": "/child/games/tictactoe",
        "estimated_minutes": 3,
        "xp_reward": 50,
        "coins_reward": 10,
        "tags": ["lógica", "estratégia"],
    },
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
    {
        "template_id": "f9a5d5cc-5e4d-4a42-8a07-9e4c36fc9f77",
        "title": "Cabo de Guerra",
        "subject": "Matemática",
        "age_group": "6-8",
        "engine_key": "REACTION",
        "difficulty": "MEDIUM",
        "status": "AVAILABLE",
        "description": "Duelo matemático de resposta rápida com foco em agilidade e precisão.",
        "play_route": "/child/games/tug-of-war",
        "estimated_minutes": 4,
        "xp_reward": 35,
        "coins_reward": 10,
        "tags": ["agilidade", "aritmética", "streak"],
    },
    {
        "template_id": "6be6b566-ae90-4f81-8998-3938f77f8f8b",
        "title": "Caça-palavras",
        "subject": "Português",
        "age_group": "9-12",
        "engine_key": "WORDSEARCH",
        "difficulty": "MEDIUM",
        "status": "AVAILABLE",
        "description": "Encontre palavras por tema em grades dinâmicas com seleção por arraste.",
        "play_route": "/child/games/wordsearch",
        "estimated_minutes": 4,
        "xp_reward": 32,
        "coins_reward": 9,
        "tags": ["vocabulário", "foco"],
    },
]


def _resolve_child_context(
    db: DBSession,
    *,
    tenant_id: int,
    user: User,
    membership: Membership,
    requested_child_id: int | None,
) -> ChildProfile:
    if requested_child_id is not None:
        child = db.scalar(
            select(ChildProfile).where(
                ChildProfile.id == requested_child_id,
                ChildProfile.tenant_id == tenant_id,
                ChildProfile.deleted_at.is_(None),
            ),
        )
        if child is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child not found in this tenant")
        membership_role = membership.role.value if hasattr(membership.role, "value") else str(membership.role)
        if membership_role == "CHILD" and child.user_id != user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Child user cannot submit results for another child")
        return child

    direct_child = db.scalar(
        select(ChildProfile).where(
            ChildProfile.tenant_id == tenant_id,
            ChildProfile.user_id == user.id,
            ChildProfile.deleted_at.is_(None),
        ),
    )
    if direct_child is not None:
        return direct_child

    children = db.scalars(
        select(ChildProfile).where(
            ChildProfile.tenant_id == tenant_id,
            ChildProfile.deleted_at.is_(None),
        ),
    ).all()
    if len(children) == 1:
        return children[0]
    if not children:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No child profile found for this tenant")
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="Multiple children found. Provide childId explicitly.",
    )


def _resolve_game_settings(
    db: DBSession,
    *,
    tenant_id: int,
    child_id: int | None,
) -> tuple[GameSettings | None, int]:
    max_xp_per_day = MAX_XP_PER_DAY
    if child_id is None:
        return None, max_xp_per_day
    settings = db.scalar(
        select(GameSettings).where(
            GameSettings.tenant_id == tenant_id,
            GameSettings.child_id == child_id,
        ),
    )
    if settings is not None:
        max_xp_per_day = settings.max_daily_xp
    return settings, max_xp_per_day


def _resolve_child_beneficiary_user_id(child: ChildProfile) -> int:
    if child.user_id is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Child profile is not linked to a user account for reward crediting",
        )
    return int(child.user_id)


def _resolve_child_context_and_beneficiary(
    db: DBSession,
    *,
    tenant_id: int,
    user: User,
    membership: Membership,
    requested_child_id: int | None,
) -> tuple[ChildProfile, int]:
    child = _resolve_child_context(
        db,
        tenant_id=tenant_id,
        user=user,
        membership=membership,
        requested_child_id=requested_child_id,
    )
    beneficiary_user_id = _resolve_child_beneficiary_user_id(child)
    return child, beneficiary_user_id


def _serialize_games_metagame(summary: GameMetagameSummary) -> GameMetagameSummaryResponse:
    metagame = summary
    return GameMetagameSummaryResponse(
        generatedAt=metagame.generated_at,
        streak=GameMetagameStreakOut(
            current=metagame.streak_current,
            best=metagame.streak_best,
        ),
        stats=GameMetagameStatsOut(
            totalSessions=metagame.stats.total_sessions,
            weeklySessions=metagame.stats.weekly_sessions,
            dailySessions=metagame.stats.daily_sessions,
            xpToday=metagame.stats.xp_today,
            xpWeek=metagame.stats.xp_week,
            recordsTotal=metagame.stats.records_total,
            recordsToday=metagame.stats.records_today,
            recordsWeek=metagame.stats.records_week,
            favoriteGameId=metagame.stats.favorite_game_id,
            distinctGamesPlayed=metagame.stats.distinct_games_played,
        ),
        dailyMission=GameMetagameMissionOut(
            id=metagame.daily_mission.id,
            scope=metagame.daily_mission.scope,
            title=metagame.daily_mission.title,
            description=metagame.daily_mission.description,
            metric=metagame.daily_mission.metric,
            target=metagame.daily_mission.target,
            current=metagame.daily_mission.current,
            progressPercent=metagame.daily_mission.progress_percent,
            rewardXp=metagame.daily_mission.reward_xp,
            rewardCoins=metagame.daily_mission.reward_coins,
            periodStart=metagame.daily_mission.period_start,
            periodEnd=metagame.daily_mission.period_end,
            claimed=metagame.daily_mission.claimed,
            rewardReady=metagame.daily_mission.reward_ready,
            ctaLabel=metagame.daily_mission.cta_label,
        ),
        weeklyMission=GameMetagameMissionOut(
            id=metagame.weekly_mission.id,
            scope=metagame.weekly_mission.scope,
            title=metagame.weekly_mission.title,
            description=metagame.weekly_mission.description,
            metric=metagame.weekly_mission.metric,
            target=metagame.weekly_mission.target,
            current=metagame.weekly_mission.current,
            progressPercent=metagame.weekly_mission.progress_percent,
            rewardXp=metagame.weekly_mission.reward_xp,
            rewardCoins=metagame.weekly_mission.reward_coins,
            periodStart=metagame.weekly_mission.period_start,
            periodEnd=metagame.weekly_mission.period_end,
            claimed=metagame.weekly_mission.claimed,
            rewardReady=metagame.weekly_mission.reward_ready,
            ctaLabel=metagame.weekly_mission.cta_label,
        ),
        badges=[
            GameMetagameBadgeOut(
                id=badge.id,
                title=badge.title,
                description=badge.description,
                unlocked=badge.unlocked,
                progress=badge.progress,
                target=badge.target,
            )
            for badge in metagame.badges
        ],
        motivationMessage=metagame.motivation_message,
    )


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


@router.get("/metagame/summary", response_model=GameMetagameSummaryResponse)
def get_games_metagame_summary(
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    membership: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
    childId: int | None = None,
) -> GameMetagameSummaryResponse:
    child = _resolve_child_context(
        db,
        tenant_id=tenant.id,
        user=user,
        membership=membership,
        requested_child_id=childId,
    )
    summary = build_games_metagame_summary(db, child_id=child.id)
    return _serialize_games_metagame(summary)


@router.post("/metagame/claim", response_model=GameMetagameClaimResponse)
def claim_games_metagame(
    payload: GameMetagameClaimRequest,
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    membership: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
) -> GameMetagameClaimResponse:
    child, beneficiary_user_id = _resolve_child_context_and_beneficiary(
        db,
        tenant_id=tenant.id,
        user=user,
        membership=membership,
        requested_child_id=payload.child_id,
    )
    try:
        claimed = claim_games_metagame_mission(
            db,
            tenant_id=tenant.id,
            beneficiary_user_id=beneficiary_user_id,
            child_id=child.id,
            mission_scope=payload.mission_scope,
            mission_id=payload.mission_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    db.commit()
    return GameMetagameClaimResponse(
        missionScope=claimed.scope,
        missionId=claimed.mission_id,
        completed=claimed.completed,
        rewardGranted=claimed.reward_granted,
        alreadyClaimed=claimed.already_claimed,
        xpReward=claimed.xp_reward,
        coinReward=claimed.coin_reward,
    )


@router.get("/league/summary", response_model=GameLeagueSummaryResponse)
def get_games_league_summary(
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    membership: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
    childId: int | None = None,
    timezone: str | None = None,
) -> GameLeagueSummaryResponse:
    child = _resolve_child_context(
        db,
        tenant_id=tenant.id,
        user=user,
        membership=membership,
        requested_child_id=childId,
    )
    beneficiary_user_id = _resolve_child_beneficiary_user_id(child)
    summary = build_games_league_summary(
        db,
        tenant_id=tenant.id,
        child_id=child.id,
        user_id=beneficiary_user_id,
        timezone_name=timezone,
    )
    db.commit()
    return GameLeagueSummaryResponse(
        tier=summary.tier,
        tierLabel=summary.tier_label,
        groupId=summary.group_id,
        weekStart=summary.week_start,
        weekEnd=summary.week_end,
        scoreWeek=summary.score_week,
        position=summary.position,
        groupSize=summary.group_size,
        promotionZoneMax=summary.promotion_zone_max,
        relegationZoneMin=summary.relegation_zone_min,
        status=summary.status,
        positionsToPromotion=summary.positions_to_promotion,
        topEntries=[
            {
                "position": item.position,
                "player": item.player,
                "avatarKey": item.avatar_key,
                "score": item.score,
            }
            for item in summary.top_entries
        ],
        motivationMessage=summary.motivation_message,
        reward={
            "rewardXp": summary.reward.reward_xp,
            "rewardCoins": summary.reward.reward_coins,
            "readyToClaim": summary.reward.ready_to_claim,
            "resultStatus": summary.reward.result_status,
            "cycleWeekStart": summary.reward.cycle_week_start,
            "cycleWeekEnd": summary.reward.cycle_week_end,
        },
    )


@router.post("/league/claim", response_model=GameLeagueClaimResponse)
def claim_games_league(
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    membership: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
    childId: int | None = None,
) -> GameLeagueClaimResponse:
    child = _resolve_child_context(
        db,
        tenant_id=tenant.id,
        user=user,
        membership=membership,
        requested_child_id=childId,
    )
    beneficiary_user_id = _resolve_child_beneficiary_user_id(child)
    claimed = claim_games_league_reward(
        db,
        tenant_id=tenant.id,
        child_id=child.id,
        beneficiary_user_id=beneficiary_user_id,
    )
    db.commit()
    return GameLeagueClaimResponse(
        rewardGranted=claimed.reward_granted,
        alreadyClaimed=claimed.already_claimed,
        xpReward=claimed.xp_reward,
        coinReward=claimed.coin_reward,
        cycleWeekStart=claimed.cycle_week_start,
        cycleWeekEnd=claimed.cycle_week_end,
        tierFrom=claimed.tier_from,
        tierTo=claimed.tier_to,
        resultStatus=claimed.result_status,
    )


@router.get("/ranking/weekly/{game_id}", response_model=GameWeeklyRankingResponse)
def get_game_weekly_ranking(
    game_id: str,
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    membership: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
    childId: int | None = None,
    limit: int = 10,
    timezone: str | None = None,
) -> GameWeeklyRankingResponse:
    child = _resolve_child_context(
        db,
        tenant_id=tenant.id,
        user=user,
        membership=membership,
        requested_child_id=childId,
    )
    snapshot = get_weekly_ranking_snapshot(
        db,
        tenant_id=tenant.id,
        child_id=child.id,
        game_id=game_id,
        limit=limit,
        timezone_name=timezone,
    )
    return GameWeeklyRankingResponse(
        gameId=snapshot.game_id,
        metric=GameRankingMetricOut(
            key=snapshot.metric.key,
            label=snapshot.metric.label,
            direction=snapshot.metric.direction,
            unit=snapshot.metric.unit,
        ),
        weekStart=snapshot.week_start,
        weekEnd=snapshot.week_end,
        top=[
            GameWeeklyRankingEntryOut(
                position=item.position,
                player=item.player,
                avatarKey=item.avatar_key,
                score=item.score,
                lastPlayedAt=item.last_played_at,
            )
            for item in snapshot.top
        ],
        me=GameWeeklyPlayerRankingOut(
            position=snapshot.me.position,
            score=snapshot.me.score,
            inTop=snapshot.me.in_top,
            totalPlayers=snapshot.me.total_players,
        ),
    )


@router.get("/ranking/me", response_model=GamePersonalRankingResponse)
def get_my_games_ranking(
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    membership: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
    childId: int | None = None,
    limit: int = 5,
) -> GamePersonalRankingResponse:
    child = _resolve_child_context(
        db,
        tenant_id=tenant.id,
        user=user,
        membership=membership,
        requested_child_id=childId,
    )
    ranking = get_personal_ranking_snapshot(db, tenant_id=tenant.id, child_id=child.id, limit=limit)
    return GamePersonalRankingResponse(
        items=[
            GamePersonalRankingItemOut(
                position=index + 1,
                gameId=item.game_id,
                gameLabel=item.game_label,
                metricLabel=item.metric_label,
                score=item.score,
                unit=item.unit,
            )
            for index, item in enumerate(ranking.items)
        ]
    )


@router.get("/personal-best/{game_id}", response_model=GamePersonalBestOut)
def get_game_personal_best(
    game_id: str,
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    membership: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
    childId: int | None = None,
) -> GamePersonalBestOut:
    child = _resolve_child_context(
        db,
        tenant_id=tenant.id,
        user=user,
        membership=membership,
        requested_child_id=childId,
    )
    best = get_personal_best(db, child_id=child.id, game_id=game_id)
    if best is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Personal best not found")
    return GamePersonalBestOut(
        id=best.id,
        childId=best.child_id,
        gameId=best.game_id,
        bestScore=best.best_score,
        bestStreak=best.best_streak,
        bestDurationSeconds=best.best_duration_seconds,
        lastSurpassedAt=best.last_surpassed_at,
        bestResultPayload=best.best_result_payload,
        createdAt=best.created_at,
        updatedAt=best.updated_at,
    )


@router.get("/personal-best", response_model=list[GamePersonalBestOut])
def list_game_personal_bests(
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    membership: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
    childId: int | None = None,
) -> list[GamePersonalBestOut]:
    child = _resolve_child_context(
        db,
        tenant_id=tenant.id,
        user=user,
        membership=membership,
        requested_child_id=childId,
    )
    rows = db.scalars(
        select(GamePersonalBest)
        .where(GamePersonalBest.child_id == child.id)
        .order_by(GamePersonalBest.updated_at.desc()),
    ).all()
    return [
        GamePersonalBestOut(
            id=item.id,
            childId=item.child_id,
            gameId=item.game_id,
            bestScore=item.best_score,
            bestStreak=item.best_streak,
            bestDurationSeconds=item.best_duration_seconds,
            lastSurpassedAt=item.last_surpassed_at,
            bestResultPayload=item.best_result_payload,
            createdAt=item.created_at,
            updatedAt=item.updated_at,
        )
        for item in rows
    ]


@router.post("/session/complete", response_model=GameSessionCompleteResponse, status_code=status.HTTP_201_CREATED)
def complete_game_session_route(
    payload: GameSessionCompleteRequest,
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    membership: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
) -> GameSessionCompleteResponse:
    resolved_game_type = resolve_game_type_strict(payload.result.game_id)
    if resolved_game_type is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unsupported game_id")
    child, beneficiary_user_id = _resolve_child_context_and_beneficiary(
        db,
        tenant_id=tenant.id,
        user=user,
        membership=membership,
        requested_child_id=payload.child_id,
    )
    child_id = child.id
    settings, max_xp_per_day = _resolve_game_settings(db, tenant_id=tenant.id, child_id=child_id)
    if settings is not None:
        if settings.enabled_games.get(resolved_game_type.value, True) is False:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Game disabled by parental control")

    try:
        complete_result = complete_game_session(
            db,
            tenant_id=tenant.id,
            beneficiary_user_id=beneficiary_user_id,
            child_id=child_id,
            result=payload.result,
            resolved_game_type=resolved_game_type,
            max_xp_per_day=max_xp_per_day,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    try:
        with db.begin_nested():
            track_mission_progress(
                db,
                user_id=beneficiary_user_id,
                tenant_id=tenant.id,
                delta=MissionDelta(
                    xp_gained=complete_result.register_result.granted_xp,
                    from_game=True,
                ),
                auto_claim=True,
            )
    except SQLAlchemyError:
        pass
    db.commit()

    register_result = complete_result.register_result
    personal_best = complete_result.personal_best
    weekly_ranking = get_weekly_ranking_snapshot(
        db,
        tenant_id=tenant.id,
        child_id=child_id,
        game_id=payload.result.game_id,
        limit=10,
    )
    league_summary = build_games_league_summary(
        db,
        tenant_id=tenant.id,
        child_id=child_id,
        user_id=_resolve_child_beneficiary_user_id(child),
    )
    league_impact_message = (
        f"+{register_result.granted_xp} XP para sua liga."
        if register_result.granted_xp > 0
        else "Partida registrada na sua liga desta semana."
    )
    if league_summary.position is not None:
        league_impact_message = f"{league_impact_message} Você está em #{league_summary.position} na {league_summary.tier_label}."
    return GameSessionCompleteResponse(
        profile=UserGameProfileOut(
            id=register_result.profile.id,
            userId=register_result.profile.user_id,
            xp=register_result.profile.xp,
            level=register_result.profile.level,
            axionCoins=register_result.profile.axion_coins,
            dailyXp=register_result.profile.daily_xp,
            lastXpReset=register_result.profile.last_xp_reset,
            createdAt=register_result.profile.created_at,
            updatedAt=register_result.profile.updated_at,
        ),
        session=GameSessionOut(
            id=register_result.session.id,
            userId=register_result.session.user_id,
            gameType=register_result.session.game_type.value,
            score=register_result.session.score,
            xpEarned=register_result.session.xp_earned,
            coinsEarned=register_result.session.coins_earned,
            createdAt=register_result.session.created_at,
        ),
        dailyLimit=DailyXpLimitOut(
            maxXpPerDay=register_result.max_xp_per_day,
            grantedXp=register_result.granted_xp,
            requestedXp=register_result.requested_xp,
            remainingXpToday=register_result.remaining_xp_today,
        ),
        unlockedAchievements=register_result.unlocked_achievements,
        isPersonalBest=complete_result.is_personal_best,
        personalBestType=complete_result.personal_best_type,
        personalBest=(
            GamePersonalBestOut(
                id=personal_best.id,
                childId=personal_best.child_id,
                gameId=personal_best.game_id,
                bestScore=personal_best.best_score,
                bestStreak=personal_best.best_streak,
                bestDurationSeconds=personal_best.best_duration_seconds,
                lastSurpassedAt=personal_best.last_surpassed_at,
                bestResultPayload=personal_best.best_result_payload,
                createdAt=personal_best.created_at,
                updatedAt=personal_best.updated_at,
            )
            if personal_best is not None
            else None
        ),
        weeklyRanking=GameWeeklyPlayerRankingOut(
            position=weekly_ranking.me.position,
            score=weekly_ranking.me.score,
            inTop=weekly_ranking.me.in_top,
            totalPlayers=weekly_ranking.me.total_players,
        ),
        leagueImpact=GameLeagueImpactOut(
            xpContribution=register_result.granted_xp,
            position=league_summary.position,
            message=league_impact_message,
        ),
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
    membership: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
) -> GameSessionRegisterResponse:
    child, beneficiary_user_id = _resolve_child_context_and_beneficiary(
        db,
        tenant_id=tenant.id,
        user=user,
        membership=membership,
        requested_child_id=payload.child_id,
    )
    child_id = child.id
    settings, max_xp_per_day = _resolve_game_settings(db, tenant_id=tenant.id, child_id=child_id)
    if settings is not None:
        game_enabled = settings.enabled_games.get(payload.game_type, True)
        if not game_enabled:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Game disabled by parental control")

    result = registerGameSession(
        db,
        beneficiary_user_id=beneficiary_user_id,
        tenant_id=tenant.id,
        child_id=child_id,
        game_type=GameType(payload.game_type),
        score=payload.score,
        game_id=payload.game_type.lower(),
        max_xp_per_day=max_xp_per_day,
    )
    try:
        with db.begin_nested():
            track_mission_progress(
                db,
                user_id=beneficiary_user_id,
                tenant_id=tenant.id,
                delta=MissionDelta(
                    xp_gained=result.granted_xp,
                    from_game=True,
                ),
                auto_claim=True,
            )
    except SQLAlchemyError:
        pass
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

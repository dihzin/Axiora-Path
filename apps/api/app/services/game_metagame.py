from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Literal

from sqlalchemy import Date, desc, func, select
from sqlalchemy.orm import Session

from app.models import GameMetagameMissionClaim, GamePersonalBest, GameSession
from app.services.gamification import addCoins, addXP

MissionScope = Literal["daily", "weekly"]
MissionMetric = Literal["sessions", "xp", "records"]


@dataclass(slots=True)
class GameMetagameStats:
    total_sessions: int
    weekly_sessions: int
    daily_sessions: int
    xp_today: int
    xp_week: int
    records_total: int
    records_today: int
    records_week: int
    favorite_game_id: str | None
    distinct_games_played: int
    current_streak: int
    best_streak: int


@dataclass(slots=True)
class GameMetagameMission:
    id: str
    scope: MissionScope
    title: str
    description: str
    metric: MissionMetric
    target: int
    current: int
    progress_percent: float
    reward_xp: int
    reward_coins: int
    period_start: date
    period_end: date
    claimed: bool
    reward_ready: bool
    cta_label: str


@dataclass(slots=True)
class GameMetagameBadge:
    id: str
    title: str
    description: str
    unlocked: bool
    progress: int
    target: int


@dataclass(slots=True)
class GameMetagameSummary:
    generated_at: datetime
    streak_current: int
    streak_best: int
    stats: GameMetagameStats
    daily_mission: GameMetagameMission
    weekly_mission: GameMetagameMission
    badges: list[GameMetagameBadge]
    motivation_message: str


@dataclass(slots=True)
class GameMetagameClaimResult:
    mission_id: str
    scope: MissionScope
    completed: bool
    reward_granted: bool
    already_claimed: bool
    xp_reward: int
    coin_reward: int


@dataclass(slots=True)
class _MissionTemplate:
    id: str
    scope: MissionScope
    title: str
    description: str
    metric: MissionMetric
    target: int
    reward_xp: int
    reward_coins: int
    cta_label: str


DAILY_TEMPLATES: list[_MissionTemplate] = [
    _MissionTemplate(
        id="daily_play_1",
        scope="daily",
        title="Missão de hoje",
        description="Jogue 1 partida para manter seu ritmo.",
        metric="sessions",
        target=1,
        reward_xp=20,
        reward_coins=5,
        cta_label="Jogar agora",
    ),
    _MissionTemplate(
        id="daily_xp_80",
        scope="daily",
        title="Missão de hoje",
        description="Ganhe 80 XP em jogos hoje.",
        metric="xp",
        target=80,
        reward_xp=28,
        reward_coins=8,
        cta_label="Buscar XP",
    ),
    _MissionTemplate(
        id="daily_record_1",
        scope="daily",
        title="Missão de hoje",
        description="Bata 1 recorde pessoal hoje.",
        metric="records",
        target=1,
        reward_xp=26,
        reward_coins=7,
        cta_label="Bater recorde",
    ),
]


WEEKLY_TEMPLATES: list[_MissionTemplate] = [
    _MissionTemplate(
        id="weekly_sessions_3",
        scope="weekly",
        title="Missão da semana",
        description="Conclua 3 partidas nesta semana.",
        metric="sessions",
        target=3,
        reward_xp=60,
        reward_coins=16,
        cta_label="Continuar jornada",
    ),
    _MissionTemplate(
        id="weekly_xp_180",
        scope="weekly",
        title="Missão da semana",
        description="Ganhe 180 XP em jogos nesta semana.",
        metric="xp",
        target=180,
        reward_xp=72,
        reward_coins=20,
        cta_label="Ganhar XP",
    ),
    _MissionTemplate(
        id="weekly_record_1",
        scope="weekly",
        title="Missão da semana",
        description="Bata 1 recorde nesta semana.",
        metric="records",
        target=1,
        reward_xp=64,
        reward_coins=18,
        cta_label="Superar marca",
    ),
]


def _week_bounds(target_date: date) -> tuple[date, date]:
    monday = target_date - timedelta(days=target_date.weekday())
    sunday = monday + timedelta(days=6)
    return monday, sunday


def _metric_value(stats: GameMetagameStats, metric: MissionMetric, *, scope: MissionScope) -> int:
    if metric == "sessions":
        return stats.daily_sessions if scope == "daily" else stats.weekly_sessions
    if metric == "xp":
        return stats.xp_today if scope == "daily" else stats.xp_week
    return stats.records_today if scope == "daily" else stats.records_week


def _select_template(*, target_date: date, scope: MissionScope) -> _MissionTemplate:
    if scope == "daily":
        index = target_date.toordinal() % len(DAILY_TEMPLATES)
        return DAILY_TEMPLATES[index]
    templates = WEEKLY_TEMPLATES
    index = (target_date.isocalendar().week + target_date.year) % len(templates)
    return templates[index]


def _load_claimed_keys(
    db: Session,
    *,
    child_id: int,
    daily_period_start: date,
    weekly_period_start: date,
) -> set[tuple[str, str, date]]:
    rows = db.scalars(
        select(GameMetagameMissionClaim).where(
            GameMetagameMissionClaim.child_id == child_id,
            GameMetagameMissionClaim.period_start.in_([daily_period_start, weekly_period_start]),
        )
    ).all()
    return {(row.mission_scope.lower(), row.mission_id, row.period_start) for row in rows}


def _compute_streaks(activity_days: list[date], *, today: date) -> tuple[int, int]:
    if not activity_days:
        return 0, 0

    unique_days = sorted(set(activity_days))
    day_set = set(unique_days)

    current = 0
    cursor = today
    while cursor in day_set:
        current += 1
        cursor -= timedelta(days=1)

    best = 1
    run = 1
    for index in range(1, len(unique_days)):
        if (unique_days[index] - unique_days[index - 1]).days == 1:
            run += 1
        else:
            run = 1
        if run > best:
            best = run
    return current, best


def _build_badges(stats: GameMetagameStats) -> list[GameMetagameBadge]:
    definitions = [
        ("first_match", "Primeira partida", "Conclua sua primeira partida em Games.", stats.total_sessions, 1),
        ("streak_3", "3 dias seguidos", "Jogue por 3 dias em sequência.", stats.current_streak, 3),
        ("records_5", "Caçador de recordes", "Conquiste 5 recordes pessoais.", stats.records_total, 5),
        ("explorer_4", "Explorador de jogos", "Jogue 4 jogos diferentes.", stats.distinct_games_played, 4),
        ("weekly_focus", "Ritmo semanal", "Conclua 3 partidas na semana.", stats.weekly_sessions, 3),
    ]
    return [
        GameMetagameBadge(
            id=badge_id,
            title=title,
            description=description,
            unlocked=progress >= target,
            progress=min(progress, target),
            target=target,
        )
        for badge_id, title, description, progress, target in definitions
    ]


def _build_motivation(stats: GameMetagameStats, daily_mission: GameMetagameMission) -> str:
    if daily_mission.reward_ready:
        return "Recompensa pronta: resgate sua missão de hoje."
    if stats.current_streak >= 2:
        return f"Você está em sequência! {stats.current_streak} dias jogando."
    if daily_mission.current < daily_mission.target:
        remaining = max(0, daily_mission.target - daily_mission.current)
        if daily_mission.metric == "xp":
            return f"Faltam {remaining} XP para concluir a missão de hoje."
        if daily_mission.metric == "records":
            return "Mais um recorde e sua missão de hoje fica completa."
        return "Mais uma partida e sua missão de hoje fica completa."
    return "Continue jogando para fortalecer seu progresso semanal."


def build_games_metagame_summary(
    db: Session,
    *,
    child_id: int,
) -> GameMetagameSummary:
    today = date.today()
    week_start, week_end = _week_bounds(today)

    session_filter = [GameSession.child_id == child_id, GameSession.completed.is_(True)]
    total_sessions = int(db.scalar(select(func.count()).select_from(GameSession).where(*session_filter)) or 0)
    daily_sessions = int(
        db.scalar(
            select(func.count())
            .select_from(GameSession)
            .where(*session_filter, func.cast(GameSession.created_at, Date) == today)
        )
        or 0
    )
    weekly_sessions = int(
        db.scalar(
            select(func.count())
            .select_from(GameSession)
            .where(
                *session_filter,
                func.cast(GameSession.created_at, Date) >= week_start,
                func.cast(GameSession.created_at, Date) <= week_end,
            )
        )
        or 0
    )
    xp_today = int(
        db.scalar(
            select(func.coalesce(func.sum(GameSession.xp_earned), 0))
            .where(*session_filter, func.cast(GameSession.created_at, Date) == today)
        )
        or 0
    )
    xp_week = int(
        db.scalar(
            select(func.coalesce(func.sum(GameSession.xp_earned), 0))
            .where(
                *session_filter,
                func.cast(GameSession.created_at, Date) >= week_start,
                func.cast(GameSession.created_at, Date) <= week_end,
            )
        )
        or 0
    )

    records_filter = [GamePersonalBest.child_id == child_id]
    records_total = int(db.scalar(select(func.count()).select_from(GamePersonalBest).where(*records_filter)) or 0)
    records_today = int(
        db.scalar(
            select(func.count())
            .select_from(GamePersonalBest)
            .where(
                *records_filter,
                GamePersonalBest.last_surpassed_at.is_not(None),
                func.cast(GamePersonalBest.last_surpassed_at, Date) == today,
            )
        )
        or 0
    )
    records_week = int(
        db.scalar(
            select(func.count())
            .select_from(GamePersonalBest)
            .where(
                *records_filter,
                GamePersonalBest.last_surpassed_at.is_not(None),
                func.cast(GamePersonalBest.last_surpassed_at, Date) >= week_start,
                func.cast(GamePersonalBest.last_surpassed_at, Date) <= week_end,
            )
        )
        or 0
    )

    favorite_row = db.execute(
        select(
            GameSession.game_id,
            func.count(GameSession.id).label("plays"),
            func.max(GameSession.created_at).label("last_played"),
        )
        .where(*session_filter, GameSession.game_id.is_not(None))
        .group_by(GameSession.game_id)
        .order_by(desc("plays"), desc("last_played"))
        .limit(1)
    ).first()
    favorite_game_id = str(favorite_row[0]) if favorite_row and favorite_row[0] is not None else None

    distinct_games_played = int(
        db.scalar(
            select(func.count(func.distinct(GameSession.game_id)))
            .where(*session_filter, GameSession.game_id.is_not(None))
        )
        or 0
    )

    activity_days = db.scalars(
        select(func.cast(GameSession.created_at, Date))
        .where(*session_filter)
        .group_by(func.cast(GameSession.created_at, Date))
        .order_by(func.cast(GameSession.created_at, Date).asc())
    ).all()
    current_streak, best_streak = _compute_streaks(activity_days, today=today)

    stats = GameMetagameStats(
        total_sessions=total_sessions,
        weekly_sessions=weekly_sessions,
        daily_sessions=daily_sessions,
        xp_today=xp_today,
        xp_week=xp_week,
        records_total=records_total,
        records_today=records_today,
        records_week=records_week,
        favorite_game_id=favorite_game_id,
        distinct_games_played=distinct_games_played,
        current_streak=current_streak,
        best_streak=best_streak,
    )

    daily_template = _select_template(target_date=today, scope="daily")
    weekly_template = _select_template(target_date=today, scope="weekly")
    claimed_keys = _load_claimed_keys(
        db,
        child_id=child_id,
        daily_period_start=today,
        weekly_period_start=week_start,
    )

    def build_mission(template: _MissionTemplate) -> GameMetagameMission:
        period_start = today if template.scope == "daily" else week_start
        period_end = today if template.scope == "daily" else week_end
        current = _metric_value(stats, template.metric, scope=template.scope)
        progress_percent = 100.0 if template.target <= 0 else min(100.0, round((float(current) / float(template.target)) * 100.0, 2))
        claimed = (template.scope, template.id, period_start) in claimed_keys
        reward_ready = current >= template.target and not claimed
        return GameMetagameMission(
            id=template.id,
            scope=template.scope,
            title=template.title,
            description=template.description,
            metric=template.metric,
            target=template.target,
            current=min(current, template.target),
            progress_percent=progress_percent,
            reward_xp=template.reward_xp,
            reward_coins=template.reward_coins,
            period_start=period_start,
            period_end=period_end,
            claimed=claimed,
            reward_ready=reward_ready,
            cta_label=template.cta_label,
        )

    daily_mission = build_mission(daily_template)
    weekly_mission = build_mission(weekly_template)
    badges = _build_badges(stats)

    return GameMetagameSummary(
        generated_at=datetime.now(UTC),
        streak_current=current_streak,
        streak_best=best_streak,
        stats=stats,
        daily_mission=daily_mission,
        weekly_mission=weekly_mission,
        badges=badges,
        motivation_message=_build_motivation(stats, daily_mission),
    )


def claim_games_metagame_mission(
    db: Session,
    *,
    tenant_id: int,
    user_id: int,
    child_id: int,
    mission_scope: MissionScope,
    mission_id: str,
) -> GameMetagameClaimResult:
    summary = build_games_metagame_summary(db, child_id=child_id)
    mission = summary.daily_mission if mission_scope == "daily" else summary.weekly_mission
    if mission.id != mission_id:
        raise ValueError("Mission is no longer active for this period")

    existing = db.scalar(
        select(GameMetagameMissionClaim).where(
            GameMetagameMissionClaim.child_id == child_id,
            GameMetagameMissionClaim.mission_scope == mission_scope,
            GameMetagameMissionClaim.mission_id == mission.id,
            GameMetagameMissionClaim.period_start == mission.period_start,
        )
    )
    if existing is not None:
        return GameMetagameClaimResult(
            mission_id=mission.id,
            scope=mission_scope,
            completed=True,
            reward_granted=False,
            already_claimed=True,
            xp_reward=int(existing.reward_xp),
            coin_reward=int(existing.reward_coins),
        )

    if not mission.reward_ready:
        return GameMetagameClaimResult(
            mission_id=mission.id,
            scope=mission_scope,
            completed=False,
            reward_granted=False,
            already_claimed=False,
            xp_reward=0,
            coin_reward=0,
        )

    addXP(
        db,
        user_id=user_id,
        xp_amount=mission.reward_xp,
        target_date=date.today(),
        max_xp_per_day=100000,
    )
    addCoins(db, user_id=user_id, coin_amount=mission.reward_coins)

    db.add(
        GameMetagameMissionClaim(
            tenant_id=tenant_id,
            child_id=child_id,
            user_id=user_id,
            mission_scope=mission_scope,
            mission_id=mission.id,
            period_start=mission.period_start,
            period_end=mission.period_end,
            reward_xp=mission.reward_xp,
            reward_coins=mission.reward_coins,
        )
    )
    db.flush()

    return GameMetagameClaimResult(
        mission_id=mission.id,
        scope=mission_scope,
        completed=True,
        reward_granted=True,
        already_claimed=False,
        xp_reward=mission.reward_xp,
        coin_reward=mission.reward_coins,
    )


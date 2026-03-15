from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
import os
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import Float, and_, asc, cast, desc, func, or_, select
from sqlalchemy.orm import Session

from app.models import ChildProfile, GamePersonalBest, GameSession

RankingDirection = Literal["asc", "desc"]


@dataclass(slots=True)
class RankingMetric:
    key: str
    label: str
    direction: RankingDirection
    unit: str


@dataclass(slots=True)
class WeeklyRankingEntry:
    position: int
    player: str
    avatar_key: str | None
    score: float
    last_played_at: datetime


@dataclass(slots=True)
class WeeklyRankingMe:
    position: int | None
    score: float | None
    in_top: bool
    total_players: int


@dataclass(slots=True)
class WeeklyRankingSnapshot:
    game_id: str
    metric: RankingMetric
    week_start: date
    week_end: date
    top: list[WeeklyRankingEntry]
    me: WeeklyRankingMe


@dataclass(slots=True)
class PersonalRankingItem:
    game_id: str
    game_label: str
    metric_label: str
    score: float
    unit: str


@dataclass(slots=True)
class PersonalRankingSnapshot:
    items: list[PersonalRankingItem]


GAME_LABELS: dict[str, str] = {
    "tictactoe": "Jogo da Velha",
    "quiz": "Corrida da Soma",
    "memory": "Memory",
    "finance-sim": "Mercado do Troco",
    "tug-of-war": "Cabo de Guerra",
    "wordsearch": "Caça-palavras",
}

DEFAULT_RANKING_TIMEZONE = os.getenv("AXIORA_GAMES_RANKING_TZ", "UTC")


def normalize_game_id(game_id: str) -> str:
    return game_id.strip().lower()


def metric_for_game(game_id: str) -> RankingMetric:
    normalized = normalize_game_id(game_id)
    if normalized == "memory":
        return RankingMetric(key="best_duration", label="Melhor tempo", direction="asc", unit="s")
    if normalized == "tictactoe":
        return RankingMetric(key="best_streak", label="Melhor sequência", direction="desc", unit="")
    if normalized == "wordsearch":
        return RankingMetric(key="best_score", label="Pontuação", direction="desc", unit="pts")
    if normalized == "tug-of-war":
        return RankingMetric(key="best_score", label="Pontuação", direction="desc", unit="pts")
    if normalized == "finance-sim":
        return RankingMetric(key="best_score", label="Pontuação", direction="desc", unit="pts")
    return RankingMetric(key="best_score", label="Pontuação", direction="desc", unit="pts")


def _resolve_timezone(timezone_name: str | None = None) -> ZoneInfo:
    candidate = (timezone_name or DEFAULT_RANKING_TIMEZONE or "UTC").strip() or "UTC"
    try:
        return ZoneInfo(candidate)
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


def _week_window(timezone_name: str | None = None) -> tuple[datetime, datetime, date, date]:
    timezone = _resolve_timezone(timezone_name)
    now_local = datetime.now(UTC).astimezone(timezone)
    monday = now_local.date() - timedelta(days=now_local.weekday())
    sunday = monday + timedelta(days=6)
    week_start_local = datetime.combine(monday, datetime.min.time(), tzinfo=timezone)
    next_week_start_local = week_start_local + timedelta(days=7)
    return (
        week_start_local.astimezone(UTC),
        next_week_start_local.astimezone(UTC),
        monday,
        sunday,
    )


def _mask_name(name: str) -> str:
    clean = (name or "Jogador").strip()
    if not clean:
        return "Jogador"
    pieces = clean.split()
    first = pieces[0]
    if len(first) <= 2:
        return f"{first[0]}*"
    return f"{first[:2]}***"


def _metric_expression(base_subquery, metric: RankingMetric):
    if metric.key == "best_duration":
        return cast(func.coalesce(base_subquery.c.best_duration, 999999999), Float)
    if metric.key == "best_streak":
        return cast(func.coalesce(base_subquery.c.best_streak, 0), Float)
    return cast(func.coalesce(base_subquery.c.best_score, 0), Float)


def _ranking_rows(
    *,
    tenant_id: int,
    game_id: str,
    week_start_at: datetime,
    week_end_exclusive: datetime,
):
    normalized_game_id = normalize_game_id(game_id)
    aggregated = (
        select(
            GameSession.child_id.label("child_id"),
            func.max(GameSession.score).label("best_score"),
            func.min(GameSession.duration_seconds).label("best_duration"),
            func.max(func.coalesce(GameSession.max_streak, GameSession.streak, 0)).label("best_streak"),
            func.max(GameSession.created_at).label("last_played_at"),
        )
        .where(
            GameSession.tenant_id == tenant_id,
            GameSession.game_id == normalized_game_id,
            GameSession.child_id.is_not(None),
            GameSession.completed.is_(True),
            GameSession.created_at >= week_start_at,
            GameSession.created_at < week_end_exclusive,
        )
        .group_by(GameSession.child_id)
    ).subquery("weekly_game_scores")

    metric = metric_for_game(normalized_game_id)
    metric_expr = _metric_expression(aggregated, metric)
    ranking_rows = (
        select(
            aggregated.c.child_id,
            ChildProfile.display_name,
            ChildProfile.avatar_key,
            metric_expr.label("metric_score"),
            aggregated.c.last_played_at,
        )
        .join(ChildProfile, ChildProfile.id == aggregated.c.child_id)
        .where(
            ChildProfile.tenant_id == tenant_id,
            ChildProfile.deleted_at.is_(None),
        )
    ).subquery("weekly_game_ranking_rows")
    return ranking_rows, metric


def get_weekly_ranking_snapshot(
    db: Session,
    *,
    tenant_id: int,
    child_id: int,
    game_id: str,
    limit: int = 10,
    timezone_name: str | None = None,
) -> WeeklyRankingSnapshot:
    week_start_at, week_end_exclusive, week_start, week_end = _week_window(timezone_name)
    ranking_rows, metric = _ranking_rows(
        tenant_id=tenant_id,
        game_id=game_id,
        week_start_at=week_start_at,
        week_end_exclusive=week_end_exclusive,
    )
    metric_expr = ranking_rows.c.metric_score
    order_metric = asc(metric_expr) if metric.direction == "asc" else desc(metric_expr)

    safe_limit = min(max(int(limit), 1), 50)
    top_rows = db.execute(
        select(ranking_rows)
        .order_by(order_metric, desc(ranking_rows.c.last_played_at), asc(ranking_rows.c.child_id))
        .limit(safe_limit)
    ).all()
    me_row = db.execute(select(ranking_rows).where(ranking_rows.c.child_id == child_id)).first()
    total_players = int(db.scalar(select(func.count()).select_from(ranking_rows)) or 0)

    top: list[WeeklyRankingEntry] = []
    for index, row in enumerate(top_rows, start=1):
        top.append(
            WeeklyRankingEntry(
                position=index,
                player=_mask_name(str(row.display_name)),
                avatar_key=row.avatar_key,
                score=float(row.metric_score),
                last_played_at=row.last_played_at or datetime.now(UTC),
            )
        )

    me_position: int | None = None
    me_score: float | None = None
    if me_row is not None:
        me_score = float(me_row.metric_score)
        if metric.direction == "asc":
            better_than_me = or_(
                ranking_rows.c.metric_score < me_score,
                and_(ranking_rows.c.metric_score == me_score, ranking_rows.c.last_played_at > me_row.last_played_at),
                and_(
                    ranking_rows.c.metric_score == me_score,
                    ranking_rows.c.last_played_at == me_row.last_played_at,
                    ranking_rows.c.child_id < child_id,
                ),
            )
        else:
            better_than_me = or_(
                ranking_rows.c.metric_score > me_score,
                and_(ranking_rows.c.metric_score == me_score, ranking_rows.c.last_played_at > me_row.last_played_at),
                and_(
                    ranking_rows.c.metric_score == me_score,
                    ranking_rows.c.last_played_at == me_row.last_played_at,
                    ranking_rows.c.child_id < child_id,
                ),
            )
        better_count = int(db.scalar(select(func.count()).select_from(ranking_rows).where(better_than_me)) or 0)
        me_position = better_count + 1

    me = WeeklyRankingMe(
        position=me_position,
        score=me_score,
        in_top=bool(me_position is not None and me_position <= safe_limit),
        total_players=total_players,
    )

    return WeeklyRankingSnapshot(
        game_id=normalize_game_id(game_id),
        metric=metric,
        week_start=week_start,
        week_end=week_end,
        top=top,
        me=me,
    )


def get_personal_ranking_snapshot(
    db: Session,
    *,
    tenant_id: int,
    child_id: int,
    limit: int = 5,
) -> PersonalRankingSnapshot:
    rows = db.scalars(
        select(GamePersonalBest)
        .where(
            GamePersonalBest.tenant_id == tenant_id,
            GamePersonalBest.child_id == child_id,
        )
        .order_by(GamePersonalBest.updated_at.desc())
    ).all()

    items: list[PersonalRankingItem] = []
    for row in rows:
        game_id = normalize_game_id(row.game_id)
        metric = metric_for_game(game_id)
        if metric.key == "best_duration":
            value = float(row.best_duration_seconds) if row.best_duration_seconds is not None else None
        elif metric.key == "best_streak":
            value = float(row.best_streak) if row.best_streak is not None else None
        else:
            value = float(row.best_score) if row.best_score is not None else None
        if value is None:
            continue
        items.append(
            PersonalRankingItem(
                game_id=game_id,
                game_label=GAME_LABELS.get(game_id, game_id.replace("-", " ").title()),
                metric_label=metric.label,
                score=value,
                unit=metric.unit,
            )
        )

    def sort_key(item: PersonalRankingItem) -> tuple[int, float]:
        metric = metric_for_game(item.game_id)
        if metric.direction == "asc":
            return (0, item.score)
        return (1, -item.score)

    ranked = sorted(items, key=sort_key)
    return PersonalRankingSnapshot(items=ranked[: min(max(int(limit), 1), 20)])

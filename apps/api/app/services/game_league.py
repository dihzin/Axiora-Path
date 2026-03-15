from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
import os
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import Date, and_, desc, func, select
from sqlalchemy.orm import Session

from app.models import ChildProfile, GameLeagueProfile, GameLeagueRewardClaim, GameSession
from app.services.gamification import addCoins, addXP

LeagueTier = Literal["BRONZE", "SILVER", "GOLD", "DIAMOND"]
LeagueResultStatus = Literal["promoted", "safe", "relegated"]

LEAGUE_TIERS: tuple[LeagueTier, ...] = ("BRONZE", "SILVER", "GOLD", "DIAMOND")
LEAGUE_LABELS: dict[LeagueTier, str] = {
    "BRONZE": "Liga Bronze",
    "SILVER": "Liga Prata",
    "GOLD": "Liga Ouro",
    "DIAMOND": "Liga Diamante",
}
LEAGUE_GROUP_SIZE = 20
DEFAULT_LEAGUE_TIMEZONE = os.getenv("AXIORA_GAMES_LEAGUE_TZ", "UTC")


@dataclass(slots=True)
class LeagueTopEntry:
    position: int
    player: str
    avatar_key: str | None
    score: int


@dataclass(slots=True)
class LeagueRewardPreview:
    reward_xp: int
    reward_coins: int
    ready_to_claim: bool
    result_status: LeagueResultStatus | None
    cycle_week_start: date | None
    cycle_week_end: date | None


@dataclass(slots=True)
class LeagueSummary:
    tier: LeagueTier
    tier_label: str
    group_id: str
    week_start: date
    week_end: date
    score_week: int
    position: int | None
    group_size: int
    promotion_zone_max: int
    relegation_zone_min: int | None
    status: LeagueResultStatus | None
    positions_to_promotion: int | None
    top_entries: list[LeagueTopEntry]
    motivation_message: str
    reward: LeagueRewardPreview


@dataclass(slots=True)
class LeagueClaimResult:
    reward_granted: bool
    already_claimed: bool
    xp_reward: int
    coin_reward: int
    cycle_week_start: date | None
    cycle_week_end: date | None
    tier_from: LeagueTier | None
    tier_to: LeagueTier | None
    result_status: LeagueResultStatus | None


def _resolve_timezone(timezone_name: str | None = None) -> ZoneInfo:
    candidate = (timezone_name or DEFAULT_LEAGUE_TIMEZONE or "UTC").strip() or "UTC"
    try:
        return ZoneInfo(candidate)
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


def _week_window(timezone_name: str | None = None, *, now_utc: datetime | None = None) -> tuple[datetime, datetime, date, date]:
    timezone = _resolve_timezone(timezone_name)
    now_local = (now_utc or datetime.now(UTC)).astimezone(timezone)
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
    first = clean.split()[0]
    if len(first) <= 2:
        return f"{first[0]}*"
    return f"{first[:2]}***"


def _normalize_tier(raw: str | None) -> LeagueTier:
    value = (raw or "BRONZE").strip().upper()
    if value in LEAGUE_TIERS:
        return value  # type: ignore[return-value]
    return "BRONZE"


def _normalize_status(raw: str | None) -> LeagueResultStatus | None:
    value = (raw or "").strip().lower()
    if value in {"promoted", "safe", "relegated"}:
        return value  # type: ignore[return-value]
    return None


def _zone_size(group_size: int) -> int:
    if group_size <= 4:
        return 1
    if group_size <= 9:
        return 2
    return 3


def _scoreboard_for_ids(
    db: Session,
    *,
    tenant_id: int,
    child_ids: list[int],
    week_start_at: datetime,
    week_end_exclusive: datetime,
) -> dict[int, tuple[int, datetime | None]]:
    if not child_ids:
        return {}
    rows = db.execute(
        select(
            GameSession.child_id,
            func.coalesce(func.sum(GameSession.xp_earned), 0).label("score_week"),
            func.max(GameSession.created_at).label("last_played_at"),
        )
        .where(
            GameSession.tenant_id == tenant_id,
            GameSession.child_id.in_(child_ids),
            GameSession.completed.is_(True),
            GameSession.created_at >= week_start_at,
            GameSession.created_at < week_end_exclusive,
        )
        .group_by(GameSession.child_id)
    ).all()
    result: dict[int, tuple[int, datetime | None]] = {int(child_id): (0, None) for child_id in child_ids}
    for row in rows:
        result[int(row.child_id)] = (int(row.score_week or 0), row.last_played_at)
    return result


def _ensure_league_profile(
    db: Session,
    *,
    tenant_id: int,
    child_id: int,
    user_id: int,
    current_week_start: date,
) -> GameLeagueProfile:
    profile = db.scalar(
        select(GameLeagueProfile).where(
            GameLeagueProfile.tenant_id == tenant_id,
            GameLeagueProfile.child_id == child_id,
        )
    )
    if profile is not None:
        return profile
    profile = GameLeagueProfile(
        tenant_id=tenant_id,
        child_id=child_id,
        user_id=user_id,
        current_tier="BRONZE",
        last_cycle_applied_week_start=current_week_start,
    )
    db.add(profile)
    db.flush()
    return profile


def _classify_position(
    *,
    tier: LeagueTier,
    group_size: int,
    position: int | None,
) -> tuple[LeagueResultStatus | None, int, int | None]:
    if position is None:
        return None, 0, None
    zone = _zone_size(group_size)
    promotion_zone_max = zone if tier != "DIAMOND" else 0
    relegation_zone_min = (group_size - zone + 1) if tier != "BRONZE" else None

    if promotion_zone_max > 0 and position <= promotion_zone_max:
        return "promoted", promotion_zone_max, relegation_zone_min
    if relegation_zone_min is not None and position >= relegation_zone_min:
        return "relegated", promotion_zone_max, relegation_zone_min
    return "safe", promotion_zone_max, relegation_zone_min


def _next_tier(tier: LeagueTier, status: LeagueResultStatus | None) -> LeagueTier:
    index = LEAGUE_TIERS.index(tier)
    if status == "promoted" and index < len(LEAGUE_TIERS) - 1:
        return LEAGUE_TIERS[index + 1]
    if status == "relegated" and index > 0:
        return LEAGUE_TIERS[index - 1]
    return tier


def _reward_for_status(status: LeagueResultStatus) -> tuple[int, int]:
    if status == "promoted":
        return (90, 25)
    if status == "safe":
        return (35, 10)
    return (20, 6)


def _build_group_standings(
    db: Session,
    *,
    tenant_id: int,
    tier: LeagueTier,
    child_id: int,
    week_start_at: datetime,
    week_end_exclusive: datetime,
    week_start_date: date,
) -> tuple[list[tuple[int, int, datetime | None]], int]:
    profile_rows = db.scalars(
        select(GameLeagueProfile).where(
            GameLeagueProfile.tenant_id == tenant_id,
            GameLeagueProfile.current_tier == tier,
        )
    ).all()
    candidate_ids = sorted({int(row.child_id) for row in profile_rows} | {int(child_id)})
    if not candidate_ids:
        candidate_ids = [int(child_id)]
    if child_id not in candidate_ids:
        candidate_ids.append(child_id)
        candidate_ids.sort()

    bucket_index = max(0, candidate_ids.index(child_id) // LEAGUE_GROUP_SIZE)
    group_slice = candidate_ids[bucket_index * LEAGUE_GROUP_SIZE : (bucket_index + 1) * LEAGUE_GROUP_SIZE]

    scoreboard = _scoreboard_for_ids(
        db,
        tenant_id=tenant_id,
        child_ids=group_slice,
        week_start_at=week_start_at,
        week_end_exclusive=week_end_exclusive,
    )
    standings = sorted(
        (
            (
                cid,
                scoreboard[cid][0],
                scoreboard[cid][1],
            )
            for cid in group_slice
        ),
        key=lambda item: (-item[1], -(item[2].timestamp() if item[2] else 0), item[0]),
    )
    group_id = f"{tier.lower()}-{week_start_date.isoformat()}-g{bucket_index + 1:02d}"
    return standings, int(group_id.split("g")[-1])


def _apply_week_rollover(
    db: Session,
    *,
    tenant_id: int,
    child_id: int,
    user_id: int,
    profile: GameLeagueProfile,
    current_week_start_date: date,
    timezone_name: str | None,
) -> None:
    if profile.last_cycle_applied_week_start == current_week_start_date:
        return
    if profile.last_cycle_applied_week_start is None:
        profile.last_cycle_applied_week_start = current_week_start_date
        db.flush()
        return

    previous_week_start_date = current_week_start_date - timedelta(days=7)
    previous_week_end_date = previous_week_start_date + timedelta(days=6)
    previous_start_at, previous_end_exclusive, _, _ = _week_window(
        timezone_name,
        now_utc=datetime.combine(previous_week_end_date, datetime.min.time(), tzinfo=UTC) + timedelta(hours=12),
    )
    tier_before = _normalize_tier(profile.current_tier)
    standings, _ = _build_group_standings(
        db,
        tenant_id=tenant_id,
        tier=tier_before,
        child_id=child_id,
        week_start_at=previous_start_at,
        week_end_exclusive=previous_end_exclusive,
        week_start_date=previous_week_start_date,
    )
    position: int | None = None
    for index, row in enumerate(standings, start=1):
        if int(row[0]) == child_id:
            position = index
            break
    group_size = len(standings)
    status, _, _ = _classify_position(tier=tier_before, group_size=group_size, position=position)
    status_for_reward: LeagueResultStatus = status or "safe"
    tier_after = _next_tier(tier_before, status)
    reward_xp, reward_coins = _reward_for_status(status_for_reward)

    existing_reward = db.scalar(
        select(GameLeagueRewardClaim).where(
            GameLeagueRewardClaim.child_id == child_id,
            GameLeagueRewardClaim.cycle_week_start == previous_week_start_date,
        )
    )
    if existing_reward is None:
        db.add(
            GameLeagueRewardClaim(
                tenant_id=tenant_id,
                child_id=child_id,
                user_id=user_id,
                cycle_week_start=previous_week_start_date,
                cycle_week_end=previous_week_end_date,
                tier_from=tier_before,
                tier_to=tier_after,
                result_status=status_for_reward,
                position=position or group_size,
                group_size=max(group_size, 1),
                reward_xp=reward_xp,
                reward_coins=reward_coins,
            )
        )

    profile.current_tier = tier_after
    profile.last_cycle_applied_week_start = current_week_start_date
    db.flush()


def build_games_league_summary(
    db: Session,
    *,
    tenant_id: int,
    child_id: int,
    user_id: int,
    timezone_name: str | None = None,
) -> LeagueSummary:
    week_start_at, week_end_exclusive, week_start_date, week_end_date = _week_window(timezone_name)
    profile = _ensure_league_profile(
        db,
        tenant_id=tenant_id,
        child_id=child_id,
        user_id=user_id,
        current_week_start=week_start_date,
    )
    _apply_week_rollover(
        db,
        tenant_id=tenant_id,
        child_id=child_id,
        user_id=user_id,
        profile=profile,
        current_week_start_date=week_start_date,
        timezone_name=timezone_name,
    )
    tier = _normalize_tier(profile.current_tier)
    standings, group_numeric = _build_group_standings(
        db,
        tenant_id=tenant_id,
        tier=tier,
        child_id=child_id,
        week_start_at=week_start_at,
        week_end_exclusive=week_end_exclusive,
        week_start_date=week_start_date,
    )
    group_size = len(standings)
    me_position: int | None = None
    me_score = 0
    for index, row in enumerate(standings, start=1):
        if int(row[0]) == child_id:
            me_position = index
            me_score = int(row[1])
            break

    status, promotion_zone_max, relegation_zone_min = _classify_position(tier=tier, group_size=group_size, position=me_position)
    positions_to_promotion = None
    if promotion_zone_max > 0 and me_position is not None and me_position > promotion_zone_max:
        positions_to_promotion = me_position - promotion_zone_max

    top_ids = [int(item[0]) for item in standings[:5]]
    top_profiles = db.scalars(
        select(ChildProfile).where(
            ChildProfile.id.in_(top_ids),
            ChildProfile.tenant_id == tenant_id,
            ChildProfile.deleted_at.is_(None),
        )
    ).all()
    profile_map = {int(row.id): row for row in top_profiles}
    top_entries: list[LeagueTopEntry] = []
    for index, row in enumerate(standings[:5], start=1):
        profile_row = profile_map.get(int(row[0]))
        top_entries.append(
            LeagueTopEntry(
                position=index,
                player=_mask_name(profile_row.display_name if profile_row is not None else "Jogador"),
                avatar_key=(profile_row.avatar_key if profile_row is not None else None),
                score=int(row[1]),
            )
        )

    pending_reward = db.scalar(
        select(GameLeagueRewardClaim)
        .where(
            GameLeagueRewardClaim.tenant_id == tenant_id,
            GameLeagueRewardClaim.child_id == child_id,
            GameLeagueRewardClaim.claimed_at.is_(None),
        )
        .order_by(desc(GameLeagueRewardClaim.cycle_week_start))
    )
    reward_preview = LeagueRewardPreview(
        reward_xp=int(pending_reward.reward_xp) if pending_reward is not None else 0,
        reward_coins=int(pending_reward.reward_coins) if pending_reward is not None else 0,
        ready_to_claim=bool(pending_reward is not None),
        result_status=(_normalize_status(pending_reward.result_status) if pending_reward is not None else None),
        cycle_week_start=(pending_reward.cycle_week_start if pending_reward is not None else None),
        cycle_week_end=(pending_reward.cycle_week_end if pending_reward is not None else None),
    )

    if reward_preview.ready_to_claim:
        motivation = "Recompensa da liga pronta. Resgate antes da próxima rodada."
    elif status == "promoted":
        motivation = "Você está na zona de promoção. Continue para subir de liga."
    elif status == "relegated":
        motivation = "Atenção: zona de rebaixamento. Mais partidas para recuperar."
    elif positions_to_promotion:
        motivation = f"Faltam {positions_to_promotion} posições para entrar na promoção."
    else:
        motivation = "Você está estável nesta semana. Uma boa sequência pode levar ao topo."

    return LeagueSummary(
        tier=tier,
        tier_label=LEAGUE_LABELS[tier],
        group_id=f"{tier.lower()}-g{group_numeric:02d}",
        week_start=week_start_date,
        week_end=week_end_date,
        score_week=me_score,
        position=me_position,
        group_size=group_size,
        promotion_zone_max=promotion_zone_max,
        relegation_zone_min=relegation_zone_min,
        status=status,
        positions_to_promotion=positions_to_promotion,
        top_entries=top_entries,
        motivation_message=motivation,
        reward=reward_preview,
    )


def claim_games_league_reward(
    db: Session,
    *,
    tenant_id: int,
    child_id: int,
    beneficiary_user_id: int,
) -> LeagueClaimResult:
    reward = db.scalar(
        select(GameLeagueRewardClaim)
        .where(
            GameLeagueRewardClaim.tenant_id == tenant_id,
            GameLeagueRewardClaim.child_id == child_id,
        )
        .order_by(desc(GameLeagueRewardClaim.cycle_week_start))
    )
    if reward is None:
        return LeagueClaimResult(
            reward_granted=False,
            already_claimed=False,
            xp_reward=0,
            coin_reward=0,
            cycle_week_start=None,
            cycle_week_end=None,
            tier_from=None,
            tier_to=None,
            result_status=None,
        )
    if reward.claimed_at is not None:
        return LeagueClaimResult(
            reward_granted=False,
            already_claimed=True,
            xp_reward=int(reward.reward_xp),
            coin_reward=int(reward.reward_coins),
            cycle_week_start=reward.cycle_week_start,
            cycle_week_end=reward.cycle_week_end,
            tier_from=_normalize_tier(reward.tier_from),
            tier_to=_normalize_tier(reward.tier_to),
            result_status=_normalize_status(reward.result_status),
        )

    addXP(
        db,
        user_id=beneficiary_user_id,
        xp_amount=int(reward.reward_xp),
        target_date=date.today(),
        max_xp_per_day=100000,
    )
    addCoins(
        db,
        user_id=beneficiary_user_id,
        coin_amount=int(reward.reward_coins),
    )
    reward.claimed_at = datetime.now(UTC)
    db.flush()
    return LeagueClaimResult(
        reward_granted=True,
        already_claimed=False,
        xp_reward=int(reward.reward_xp),
        coin_reward=int(reward.reward_coins),
        cycle_week_start=reward.cycle_week_start,
        cycle_week_end=reward.cycle_week_end,
        tier_from=_normalize_tier(reward.tier_from),
        tier_to=_normalize_tier(reward.tier_to),
        result_status=_normalize_status(reward.result_status),
    )

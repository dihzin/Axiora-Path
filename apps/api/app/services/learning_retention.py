from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import and_, func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models import (
    ChildProfile,
    SeasonEvent,
    Subject,
    SubjectAgeGroup,
    UserCalendarActivity,
    UserLearningStreak,
    UserMissionProgress,
    WeeklyMission,
    WeeklyMissionType,
)
from app.services.aprender import age_group_from_birth_year
from app.services.gamification import addCoins, addXP


@dataclass(slots=True)
class MissionDelta:
    lessons_completed: int = 0
    xp_gained: int = 0
    perfect_scores: int = 0
    streak_days: int = 0
    mini_boss_wins: int = 0
    checkpoint_completed: int = 0
    from_game: bool = False


@dataclass(slots=True)
class MissionClaimResult:
    mission_id: str
    completed: bool
    reward_granted: bool
    xp_reward: int
    coin_reward: int


@dataclass(slots=True)
class SeasonBonus:
    xp_multiplier: float
    coin_multiplier: float
    active_theme_key: str | None = None


def _week_bounds(target_date: date) -> tuple[date, date]:
    monday = target_date - timedelta(days=target_date.weekday())
    sunday = monday + timedelta(days=6)
    return monday, sunday


def _resolve_user_age_group(db: Session, *, user_id: int, tenant_id: int | None) -> SubjectAgeGroup:
    if tenant_id is not None:
        child = db.scalar(
            select(ChildProfile)
            .where(
                ChildProfile.tenant_id == tenant_id,
                ChildProfile.deleted_at.is_(None),
            )
            .order_by(ChildProfile.id.asc())
        )
        if child is not None:
            return age_group_from_birth_year(birth_year=child.birth_year, now_year=date.today().year)
    return SubjectAgeGroup.AGE_9_12


def _pick_subject_for_age_group(db: Session, *, age_group: SubjectAgeGroup) -> int | None:
    subject = db.scalar(
        select(Subject)
        .where(Subject.age_group == age_group)
        .order_by(Subject.order.asc())
    )
    return subject.id if subject is not None else None


def _base_mission_blueprints(age_group: SubjectAgeGroup, subject_id: int | None) -> list[dict[str, object]]:
    if age_group == SubjectAgeGroup.AGE_6_8:
        return [
            {
                "title": "Explorador Curioso",
                "description": "Complete 5 lições nesta semana.",
                "mission_type": WeeklyMissionType.LESSONS_COMPLETED,
                "target": 5,
                "xp": 60,
                "coins": 20,
            },
            {
                "title": "Estrelas Brilhantes",
                "description": "Conquiste 3 sessões perfeitas.",
                "mission_type": WeeklyMissionType.PERFECT_SCORES,
                "target": 3,
                "xp": 55,
                "coins": 18,
            },
            {
                "title": "Chama da Sequência",
                "description": "Mantenha 3 dias de sequência.",
                "mission_type": WeeklyMissionType.STREAK_DAYS,
                "target": 3,
                "xp": 50,
                "coins": 15,
            },
        ]
    if age_group == SubjectAgeGroup.AGE_9_12:
        return [
            {
                "title": "Impulso de XP",
                "description": "Ganhe 200 XP na semana.",
                "mission_type": WeeklyMissionType.XP_GAINED,
                "target": 200,
                "xp": 70,
                "coins": 28,
            },
            {
                "title": "Caçador de Mini Chefes",
                "description": "Vença 2 mini-chefes.",
                "mission_type": WeeklyMissionType.MINI_BOSS_WINS,
                "target": 2,
                "xp": 75,
                "coins": 30,
            },
            {
                "title": "Checkpoint de Mestre",
                "description": "Conquiste 2 sessões com 3 estrelas.",
                "mission_type": WeeklyMissionType.PERFECT_SCORES,
                "target": 2,
                "xp": 55,
                "coins": 20,
                "subject_id": subject_id,
            },
        ]
    return [
        {
            "title": "Meta XP Avançada",
            "description": "Ganhe 400 XP nesta semana.",
            "mission_type": WeeklyMissionType.XP_GAINED,
            "target": 400,
            "xp": 90,
            "coins": 35,
        },
        {
            "title": "Sequência Consistente",
            "description": "Mantenha 5 dias de sequência.",
            "mission_type": WeeklyMissionType.STREAK_DAYS,
            "target": 5,
            "xp": 85,
            "coins": 32,
        },
        {
            "title": "Arena de Mini Chefes",
            "description": "Vença 2 mini-chefes na trilha.",
            "mission_type": WeeklyMissionType.MINI_BOSS_WINS,
            "target": 2,
            "xp": 95,
            "coins": 36,
        },
    ]


def get_active_season_events(db: Session, *, target_date: date | None = None) -> list[SeasonEvent]:
    today = target_date or date.today()
    try:
        return db.scalars(
            select(SeasonEvent).where(
                SeasonEvent.start_date <= today,
                SeasonEvent.end_date >= today,
            ).order_by(SeasonEvent.start_date.asc())
        ).all()
    except SQLAlchemyError:
        db.rollback()
        return []


def get_upcoming_season_event(db: Session, *, target_date: date | None = None) -> SeasonEvent | None:
    today = target_date or date.today()
    try:
        return db.scalar(
            select(SeasonEvent)
            .where(SeasonEvent.start_date > today)
            .order_by(SeasonEvent.start_date.asc())
        )
    except SQLAlchemyError:
        db.rollback()
        return None


def get_active_season_bonus(db: Session, *, target_date: date | None = None) -> SeasonBonus:
    events = get_active_season_events(db, target_date=target_date)
    if not events:
        return SeasonBonus(xp_multiplier=1.0, coin_multiplier=1.0, active_theme_key=None)
    best_xp = 1.0
    best_coin = 1.0
    theme_key: str | None = None
    for event in events:
        xp_mult = max(1.0, float(event.bonus_xp_multiplier))
        coin_mult = max(1.0, float(event.bonus_coin_multiplier))
        if xp_mult > best_xp or coin_mult > best_coin:
            theme_key = event.theme_key
        best_xp = max(best_xp, xp_mult)
        best_coin = max(best_coin, coin_mult)
    return SeasonBonus(xp_multiplier=best_xp, coin_multiplier=best_coin, active_theme_key=theme_key)


def _ensure_progress_rows(db: Session, *, user_id: int, missions: list[WeeklyMission]) -> None:
    for mission in missions:
        row = db.scalar(
            select(UserMissionProgress).where(
                UserMissionProgress.user_id == user_id,
                UserMissionProgress.mission_id == mission.id,
            )
        )
        if row is None:
            db.add(
                UserMissionProgress(
                    user_id=user_id,
                    mission_id=mission.id,
                    current_value=0,
                    completed=False,
                    reward_granted=False,
                )
            )
    db.flush()


def ensure_weekly_missions_for_user(
    db: Session,
    *,
    user_id: int,
    tenant_id: int | None,
    target_date: date | None = None,
) -> list[WeeklyMission]:
    today = target_date or date.today()
    start_date, end_date = _week_bounds(today)
    age_group = _resolve_user_age_group(db, user_id=user_id, tenant_id=tenant_id)
    subject_id = _pick_subject_for_age_group(db, age_group=age_group)

    current = db.scalars(
        select(WeeklyMission).where(
            WeeklyMission.age_group == age_group,
            WeeklyMission.start_date == start_date,
            WeeklyMission.end_date == end_date,
            WeeklyMission.is_seasonal.is_(False),
        )
    ).all()

    if len(current) < 3:
        existing_types = {mission.mission_type for mission in current}
        for blueprint in _base_mission_blueprints(age_group, subject_id):
            mission_type = blueprint["mission_type"]
            if mission_type in existing_types:
                continue
            db.add(
                WeeklyMission(
                    title=str(blueprint["title"]),
                    description=str(blueprint["description"]),
                    age_group=age_group,
                    subject_id=int(blueprint.get("subject_id", subject_id)) if blueprint.get("subject_id", subject_id) is not None else None,
                    mission_type=mission_type,
                    target_value=int(blueprint["target"]),
                    xp_reward=int(blueprint["xp"]),
                    coin_reward=int(blueprint["coins"]),
                    start_date=start_date,
                    end_date=end_date,
                    is_seasonal=False,
                    theme_key=None,
                )
            )
            existing_types.add(mission_type)
        db.flush()
        current = db.scalars(
            select(WeeklyMission).where(
                WeeklyMission.age_group == age_group,
                WeeklyMission.start_date == start_date,
                WeeklyMission.end_date == end_date,
                WeeklyMission.is_seasonal.is_(False),
            )
        ).all()

    active_events = get_active_season_events(db, target_date=today)
    if active_events:
        event = active_events[0]
        seasonal = db.scalar(
            select(WeeklyMission).where(
                WeeklyMission.age_group == age_group,
                WeeklyMission.start_date == start_date,
                WeeklyMission.end_date == end_date,
                WeeklyMission.is_seasonal.is_(True),
                WeeklyMission.theme_key == event.theme_key,
            )
        )
        if seasonal is None:
            db.add(
                WeeklyMission(
                    title=f"Missão da Temporada: {event.name}",
                    description="Participe da temporada e ganhe XP extra em atividades da semana.",
                    age_group=age_group,
                    subject_id=subject_id,
                    mission_type=WeeklyMissionType.XP_GAINED,
                    target_value=150 if age_group == SubjectAgeGroup.AGE_6_8 else 250 if age_group == SubjectAgeGroup.AGE_9_12 else 400,
                    xp_reward=80,
                    coin_reward=30,
                    start_date=start_date,
                    end_date=end_date,
                    is_seasonal=True,
                    theme_key=event.theme_key,
                )
            )
            db.flush()
            current = db.scalars(
                select(WeeklyMission).where(
                    WeeklyMission.age_group == age_group,
                    WeeklyMission.start_date == start_date,
                    WeeklyMission.end_date == end_date,
                )
            ).all()

    _ensure_progress_rows(db, user_id=user_id, missions=current)
    return current


def _mission_delta_value(mission_type: WeeklyMissionType, delta: MissionDelta) -> int:
    if mission_type == WeeklyMissionType.LESSONS_COMPLETED:
        return max(0, delta.lessons_completed + delta.checkpoint_completed)
    if mission_type == WeeklyMissionType.XP_GAINED:
        return max(0, delta.xp_gained)
    if mission_type == WeeklyMissionType.PERFECT_SCORES:
        return max(0, delta.perfect_scores)
    if mission_type == WeeklyMissionType.STREAK_DAYS:
        return max(0, delta.streak_days)
    if mission_type == WeeklyMissionType.MINI_BOSS_WINS:
        return max(0, delta.mini_boss_wins)
    return 0


def upsert_calendar_activity(
    db: Session,
    *,
    user_id: int,
    activity_date: date,
    lessons_completed: int = 0,
    xp_earned: int = 0,
    missions_completed: int = 0,
    streak_maintained: bool = False,
    perfect_sessions: int = 0,
) -> UserCalendarActivity:
    row = db.scalar(
        select(UserCalendarActivity).where(
            UserCalendarActivity.user_id == user_id,
            UserCalendarActivity.date == activity_date,
        )
    )
    if row is None:
        row = UserCalendarActivity(
            user_id=user_id,
            date=activity_date,
            lessons_completed=max(0, lessons_completed),
            xp_earned=max(0, xp_earned),
            missions_completed=max(0, missions_completed),
            streak_maintained=bool(streak_maintained),
            perfect_sessions=max(0, perfect_sessions),
        )
        db.add(row)
        db.flush()
        return row

    row.lessons_completed += max(0, lessons_completed)
    row.xp_earned += max(0, xp_earned)
    row.missions_completed += max(0, missions_completed)
    row.streak_maintained = row.streak_maintained or streak_maintained
    row.perfect_sessions += max(0, perfect_sessions)
    db.flush()
    return row


def claim_mission_reward(
    db: Session,
    *,
    user_id: int,
    mission_id: str,
) -> MissionClaimResult:
    mission = db.get(WeeklyMission, mission_id)
    if mission is None:
        raise ValueError("Mission not found")
    progress = db.scalar(
        select(UserMissionProgress).where(
            UserMissionProgress.user_id == user_id,
            UserMissionProgress.mission_id == mission_id,
        )
    )
    if progress is None:
        raise ValueError("Mission progress not found")
    if not progress.completed:
        raise ValueError("Mission is not completed yet")
    if progress.reward_granted:
        return MissionClaimResult(
            mission_id=mission_id,
            completed=True,
            reward_granted=True,
            xp_reward=0,
            coin_reward=0,
        )

    addXP(db, user_id=user_id, xp_amount=mission.xp_reward)
    addCoins(db, user_id=user_id, coin_amount=mission.coin_reward)
    progress.reward_granted = True
    upsert_calendar_activity(
        db,
        user_id=user_id,
        activity_date=date.today(),
        missions_completed=1,
    )
    return MissionClaimResult(
        mission_id=mission_id,
        completed=True,
        reward_granted=True,
        xp_reward=mission.xp_reward,
        coin_reward=mission.coin_reward,
    )


def track_mission_progress(
    db: Session,
    *,
    user_id: int,
    tenant_id: int | None,
    delta: MissionDelta,
    auto_claim: bool = True,
) -> list[MissionClaimResult]:
    today = date.today()
    missions = ensure_weekly_missions_for_user(db, user_id=user_id, tenant_id=tenant_id, target_date=today)
    progresses = db.scalars(
        select(UserMissionProgress).where(
            UserMissionProgress.user_id == user_id,
            UserMissionProgress.mission_id.in_([mission.id for mission in missions]),
        )
    ).all()
    progress_by_mission = {str(item.mission_id): item for item in progresses}

    claims: list[MissionClaimResult] = []
    for mission in missions:
        progress = progress_by_mission.get(str(mission.id))
        if progress is None:
            continue
        increment = _mission_delta_value(mission.mission_type, delta)
        if increment <= 0:
            continue
        progress.current_value = min(mission.target_value, int(progress.current_value) + increment)
        if progress.current_value >= mission.target_value and not progress.completed:
            progress.completed = True
            progress.completed_at = datetime.now(UTC)
        if auto_claim and progress.completed and not progress.reward_granted:
            claims.append(claim_mission_reward(db, user_id=user_id, mission_id=str(mission.id)))

    upsert_calendar_activity(
        db,
        user_id=user_id,
        activity_date=today,
        lessons_completed=delta.lessons_completed,
        xp_earned=delta.xp_gained,
        streak_maintained=delta.streak_days > 0,
        perfect_sessions=delta.perfect_scores,
    )
    return claims


def get_current_missions_snapshot(
    db: Session,
    *,
    user_id: int,
    tenant_id: int | None,
) -> tuple[list[tuple[WeeklyMission, UserMissionProgress]], dict[str, object]]:
    today = date.today()
    missions = ensure_weekly_missions_for_user(db, user_id=user_id, tenant_id=tenant_id, target_date=today)
    progress_rows = db.scalars(
        select(UserMissionProgress).where(
            UserMissionProgress.user_id == user_id,
            UserMissionProgress.mission_id.in_([mission.id for mission in missions]),
        )
    ).all()
    progress_by_mission = {str(row.mission_id): row for row in progress_rows}
    paired = [(mission, progress_by_mission[str(mission.id)]) for mission in missions if str(mission.id) in progress_by_mission]

    streak = db.scalar(select(UserLearningStreak).where(UserLearningStreak.user_id == user_id))
    current_streak = int(streak.current_streak if streak is not None else 0)
    longest_streak = int(streak.longest_streak if streak is not None else 0)

    last_activity = db.scalar(
        select(func.max(UserCalendarActivity.date)).where(UserCalendarActivity.user_id == user_id)
    )
    inactive_days = (today - last_activity).days if last_activity is not None else 999
    nudge = inactive_days >= 2
    almost_there = any(
        (not progress.completed and mission.target_value > 0 and (progress.current_value / mission.target_value) >= 0.8)
        for mission, progress in paired
    )

    upcoming = get_upcoming_season_event(db, target_date=today)
    countdown_days = (upcoming.start_date - today).days if upcoming is not None else None

    meta = {
        "currentStreak": current_streak,
        "longestStreak": longest_streak,
        "almostThere": almost_there,
        "showNudge": nudge,
        "nudgeMessage": "Missão quase lá! Você está evoluindo muito bem." if almost_there else "Seu mapa sente sua falta. Que tal uma missão curtinha hoje?" if nudge else "",
        "upcomingSeasonalEvent": (
            {
                "name": upcoming.name,
                "themeKey": upcoming.theme_key,
                "startsInDays": countdown_days,
            }
            if upcoming is not None
            else None
        ),
    }
    return paired, meta


def get_calendar_activity_snapshot(
    db: Session,
    *,
    user_id: int,
    month: int,
    year: int,
) -> tuple[list[UserCalendarActivity], int, int]:
    safe_month = min(12, max(1, month))
    safe_year = min(2100, max(2000, year))
    start = date(safe_year, safe_month, 1)
    end = date(safe_year + 1, 1, 1) if safe_month == 12 else date(safe_year, safe_month + 1, 1)
    rows = db.scalars(
        select(UserCalendarActivity)
        .where(
            UserCalendarActivity.user_id == user_id,
            and_(
                UserCalendarActivity.date >= start,
                UserCalendarActivity.date < end,
            ),
        )
        .order_by(UserCalendarActivity.date.asc())
    ).all()
    streak = db.scalar(select(UserLearningStreak).where(UserLearningStreak.user_id == user_id))
    current_streak = int(streak.current_streak if streak is not None else 0)
    longest_streak = int(streak.longest_streak if streak is not None else 0)
    return rows, current_streak, longest_streak

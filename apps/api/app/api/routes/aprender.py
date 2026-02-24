from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select

from app.api.deps import DBSession, get_current_tenant, get_current_user, require_role
from app.models import (
    Lesson,
    LessonContent,
    Membership,
    Subject,
    SubjectAgeGroup,
    Tenant,
    Unit,
    User,
)
from app.schemas.aprender import (
    GamificationSnapshotOut,
    LearningGamificationProfileOut,
    LearningEnergyConsumeResponse,
    LearningEnergyStatusOut,
    LearningStreakOut,
    LessonCompleteRequest,
    LessonCompleteResponse,
    LessonContentCreateRequest,
    LessonContentOut,
    LessonCreateRequest,
    LessonOut,
    LessonPathItemOut,
    LessonProgressOut,
    SubjectCreateRequest,
    SubjectOut,
    SubjectPathResponse,
    UnitCreateRequest,
    UnitOut,
    UnitPathItemOut,
)
from app.services.aprender import (
    LessonLockedError,
    LessonNotFoundError,
    SubjectNotFoundError,
    build_subject_path,
    complete_lesson,
    get_child_age_group,
    is_difficulty_allowed_for_age_group,
    list_lesson_contents,
)
from app.services.learning_energy import (
    EnergySnapshot,
    EnergyWaitRequiredError,
    InsufficientCoinsError,
    consume_wrong_answer_energy,
    get_energy_snapshot,
    refill_energy_with_coins,
    refill_energy_with_wait,
)
from app.services.learning_streak import LearningStreakSnapshot, get_learning_streak
from app.services.gamification import MAX_XP_PER_DAY, XP_PER_LEVEL, get_or_create_game_profile

router = APIRouter(prefix="/api/aprender", tags=["aprender"])

_GENERIC_SUBJECT_NAMES = {
    "aprender",
    "geral",
    "padrao",
    "default",
    "trilha",
}


def _normalize_subject_name(value: str | None) -> str:
    if not value:
        return ""
    normalized = value.strip().lower()
    replacements = {
        "á": "a",
        "à": "a",
        "â": "a",
        "ã": "a",
        "é": "e",
        "ê": "e",
        "í": "i",
        "ó": "o",
        "ô": "o",
        "õ": "o",
        "ú": "u",
        "ç": "c",
    }
    for source, target in replacements.items():
        normalized = normalized.replace(source, target)
    return normalized


def _to_energy_out(snapshot: EnergySnapshot) -> LearningEnergyStatusOut:
    return LearningEnergyStatusOut(
        energy=snapshot.energy,
        maxEnergy=snapshot.max_energy,
        canPlay=snapshot.can_play,
        secondsUntilPlayable=snapshot.seconds_until_playable,
        secondsUntilNextEnergy=snapshot.seconds_until_next_energy,
        refillCoinCost=snapshot.refill_coin_cost,
        axionCoins=snapshot.axion_coins,
    )


def _to_learning_streak_out(snapshot: LearningStreakSnapshot) -> LearningStreakOut:
    return LearningStreakOut(
        currentStreak=snapshot.current_streak,
        longestStreak=snapshot.longest_streak,
        lastLessonDate=snapshot.last_lesson_date,
        bonusCoinsGranted=snapshot.bonus_coins_granted,
        unlocked30DayBadge=snapshot.unlocked_30_day_badge,
    )


@router.get("/energy", response_model=LearningEnergyStatusOut)
def get_learning_energy(
    db: DBSession,
    _: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    __: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
) -> LearningEnergyStatusOut:
    snapshot = get_energy_snapshot(db, user_id=user.id)
    db.commit()
    return _to_energy_out(snapshot)


@router.post("/energy/consume-wrong", response_model=LearningEnergyConsumeResponse)
def consume_learning_energy_wrong(
    db: DBSession,
    _: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    __: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
) -> LearningEnergyConsumeResponse:
    before = get_energy_snapshot(db, user_id=user.id)
    after = consume_wrong_answer_energy(db, user_id=user.id)
    db.commit()
    consumed = after.energy < before.energy
    return LearningEnergyConsumeResponse(consumed=consumed, status=_to_energy_out(after))


@router.post("/energy/refill/wait", response_model=LearningEnergyStatusOut)
def refill_learning_energy_wait(
    db: DBSession,
    _: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    __: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
) -> LearningEnergyStatusOut:
    try:
        snapshot = refill_energy_with_wait(db, user_id=user.id)
    except EnergyWaitRequiredError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Energy is empty. Wait 30 minutes or use AxionCoins.",
        )
    db.commit()
    return _to_energy_out(snapshot)


@router.post("/energy/refill/coins", response_model=LearningEnergyStatusOut)
def refill_learning_energy_coins(
    db: DBSession,
    _: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    __: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
) -> LearningEnergyStatusOut:
    try:
        snapshot = refill_energy_with_coins(db, user_id=user.id)
    except InsufficientCoinsError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Not enough AxionCoins to refill energy.",
        )
    db.commit()
    return _to_energy_out(snapshot)


@router.get("/streak", response_model=LearningStreakOut)
def get_aprender_streak(
    db: DBSession,
    _: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    __: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
) -> LearningStreakOut:
    snapshot = get_learning_streak(db, user_id=user.id)
    db.commit()
    return _to_learning_streak_out(snapshot)


@router.get("/profile", response_model=LearningGamificationProfileOut)
def get_aprender_profile(
    db: DBSession,
    _: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    __: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
) -> LearningGamificationProfileOut:
    profile = get_or_create_game_profile(db, user_id=user.id)
    xp_in_level = max(0, profile.xp % XP_PER_LEVEL)
    xp_to_next_level = XP_PER_LEVEL
    xp_level_percent = int(round((xp_in_level / xp_to_next_level) * 100)) if xp_to_next_level > 0 else 0
    db.commit()
    return LearningGamificationProfileOut(
        xp=profile.xp,
        level=profile.level,
        dailyXp=profile.daily_xp,
        axionCoins=profile.axion_coins,
        xpLevelPercent=max(0, min(100, xp_level_percent)),
        xpInLevel=xp_in_level,
        xpToNextLevel=xp_to_next_level,
        maxDailyXp=MAX_XP_PER_DAY,
    )


@router.post("/subjects", response_model=SubjectOut, status_code=status.HTTP_201_CREATED)
def create_subject(
    payload: SubjectCreateRequest,
    db: DBSession,
    _: Annotated[Tenant, Depends(get_current_tenant)],
    __: Annotated[User, Depends(get_current_user)],
    ___: Annotated[Membership, Depends(require_role(["PARENT", "TEACHER"]))],
) -> SubjectOut:
    subject = Subject(
        name=payload.name,
        age_group=payload.age_group,
        icon=payload.icon,
        color=payload.color,
        order=payload.order,
    )
    db.add(subject)
    db.commit()
    db.refresh(subject)
    return SubjectOut(
        id=subject.id,
        name=subject.name,
        ageGroup=subject.age_group,
        icon=subject.icon,
        color=subject.color,
        order=subject.order,
    )


@router.get("/subjects", response_model=list[SubjectOut])
def list_subjects(
    db: DBSession,
    _: Annotated[Tenant, Depends(get_current_tenant)],
    __: Annotated[User, Depends(get_current_user)],
    membership: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
    age_group: Annotated[SubjectAgeGroup | None, Query(alias="ageGroup")] = None,
    child_id: Annotated[int | None, Query(alias="childId")] = None,
) -> list[SubjectOut]:
    target_age_group = age_group
    if target_age_group is None:
        if child_id is None and membership.role.value == "CHILD":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="childId is required for CHILD role",
            )
        if child_id is not None:
            target_age_group = get_child_age_group(
                db,
                child_id=child_id,
                now_year=date.today().year,
            )

    query = select(Subject).order_by(Subject.order.asc())
    if target_age_group is not None:
        query = query.where(Subject.age_group == target_age_group)
    subjects = db.scalars(query).all()
    non_generic = [item for item in subjects if _normalize_subject_name(item.name) not in _GENERIC_SUBJECT_NAMES]
    if non_generic:
        subjects = non_generic
    return [
        SubjectOut(
            id=subject.id,
            name=subject.name,
            ageGroup=subject.age_group,
            icon=subject.icon,
            color=subject.color,
            order=subject.order,
        )
        for subject in subjects
    ]


@router.post("/units", response_model=UnitOut, status_code=status.HTTP_201_CREATED)
def create_unit(
    payload: UnitCreateRequest,
    db: DBSession,
    _: Annotated[Tenant, Depends(get_current_tenant)],
    __: Annotated[User, Depends(get_current_user)],
    ___: Annotated[Membership, Depends(require_role(["PARENT", "TEACHER"]))],
) -> UnitOut:
    subject = db.get(Subject, payload.subject_id)
    if subject is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")

    unit = Unit(
        subject_id=payload.subject_id,
        title=payload.title,
        description=payload.description,
        order=payload.order,
        required_level=payload.required_level,
    )
    db.add(unit)
    db.commit()
    db.refresh(unit)
    return UnitOut(
        id=unit.id,
        subjectId=unit.subject_id,
        title=unit.title,
        description=unit.description,
        order=unit.order,
        requiredLevel=unit.required_level,
    )


@router.post("/lessons", response_model=LessonOut, status_code=status.HTTP_201_CREATED)
def create_lesson(
    payload: LessonCreateRequest,
    db: DBSession,
    _: Annotated[Tenant, Depends(get_current_tenant)],
    __: Annotated[User, Depends(get_current_user)],
    ___: Annotated[Membership, Depends(require_role(["PARENT", "TEACHER"]))],
) -> LessonOut:
    unit = db.get(Unit, payload.unit_id)
    if unit is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unit not found")
    subject = db.get(Subject, unit.subject_id)
    if subject is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")
    if not is_difficulty_allowed_for_age_group(
        difficulty=payload.difficulty,
        age_group=subject.age_group,
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Lesson difficulty is not allowed for this subject age group",
        )

    lesson = Lesson(
        unit_id=payload.unit_id,
        title=payload.title,
        order=payload.order,
        xp_reward=payload.xp_reward,
        difficulty=payload.difficulty,
        type=payload.type,
    )
    db.add(lesson)
    db.commit()
    db.refresh(lesson)
    return LessonOut(
        id=lesson.id,
        unitId=lesson.unit_id,
        title=lesson.title,
        order=lesson.order,
        xpReward=lesson.xp_reward,
        difficulty=lesson.difficulty,
        type=lesson.type,
    )


@router.post(
    "/lessons/{lesson_id}/contents",
    response_model=LessonContentOut,
    status_code=status.HTTP_201_CREATED,
)
def create_lesson_content(
    lesson_id: int,
    payload: LessonContentCreateRequest,
    db: DBSession,
    _: Annotated[Tenant, Depends(get_current_tenant)],
    __: Annotated[User, Depends(get_current_user)],
    ___: Annotated[Membership, Depends(require_role(["PARENT", "TEACHER"]))],
) -> LessonContentOut:
    lesson = db.get(Lesson, lesson_id)
    if lesson is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lesson not found")

    content = LessonContent(
        lesson_id=lesson_id,
        content_type=payload.content_type,
        content_data=payload.content_data,
        order=payload.order,
    )
    db.add(content)
    db.commit()
    db.refresh(content)
    return LessonContentOut(
        id=content.id,
        lessonId=content.lesson_id,
        contentType=content.content_type,
        contentData=content.content_data,
        order=content.order,
    )


@router.get("/lessons/{lesson_id}/contents", response_model=list[LessonContentOut])
def get_lesson_contents(
    lesson_id: int,
    db: DBSession,
    _: Annotated[Tenant, Depends(get_current_tenant)],
    __: Annotated[User, Depends(get_current_user)],
    ___: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
) -> list[LessonContentOut]:
    lesson = db.get(Lesson, lesson_id)
    if lesson is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lesson not found")

    contents = list_lesson_contents(db, lesson_id=lesson_id)
    return [
        LessonContentOut(
            id=item.id,
            lessonId=item.lesson_id,
            contentType=item.content_type,
            contentData=item.content_data,
            order=item.order,
        )
        for item in contents
    ]


@router.get("/subjects/{subject_id}/path", response_model=SubjectPathResponse)
def get_subject_path(
    subject_id: int,
    db: DBSession,
    _: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    membership: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
    child_id: Annotated[int | None, Query(alias="childId")] = None,
) -> SubjectPathResponse:
    target_age_group: SubjectAgeGroup | None = None
    if child_id is not None:
        target_age_group = get_child_age_group(db, child_id=child_id, now_year=date.today().year)
    elif membership.role.value == "CHILD":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="childId is required for CHILD role",
        )

    try:
        path = build_subject_path(db, user_id=user.id, subject_id=subject_id)
    except SubjectNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    if target_age_group is not None and path.subject.age_group != target_age_group:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Subject not available for this age group",
        )

    return SubjectPathResponse(
        subject=SubjectOut(
            id=path.subject.id,
            name=path.subject.name,
            ageGroup=path.subject.age_group,
            icon=path.subject.icon,
            color=path.subject.color,
            order=path.subject.order,
        ),
        userLevel=path.user_level,
        units=[
            UnitPathItemOut(
                id=unit_status.unit.id,
                title=unit_status.unit.title,
                description=unit_status.unit.description,
                order=unit_status.unit.order,
                requiredLevel=unit_status.unit.required_level,
                unlocked=unit_status.unlocked,
                completionRate=unit_status.completion_rate,
                lessons=[
                    LessonPathItemOut(
                        id=lesson_status.lesson.id,
                        title=lesson_status.lesson.title,
                        order=lesson_status.lesson.order,
                        xpReward=lesson_status.lesson.xp_reward,
                        difficulty=lesson_status.lesson.difficulty,
                        type=lesson_status.lesson.type,
                        unlocked=lesson_status.unlocked,
                        completed=lesson_status.completed,
                        score=lesson_status.score,
                        completedAt=lesson_status.completed_at,
                    )
                    for lesson_status in unit_status.lessons
                ],
            )
            for unit_status in path.units
        ],
    )


@router.post("/lessons/{lesson_id}/complete", response_model=LessonCompleteResponse)
def complete_lesson_endpoint(
    lesson_id: int,
    payload: LessonCompleteRequest,
    db: DBSession,
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
    user: Annotated[User, Depends(get_current_user)],
    __: Annotated[Membership, Depends(require_role(["CHILD", "PARENT", "TEACHER"]))],
) -> LessonCompleteResponse:
    try:
        result = complete_lesson(
            db,
            user_id=user.id,
            lesson_id=lesson_id,
            score=payload.score,
            tenant_id=tenant.id,
        )
    except LessonNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except LessonLockedError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc

    db.commit()
    db.refresh(result.progress)
    return LessonCompleteResponse(
        lessonProgress=LessonProgressOut(
            id=result.progress.id,
            userId=result.progress.user_id,
            lessonId=result.progress.lesson_id,
            completed=result.progress.completed,
            score=result.progress.score,
            attempts=result.progress.attempts,
            repeatRequired=result.progress.repeat_required,
            variationSeed=result.progress.variation_seed,
            completedAt=result.progress.completed_at,
        ),
        xpRequested=result.xp_requested,
        xpGranted=result.xp_granted,
        coinsRequested=result.coins_requested,
        coinsGranted=result.coins_granted,
        coinMultiplierApplied=result.coin_multiplier_applied,
        unitBoostActivated=result.unit_boost_activated,
        unitBoostMultiplier=result.unit_boost_multiplier,
        unitBoostRemainingLessons=result.unit_boost_remaining_lessons,
        repeatRequired=result.repeat_required,
        variationSeed=result.variation_seed,
        unlockedAchievements=result.unlocked_achievements,
        learningStreak=(
            _to_learning_streak_out(result.learning_streak)
            if result.learning_streak is not None
            else None
        ),
        gamification=GamificationSnapshotOut(
            xp=result.profile_xp,
            level=result.profile_level,
            dailyXp=result.profile_daily_xp,
        ),
    )

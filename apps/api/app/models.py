from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Any

from sqlalchemy import (
    Boolean,
    case,
    Date,
    DateTime,
    Enum as SqlEnum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    event,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


def _enum_values(enum_cls: type[Enum]) -> list[str]:
    return [str(item.value) for item in enum_cls]


class TenantType(str, Enum):
    FAMILY = "FAMILY"
    SCHOOL = "SCHOOL"
    SYSTEM_ADMIN = "SYSTEM_ADMIN"


class MembershipRole(str, Enum):
    PARENT = "PARENT"
    GUARDIAN = "GUARDIAN"
    DIRECTOR = "DIRECTOR"
    TEACHER = "TEACHER"
    STUDENT = "STUDENT"
    CHILD = "CHILD"
    PLATFORM_ADMIN = "PLATFORM_ADMIN"


TENANT_MEMBERSHIP_ROLES: dict[TenantType, set[MembershipRole]] = {
    TenantType.FAMILY: {
        MembershipRole.PARENT,
        MembershipRole.GUARDIAN,
        MembershipRole.CHILD,
    },
    TenantType.SCHOOL: {
        MembershipRole.DIRECTOR,
        MembershipRole.TEACHER,
        MembershipRole.STUDENT,
    },
    TenantType.SYSTEM_ADMIN: {
        MembershipRole.PLATFORM_ADMIN,
    },
}


class TaskDifficulty(str, Enum):
    EASY = "EASY"
    MEDIUM = "MEDIUM"
    HARD = "HARD"
    LEGENDARY = "LEGENDARY"


class TaskLogStatus(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class LedgerTransactionType(str, Enum):
    EARN = "EARN"
    SPEND = "SPEND"
    ADJUST = "ADJUST"
    ALLOWANCE = "ALLOWANCE"
    LOAN = "LOAN"


class PotType(str, Enum):
    SPEND = "SPEND"
    SAVE = "SAVE"
    DONATE = "DONATE"


class MoodType(str, Enum):
    HAPPY = "HAPPY"
    OK = "OK"
    SAD = "SAD"
    ANGRY = "ANGRY"
    TIRED = "TIRED"


class DailyMissionRarity(str, Enum):
    NORMAL = "normal"
    SPECIAL = "special"
    EPIC = "epic"


class DailyMissionStatus(str, Enum):
    PENDING = "pending"
    COMPLETED = "completed"


class DailyMissionSourceType(str, Enum):
    SYSTEM = "system"
    TEACHER = "teacher"
    PARENT = "parent"


class GameType(str, Enum):
    TICTACTOE = "TICTACTOE"
    WORDSEARCH = "WORDSEARCH"
    MEMORY = "MEMORY"
    CROSSWORD = "CROSSWORD"
    HANGMAN = "HANGMAN"
    FINANCE_SIM = "FINANCE_SIM"
    TUG_OF_WAR = "TUG_OF_WAR"
    QUIZ_BATTLE = "QUIZ_BATTLE"
    MATH_CHALLENGE = "MATH_CHALLENGE"
    PUZZLE_COOP = "PUZZLE_COOP"
    FINANCE_BATTLE = "FINANCE_BATTLE"


class SubjectAgeGroup(str, Enum):
    AGE_6_8 = "6-8"
    AGE_9_12 = "9-12"
    AGE_13_15 = "13-15"


class LessonType(str, Enum):
    STORY = "STORY"
    QUIZ = "QUIZ"
    DRAG_DROP = "DRAG_DROP"
    MULTIPLE_CHOICE = "MULTIPLE_CHOICE"
    INTERACTIVE = "INTERACTIVE"


class LessonContentType(str, Enum):
    TEXT = "TEXT"
    IMAGE = "IMAGE"
    AUDIO = "AUDIO"
    QUESTION = "QUESTION"


class LessonDifficulty(str, Enum):
    EASY = "EASY"
    MEDIUM = "MEDIUM"
    HARD = "HARD"


class QuestionType(str, Enum):
    MCQ = "MCQ"
    TRUE_FALSE = "TRUE_FALSE"
    DRAG_DROP = "DRAG_DROP"
    FILL_BLANK = "FILL_BLANK"
    MATCH = "MATCH"
    ORDERING = "ORDERING"
    TEMPLATE = "TEMPLATE"


class QuestionDifficulty(str, Enum):
    EASY = "EASY"
    MEDIUM = "MEDIUM"
    HARD = "HARD"


class QuestionResult(str, Enum):
    CORRECT = "CORRECT"
    WRONG = "WRONG"
    SKIPPED = "SKIPPED"


class QuestionTemplateType(str, Enum):
    MATH_ARITH = "MATH_ARITH"
    MATH_WORDPROB = "MATH_WORDPROB"
    PT_SENTENCE_ORDER = "PT_SENTENCE_ORDER"
    PT_PUNCTUATION = "PT_PUNCTUATION"
    PT_SYLLABLES = "PT_SYLLABLES"
    EN_VOCAB = "EN_VOCAB"


class PathEventType(str, Enum):
    CHEST = "CHEST"
    CHECKPOINT = "CHECKPOINT"
    MINI_BOSS = "MINI_BOSS"
    STORY_STOP = "STORY_STOP"
    BOOST = "BOOST"
    REVIEW_GATE = "REVIEW_GATE"


class PathEventRarity(str, Enum):
    COMMON = "COMMON"
    RARE = "RARE"
    EPIC = "EPIC"


class UserPathEventStatus(str, Enum):
    LOCKED = "LOCKED"
    AVAILABLE = "AVAILABLE"
    COMPLETED = "COMPLETED"
    SKIPPED = "SKIPPED"


class WeeklyMissionType(str, Enum):
    LESSONS_COMPLETED = "LESSONS_COMPLETED"
    XP_GAINED = "XP_GAINED"
    PERFECT_SCORES = "PERFECT_SCORES"
    STREAK_DAYS = "STREAK_DAYS"
    MINI_BOSS_WINS = "MINI_BOSS_WINS"


class AxionSignalType(str, Enum):
    LESSON_COMPLETED = "LESSON_COMPLETED"
    LESSON_FAILED = "LESSON_FAILED"
    GAME_PLAYED = "GAME_PLAYED"
    TASK_APPROVED = "TASK_APPROVED"
    TASK_REJECTED = "TASK_REJECTED"
    COIN_CONVERTED = "COIN_CONVERTED"
    INACTIVE_DAY = "INACTIVE_DAY"


class AxionDecisionContext(str, Enum):
    CHILD_TAB = "child_tab"
    BEFORE_LEARNING = "before_learning"
    AFTER_LEARNING = "after_learning"
    GAMES_TAB = "games_tab"
    WALLET_TAB = "wallet_tab"


class AxionMessageTone(str, Enum):
    CALM = "CALM"
    ENCOURAGE = "ENCOURAGE"
    CHALLENGE = "CHALLENGE"
    CELEBRATE = "CELEBRATE"
    SUPPORT = "SUPPORT"


class AxionRiskStatus(str, Enum):
    HEALTHY = "HEALTHY"
    AT_RISK = "AT_RISK"


class TemporaryBoostType(str, Enum):
    XP_MULTIPLIER = "XP_MULTIPLIER"
    DIFFICULTY_CAP = "DIFFICULTY_CAP"
    ENERGY_DISCOUNT = "ENERGY_DISCOUNT"


class AxionOutcomeMetricType(str, Enum):
    XP_GAIN = "XP_GAIN"
    SESSION_COMPLETED = "SESSION_COMPLETED"
    STREAK_MAINTAINED = "STREAK_MAINTAINED"
    REVIEW_DONE = "REVIEW_DONE"


class AxionFinanceRecurrence(str, Enum):
    NONE = "NONE"
    WEEKLY = "WEEKLY"
    MONTHLY = "MONTHLY"
    YEARLY = "YEARLY"


class AxionFinanceBillStatus(str, Enum):
    PENDING = "PENDING"
    PAID = "PAID"


class LLMUseCase(str, Enum):
    REWRITE_MESSAGE = "REWRITE_MESSAGE"
    EXPLAIN_MISTAKE = "EXPLAIN_MISTAKE"
    GENERATE_VARIANTS = "GENERATE_VARIANTS"
    PARENT_INSIGHT = "PARENT_INSIGHT"


class LLMUsageStatus(str, Enum):
    HIT = "HIT"
    MISS = "MISS"
    BLOCKED = "BLOCKED"
    FAILED = "FAILED"
    FALLBACK = "FALLBACK"


class Plan(Base):
    __tablename__ = "plans"

    name: Mapped[str] = mapped_column(String(32), primary_key=True)
    llm_daily_budget: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    llm_monthly_budget: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    nba_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    advanced_personalization_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )


class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    type: Mapped[TenantType] = mapped_column(
        SqlEnum(TenantType, name="tenant_type"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    parent_pin_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    onboarding_completed: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    monthly_allowance_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    plan_name: Mapped[str] = mapped_column(ForeignKey("plans.name"), nullable=False, server_default="FREE")
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )


class School(Base):
    __tablename__ = "schools"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)


class SchoolClass(Base):
    __tablename__ = "classes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    school_id: Mapped[int | None] = mapped_column(ForeignKey("schools.id"), nullable=True)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    failed_login_attempts: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )


class Membership(Base):
    __tablename__ = "memberships"
    __table_args__ = (
        Index("ix_memberships_tenant_id_created_at", "tenant_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    role: Mapped[MembershipRole] = mapped_column(
        SqlEnum(MembershipRole, name="membership_role"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )


class UserGameProfile(Base):
    __tablename__ = "user_game_profiles"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        nullable=False,
        server_default=text("gen_random_uuid()"),
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, unique=True)
    xp: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    level: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    axion_coins: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    daily_xp: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    last_xp_reset: Mapped[date] = mapped_column(Date, nullable=False, server_default=text("CURRENT_DATE"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class UserLearningStatus(Base):
    __tablename__ = "user_learning_status"
    __table_args__ = (
        UniqueConstraint("user_id", name="uq_user_learning_status_user_id"),
        Index("ix_user_learning_status_user_id", "user_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    energy: Mapped[int] = mapped_column(Integer, nullable=False, server_default="5")
    last_energy_update: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    unit_boost_multiplier: Mapped[float] = mapped_column(
        Numeric(4, 2),
        nullable=False,
        server_default="1.00",
    )
    unit_boost_remaining_lessons: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default="0",
    )
    event_boost_multiplier: Mapped[float] = mapped_column(
        Numeric(4, 2),
        nullable=False,
        server_default="1.00",
    )
    event_boost_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class UserLearningStreak(Base):
    __tablename__ = "user_learning_streak"
    __table_args__ = (
        UniqueConstraint("user_id", name="uq_user_learning_streak_user_id"),
        Index("ix_user_learning_streak_user_id", "user_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    current_streak: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    longest_streak: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    last_lesson_date: Mapped[date | None] = mapped_column(Date, nullable=True)


class GameSession(Base):
    __tablename__ = "game_sessions"
    __table_args__ = (
        Index("ix_game_sessions_user_id_created_at", "user_id", "created_at"),
        Index("ix_game_sessions_child_id_created_at", "child_id", "created_at"),
        Index("ix_game_sessions_child_game_id_created_at", "child_id", "game_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        nullable=False,
        server_default=text("gen_random_uuid()"),
    )
    tenant_id: Mapped[int | None] = mapped_column(ForeignKey("tenants.id"), nullable=True)
    child_id: Mapped[int | None] = mapped_column(ForeignKey("child_profiles.id"), nullable=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    game_type: Mapped[GameType] = mapped_column(
        SqlEnum(GameType, name="game_type"),
        nullable=False,
    )
    game_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    session_external_id: Mapped[str | None] = mapped_column(String(96), nullable=True)
    session_status: Mapped[str] = mapped_column(String(24), nullable=False, server_default="COMPLETED")
    multiplayer_mode: Mapped[str] = mapped_column(String(24), nullable=False, server_default="SOLO")
    join_token: Mapped[str | None] = mapped_column(String(96), nullable=True)
    join_code: Mapped[str | None] = mapped_column(String(12), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    metadata_payload: Mapped[dict[str, Any]] = mapped_column(
        "metadata",
        JSONB,
        nullable=False,
        server_default=text("'{}'::jsonb"),
    )
    score: Mapped[int] = mapped_column(Integer, nullable=False)
    accuracy: Mapped[float | None] = mapped_column(Numeric(5, 4), nullable=True)
    correct_answers: Mapped[int | None] = mapped_column(Integer, nullable=True)
    wrong_answers: Mapped[int | None] = mapped_column(Integer, nullable=True)
    streak: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_streak: Mapped[int | None] = mapped_column(Integer, nullable=True)
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    level_reached: Mapped[int | None] = mapped_column(Integer, nullable=True)
    completed: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    xp_earned: Mapped[int] = mapped_column(Integer, nullable=False)
    coins_earned: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class GameParticipant(Base):
    __tablename__ = "game_participants"
    __table_args__ = (
        UniqueConstraint("session_id", "user_id", name="uq_game_participants_session_user"),
        UniqueConstraint("session_id", "player_role", name="uq_game_participants_session_role"),
        Index("ix_game_participants_session_id", "session_id"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        nullable=False,
        server_default=text("gen_random_uuid()"),
    )
    session_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("game_sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    is_host: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    player_role: Mapped[str] = mapped_column(String(8), nullable=False)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class GamePersonalBest(Base):
    __tablename__ = "game_personal_bests"
    __table_args__ = (
        UniqueConstraint("child_id", "game_id", name="uq_game_personal_bests_child_game"),
        Index("ix_game_personal_bests_child_id", "child_id"),
        Index("ix_game_personal_bests_user_id", "user_id"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        nullable=False,
        server_default=text("gen_random_uuid()"),
    )
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    child_id: Mapped[int] = mapped_column(ForeignKey("child_profiles.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    game_id: Mapped[str] = mapped_column(String(64), nullable=False)
    best_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    best_streak: Mapped[int | None] = mapped_column(Integer, nullable=True)
    best_duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    best_result_payload: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        server_default=text("'{}'::jsonb"),
    )
    last_surpassed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class GameMetagameMissionClaim(Base):
    __tablename__ = "game_metagame_mission_claims"
    __table_args__ = (
        UniqueConstraint("child_id", "mission_scope", "mission_id", "period_start", name="uq_game_metagame_claims_child_scope_period"),
        Index("ix_game_metagame_claims_child_id_claimed_at", "child_id", "claimed_at"),
        Index("ix_game_metagame_claims_user_id_claimed_at", "user_id", "claimed_at"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        nullable=False,
        server_default=text("gen_random_uuid()"),
    )
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    child_id: Mapped[int] = mapped_column(ForeignKey("child_profiles.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    mission_scope: Mapped[str] = mapped_column(String(16), nullable=False)
    mission_id: Mapped[str] = mapped_column(String(64), nullable=False)
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    reward_xp: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    reward_coins: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    claimed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class GameLeagueProfile(Base):
    __tablename__ = "game_league_profiles"
    __table_args__ = (
        UniqueConstraint("tenant_id", "child_id", name="uq_game_league_profiles_tenant_child"),
        Index("ix_game_league_profiles_tenant_tier", "tenant_id", "current_tier"),
        Index("ix_game_league_profiles_tenant_last_cycle", "tenant_id", "last_cycle_applied_week_start"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        nullable=False,
        server_default=text("gen_random_uuid()"),
    )
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    child_id: Mapped[int] = mapped_column(ForeignKey("child_profiles.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    current_tier: Mapped[str] = mapped_column(String(24), nullable=False, server_default="BRONZE")
    last_cycle_applied_week_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class GameLeagueRewardClaim(Base):
    __tablename__ = "game_league_reward_claims"
    __table_args__ = (
        UniqueConstraint("child_id", "cycle_week_start", name="uq_game_league_reward_claims_child_cycle"),
        Index("ix_game_league_reward_claims_child_claimed_at", "child_id", "claimed_at"),
        Index("ix_game_league_reward_claims_tenant_cycle", "tenant_id", "cycle_week_start"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        nullable=False,
        server_default=text("gen_random_uuid()"),
    )
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    child_id: Mapped[int] = mapped_column(ForeignKey("child_profiles.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    cycle_week_start: Mapped[date] = mapped_column(Date, nullable=False)
    cycle_week_end: Mapped[date] = mapped_column(Date, nullable=False)
    tier_from: Mapped[str] = mapped_column(String(24), nullable=False)
    tier_to: Mapped[str] = mapped_column(String(24), nullable=False)
    result_status: Mapped[str] = mapped_column(String(24), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    group_size: Mapped[int] = mapped_column(Integer, nullable=False)
    reward_xp: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    reward_coins: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class GameMove(Base):
    __tablename__ = "game_moves"
    __table_args__ = (
        UniqueConstraint("session_id", "move_index", name="uq_game_moves_session_move_index"),
        Index("ix_game_moves_session_id", "session_id"),
        Index("ix_game_moves_user_id_created_at", "user_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        nullable=False,
        server_default=text("gen_random_uuid()"),
    )
    session_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("game_sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    move_index: Mapped[int] = mapped_column(Integer, nullable=False)
    move_payload: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        server_default=text("'{}'::jsonb"),
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class CoinConversion(Base):
    __tablename__ = "coin_conversions"
    __table_args__ = (
        Index("ix_coin_conversions_tenant_id_created_at", "tenant_id", "created_at"),
        Index("ix_coin_conversions_child_id_created_at", "child_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        nullable=False,
        server_default=text("gen_random_uuid()"),
    )
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    child_id: Mapped[int] = mapped_column(ForeignKey("child_profiles.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    coins_used: Mapped[int] = mapped_column(Integer, nullable=False)
    amount_generated: Mapped[int] = mapped_column(Integer, nullable=False)
    approved: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )


class StoreItem(Base):
    __tablename__ = "store_items"
    __table_args__ = (
        UniqueConstraint("name", "type", name="uq_store_items_name_type"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(64), nullable=False)
    price: Mapped[int] = mapped_column(Integer, nullable=False)
    rarity: Mapped[str] = mapped_column(String(32), nullable=False)
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )


class UserInventory(Base):
    __tablename__ = "user_inventory"
    __table_args__ = (
        UniqueConstraint("user_id", "item_id", name="uq_user_inventory_user_item"),
        Index("ix_user_inventory_user_id", "user_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    item_id: Mapped[int] = mapped_column(ForeignKey("store_items.id"), nullable=False)
    equipped: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )


class GameSettings(Base):
    __tablename__ = "game_settings"
    __table_args__ = (
        UniqueConstraint("tenant_id", "child_id", name="uq_game_settings_tenant_child"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    child_id: Mapped[int] = mapped_column(ForeignKey("child_profiles.id"), nullable=False)
    max_daily_xp: Mapped[int] = mapped_column(Integer, nullable=False, server_default="200")
    max_daily_learning_xp: Mapped[int] = mapped_column(Integer, nullable=False, server_default="200")
    max_weekly_coin_conversion: Mapped[int] = mapped_column(Integer, nullable=False, server_default="500")
    learning_coin_reward_multiplier: Mapped[float] = mapped_column(
        Numeric(4, 2),
        nullable=False,
        server_default="1.00",
    )
    enabled_games: Mapped[dict[str, bool]] = mapped_column(
        JSONB,
        nullable=False,
        server_default=text(
            '\'{"TICTACTOE": true, "WORDSEARCH": true, "CROSSWORD": true, "HANGMAN": true, "FINANCE_SIM": true}\'::jsonb',
        ),
    )
    require_approval_after_minutes: Mapped[int] = mapped_column(Integer, nullable=False, server_default="30")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class LearningSettings(Base):
    __tablename__ = "learning_settings"
    __table_args__ = (
        UniqueConstraint("tenant_id", "child_id", name="uq_learning_settings_tenant_child"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    child_id: Mapped[int] = mapped_column(ForeignKey("child_profiles.id"), nullable=False)
    max_daily_learning_xp: Mapped[int] = mapped_column(Integer, nullable=False, server_default="200")
    max_lessons_per_day: Mapped[int] = mapped_column(Integer, nullable=False, server_default="5")
    difficulty_ceiling: Mapped[QuestionDifficulty] = mapped_column(
        SqlEnum(QuestionDifficulty, name="question_difficulty"),
        nullable=False,
        server_default=text("'HARD'"),
    )
    enable_spaced_repetition: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    enable_coins_rewards: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    xp_multiplier: Mapped[float] = mapped_column(
        Numeric(4, 2),
        nullable=False,
        server_default="1.00",
    )
    coins_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    enabled_subjects: Mapped[dict[str, bool]] = mapped_column(
        JSONB,
        nullable=False,
        server_default=text("'{}'::jsonb"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class ChildProfile(Base):
    __tablename__ = "child_profiles"
    __table_args__ = (
        Index("ix_child_profiles_tenant_id", "tenant_id"),
        Index("ix_child_profiles_user_id", "user_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    avatar_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    date_of_birth: Mapped[date] = mapped_column(Date, nullable=False)
    axion_nba_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    birth_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    needs_profile_completion: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    theme: Mapped[str] = mapped_column(String(32), nullable=False, server_default="default")
    avatar_stage: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    xp_total: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    last_mission_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    @property
    def organization_id(self) -> int:
        return self.tenant_id

    @organization_id.setter
    def organization_id(self, value: int) -> None:
        self.tenant_id = value

    @property
    def name(self) -> str:
        return self.display_name

    @name.setter
    def name(self, value: str) -> None:
        self.display_name = value

    @property
    def birth_date(self) -> date:
        return self.date_of_birth

    @birth_date.setter
    def birth_date(self, value: date) -> None:
        self.date_of_birth = value


class StudentProfile(Base):
    __tablename__ = "student_profiles"
    __table_args__ = (
        Index("ix_student_profiles_tenant_id", "tenant_id"),
        Index("ix_student_profiles_child_profile_id", "child_profile_id"),
        Index("ix_student_profiles_user_id", "user_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    date_of_birth: Mapped[date] = mapped_column(Date, nullable=False)
    created_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    child_profile_id: Mapped[int | None] = mapped_column(ForeignKey("child_profiles.id"), nullable=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    @property
    def organization_id(self) -> int:
        return self.tenant_id

    @organization_id.setter
    def organization_id(self, value: int) -> None:
        self.tenant_id = value

    @property
    def name(self) -> str:
        return self.display_name

    @name.setter
    def name(self, value: str) -> None:
        self.display_name = value

    @property
    def birth_date(self) -> date:
        return self.date_of_birth

    @birth_date.setter
    def birth_date(self, value: date) -> None:
        self.date_of_birth = value


class TeacherStudent(Base):
    __tablename__ = "teacher_students"
    __table_args__ = (
        UniqueConstraint(
            "teacher_user_id",
            "student_profile_id",
            name="uq_teacher_students_teacher_user_student_profile",
        ),
        Index("ix_teacher_students_teacher_user_id", "teacher_user_id"),
        Index("ix_teacher_students_student_profile_id", "student_profile_id"),
    )

    teacher_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    student_profile_id: Mapped[int] = mapped_column(
        ForeignKey("student_profiles.id", ondelete="CASCADE"),
        primary_key=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class StudentFamilyLink(Base):
    __tablename__ = "student_family_links"
    __table_args__ = (
        UniqueConstraint(
            "student_profile_id",
            "child_profile_id",
            name="uq_student_family_links_student_profile_child_profile",
        ),
        Index("ix_student_family_links_student_profile_id", "student_profile_id"),
        Index("ix_student_family_links_child_profile_id", "child_profile_id"),
    )

    student_profile_id: Mapped[int] = mapped_column(
        ForeignKey("student_profiles.id", ondelete="CASCADE"),
        primary_key=True,
    )
    child_profile_id: Mapped[int] = mapped_column(
        ForeignKey("child_profiles.id", ondelete="CASCADE"),
        primary_key=True,
    )
    linked_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class SchoolFamilyLinkRequest(Base):
    __tablename__ = "school_family_link_requests"
    __table_args__ = (
        UniqueConstraint("token", name="uq_school_family_link_requests_token"),
        Index("ix_school_family_link_requests_student_profile_id", "student_profile_id"),
        Index("ix_school_family_link_requests_child_profile_id", "child_profile_id"),
        Index("ix_school_family_link_requests_status_expires_at", "status", "expires_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    student_profile_id: Mapped[int] = mapped_column(ForeignKey("student_profiles.id", ondelete="CASCADE"), nullable=False)
    child_profile_id: Mapped[int] = mapped_column(ForeignKey("child_profiles.id", ondelete="CASCADE"), nullable=False)
    requested_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    accepted_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    token: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default="pending")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class ChildGuardian(Base):
    __tablename__ = "child_guardians"
    __table_args__ = (
        UniqueConstraint("child_id", "user_id", name="uq_child_guardians_child_user"),
        Index("ix_child_guardians_child_id", "child_id"),
        Index("ix_child_guardians_user_id", "user_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    child_id: Mapped[int] = mapped_column(ForeignKey("child_profiles.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    relationship: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class FamilyGuardianInvitation(Base):
    __tablename__ = "family_guardian_invitations"
    __table_args__ = (
        UniqueConstraint("token", name="uq_family_guardian_invitations_token"),
        Index("ix_family_guardian_invitations_tenant_id_created_at", "tenant_id", "created_at"),
        Index("ix_family_guardian_invitations_email", "email"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    relationship: Mapped[str] = mapped_column(String(32), nullable=False)
    token: Mapped[str] = mapped_column(String(255), nullable=False)
    invited_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    accepted_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class AxionChildProfile(Base):
    __tablename__ = "axion_child_profile"
    __table_args__ = (
        Index("ix_axion_child_profile_last_updated_at", "last_updated_at"),
    )

    child_id: Mapped[int] = mapped_column(ForeignKey("child_profiles.id"), primary_key=True)
    mastery_score: Mapped[float] = mapped_column(Numeric(5, 4), nullable=False, server_default="0")
    frustration_index: Mapped[float] = mapped_column(Numeric(5, 4), nullable=False, server_default="0")
    engagement_score: Mapped[float] = mapped_column(Numeric(5, 4), nullable=False, server_default="0")
    streak_stability: Mapped[float] = mapped_column(Numeric(5, 4), nullable=False, server_default="0")
    risk_of_churn: Mapped[float] = mapped_column(Numeric(5, 4), nullable=False, server_default="0")
    confidence_score: Mapped[float] = mapped_column(Numeric(5, 4), nullable=False, server_default="0")
    last_updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    version: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    difficulty: Mapped[TaskDifficulty] = mapped_column(
        SqlEnum(TaskDifficulty, name="task_difficulty"),
        nullable=False,
    )
    weight: Mapped[int] = mapped_column(Integer, nullable=False)
    is_active: Mapped[bool] = mapped_column(nullable=False, server_default="true")
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class TaskLog(Base):
    __tablename__ = "task_logs"
    __table_args__ = (
        Index("ix_task_logs_tenant_id_created_at", "tenant_id", "created_at"),
        UniqueConstraint("child_id", "task_id", "date", name="uq_task_logs_child_id_task_id_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    child_id: Mapped[int] = mapped_column(ForeignKey("child_profiles.id"), nullable=False)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[TaskLogStatus] = mapped_column(
        SqlEnum(TaskLogStatus, name="task_log_status"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    decided_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    parent_comment: Mapped[str | None] = mapped_column(Text, nullable=True)


class Wallet(Base):
    __tablename__ = "wallets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    child_id: Mapped[int] = mapped_column(ForeignKey("child_profiles.id"), nullable=False)
    currency_code: Mapped[str] = mapped_column(String(8), nullable=False, server_default="BRL")


@event.listens_for(ChildProfile, "before_insert")
@event.listens_for(ChildProfile, "before_update")
def _validate_child_profile_family_tenant(_mapper: Any, connection: Any, target: ChildProfile) -> None:
    tenant_type = connection.execute(
        text("SELECT type FROM tenants WHERE id = :tenant_id"),
        {"tenant_id": target.tenant_id},
    ).scalar_one_or_none()
    if tenant_type is not None and str(tenant_type).upper() != TenantType.FAMILY.value:
        raise ValueError("child_profiles can only belong to FAMILY tenants")


@event.listens_for(Membership, "before_insert")
@event.listens_for(Membership, "before_update")
def _validate_membership_role_for_tenant(_mapper: Any, connection: Any, target: Membership) -> None:
    tenant_type_raw = connection.execute(
        text("SELECT type FROM tenants WHERE id = :tenant_id"),
        {"tenant_id": target.tenant_id},
    ).scalar_one_or_none()
    if tenant_type_raw is None:
        raise ValueError("memberships require an existing tenant")

    tenant_type = TenantType(str(tenant_type_raw).upper())
    allowed_roles = TENANT_MEMBERSHIP_ROLES[tenant_type]
    role_value = target.role if isinstance(target.role, MembershipRole) else MembershipRole(str(target.role).upper())
    if role_value not in allowed_roles:
        allowed = ", ".join(sorted(item.value for item in allowed_roles))
        raise ValueError(f"{tenant_type.value} tenants only allow membership roles: {allowed}")


@event.listens_for(StudentProfile, "before_insert")
@event.listens_for(StudentProfile, "before_update")
def _validate_student_profile_school_tenant(_mapper: Any, connection: Any, target: StudentProfile) -> None:
    tenant_type = connection.execute(
        text("SELECT type FROM tenants WHERE id = :tenant_id"),
        {"tenant_id": target.tenant_id},
    ).scalar_one_or_none()
    if tenant_type is None:
        raise ValueError("student_profiles require an existing tenant")
    if str(tenant_type).upper() != TenantType.SCHOOL.value:
        raise ValueError("student_profiles can only belong to SCHOOL tenants")


@event.listens_for(TeacherStudent, "before_insert")
@event.listens_for(TeacherStudent, "before_update")
def _validate_teacher_student_school_membership(_mapper: Any, connection: Any, target: TeacherStudent) -> None:
    student_row = connection.execute(
        text(
            """
            SELECT sp.tenant_id, t.type
            FROM student_profiles AS sp
            JOIN tenants AS t ON t.id = sp.tenant_id
            WHERE sp.id = :student_profile_id
            """
        ),
        {"student_profile_id": target.student_profile_id},
    ).first()
    if student_row is None:
        raise ValueError("teacher_students require an existing student profile")

    tenant_id = int(student_row[0])
    tenant_type = str(student_row[1]).upper()
    if tenant_type != TenantType.SCHOOL.value:
        raise ValueError("teacher_students can only reference student profiles from SCHOOL tenants")

    teacher_role = connection.execute(
        text(
            """
            SELECT role
            FROM memberships
            WHERE tenant_id = :tenant_id AND user_id = :teacher_user_id
            """
        ),
        {
            "tenant_id": tenant_id,
            "teacher_user_id": target.teacher_user_id,
        },
    ).scalar_one_or_none()
    if teacher_role is None or str(teacher_role).upper() != MembershipRole.TEACHER.value:
        raise ValueError("teacher_user_id must reference a TEACHER membership in the same SCHOOL tenant")


@event.listens_for(StudentFamilyLink, "before_insert")
@event.listens_for(StudentFamilyLink, "before_update")
def _validate_student_family_link_tenants(_mapper: Any, connection: Any, target: StudentFamilyLink) -> None:
    student_row = connection.execute(
        text(
            """
            SELECT sp.tenant_id, t.type
            FROM student_profiles AS sp
            JOIN tenants AS t ON t.id = sp.tenant_id
            WHERE sp.id = :student_profile_id
            """
        ),
        {"student_profile_id": target.student_profile_id},
    ).first()
    if student_row is None:
        raise ValueError("student_family_links require an existing student profile")

    child_row = connection.execute(
        text(
            """
            SELECT cp.tenant_id, t.type
            FROM child_profiles AS cp
            JOIN tenants AS t ON t.id = cp.tenant_id
            WHERE cp.id = :child_profile_id
            """
        ),
        {"child_profile_id": target.child_profile_id},
    ).first()
    if child_row is None:
        raise ValueError("student_family_links require an existing child profile")

    student_tenant_type = str(student_row[1]).upper()
    child_tenant_type = str(child_row[1]).upper()
    if student_tenant_type != TenantType.SCHOOL.value:
        raise ValueError("student_profile_id must belong to a SCHOOL tenant")
    if child_tenant_type != TenantType.FAMILY.value:
        raise ValueError("child_profile_id must belong to a FAMILY tenant")


class LedgerTransaction(Base):
    __tablename__ = "ledger_transactions"
    __table_args__ = (
        Index("ix_ledger_transactions_tenant_id_created_at", "tenant_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    wallet_id: Mapped[int] = mapped_column(ForeignKey("wallets.id"), nullable=False)
    type: Mapped[LedgerTransactionType] = mapped_column(
        SqlEnum(LedgerTransactionType, name="ledger_transaction_type"),
        nullable=False,
    )
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(
        "metadata",
        JSONB,
        nullable=False,
        server_default="{}",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )


class PotAllocation(Base):
    __tablename__ = "pot_allocations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    wallet_id: Mapped[int] = mapped_column(ForeignKey("wallets.id"), nullable=False)
    pot: Mapped[PotType] = mapped_column(
        SqlEnum(PotType, name="pot_type"),
        nullable=False,
    )
    percent: Mapped[int] = mapped_column(Integer, nullable=False)


class SavingGoal(Base):
    __tablename__ = "saving_goals"
    __table_args__ = (
        Index("ix_saving_goals_tenant_id_created_at", "tenant_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    child_id: Mapped[int] = mapped_column(ForeignKey("child_profiles.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    target_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_locked: Mapped[bool] = mapped_column(nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )


class EventLog(Base):
    __tablename__ = "event_log"
    __table_args__ = (
        Index("ix_event_log_tenant_id_created_at", "tenant_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    actor_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    child_id: Mapped[int | None] = mapped_column(ForeignKey("child_profiles.id"), nullable=True)
    type: Mapped[str] = mapped_column(String(255), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )


class AuditLog(Base):
    __tablename__ = "audit_log"
    __table_args__ = (
        Index("ix_audit_log_tenant_id_created_at", "tenant_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    actor_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(100), nullable=False)
    entity_id: Mapped[int] = mapped_column(Integer, nullable=False)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(
        "metadata",
        JSONB,
        nullable=False,
        server_default="{}",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )


class ParentalConsent(Base):
    __tablename__ = "parental_consent"

    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), primary_key=True)
    accepted_terms_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    accepted_privacy_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    data_retention_policy_version: Mapped[str] = mapped_column(String(32), nullable=False)


class FeatureFlag(Base):
    __tablename__ = "feature_flags"
    __table_args__ = (
        UniqueConstraint("name", "tenant_id", name="uq_feature_flags_name_tenant_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    enabled_globally: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    tenant_id: Mapped[int | None] = mapped_column(ForeignKey("tenants.id"), nullable=True)


class Achievement(Base):
    __tablename__ = "achievements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    icon: Mapped[str] = mapped_column(String(100), nullable=False)
    xp_reward: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    coin_reward: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    badge_key: Mapped[str | None] = mapped_column(String(100), nullable=True)
    slug: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    icon_key: Mapped[str] = mapped_column(String(100), nullable=False)
    condition_type: Mapped[str] = mapped_column(String(100), nullable=False)
    condition_value: Mapped[int] = mapped_column(Integer, nullable=False)


class ChildAchievement(Base):
    __tablename__ = "child_achievements"

    child_id: Mapped[int] = mapped_column(ForeignKey("child_profiles.id"), primary_key=True)
    achievement_id: Mapped[int] = mapped_column(ForeignKey("achievements.id"), primary_key=True)
    unlocked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )


class UserAchievement(Base):
    __tablename__ = "user_achievements"
    __table_args__ = (
        UniqueConstraint("user_id", "achievement_id", name="uq_user_achievements_user_achievement"),
        Index("ix_user_achievements_user_id", "user_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    achievement_id: Mapped[int] = mapped_column(ForeignKey("achievements.id"), nullable=False)
    unlocked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class Streak(Base):
    __tablename__ = "streaks"

    child_id: Mapped[int] = mapped_column(ForeignKey("child_profiles.id"), primary_key=True)
    current: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    last_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    freeze_used_today: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    freeze_tokens: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")


class Recommendation(Base):
    __tablename__ = "recommendations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    child_id: Mapped[int] = mapped_column(ForeignKey("child_profiles.id"), nullable=False)
    type: Mapped[str] = mapped_column(String(100), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    dismissed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class DailyMood(Base):
    __tablename__ = "daily_mood"

    child_id: Mapped[int] = mapped_column(ForeignKey("child_profiles.id"), primary_key=True)
    date: Mapped[date] = mapped_column(Date, primary_key=True)
    mood: Mapped[MoodType] = mapped_column(
        SqlEnum(MoodType, name="mood_type"),
        nullable=False,
    )


class AxionProfile(Base):
    __tablename__ = "axion_profile"

    child_id: Mapped[int] = mapped_column(ForeignKey("child_profiles.id"), primary_key=True)
    stage: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    mood_state: Mapped[str] = mapped_column(String(64), nullable=False, server_default="NEUTRAL")
    personality_seed: Mapped[str] = mapped_column(String(128), nullable=False)
    last_interaction_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class DailyMission(Base):
    __tablename__ = "daily_missions"
    __table_args__ = (
        Index("ix_daily_missions_tenant_id", "tenant_id"),
        Index("ix_daily_missions_child_id", "child_id"),
        Index("ix_daily_missions_date", "date"),
        Index("ix_daily_missions_child_id_date", "child_id", "date"),
        UniqueConstraint("child_id", "date", name="uq_daily_missions_child_id_date"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        nullable=False,
        server_default=text("gen_random_uuid()"),
    )
    tenant_id: Mapped[int | None] = mapped_column(ForeignKey("tenants.id"), nullable=True)
    child_id: Mapped[int] = mapped_column(ForeignKey("child_profiles.id"), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    source_type: Mapped[DailyMissionSourceType] = mapped_column(
        SqlEnum(DailyMissionSourceType, name="daily_mission_source_type", values_callable=_enum_values),
        nullable=False,
        server_default=text("'system'"),
    )
    source_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    school_id: Mapped[int | None] = mapped_column(ForeignKey("schools.id"), nullable=True)
    class_id: Mapped[int | None] = mapped_column(ForeignKey("classes.id"), nullable=True)
    rarity: Mapped[DailyMissionRarity] = mapped_column(
        SqlEnum(DailyMissionRarity, name="daily_mission_rarity", values_callable=_enum_values),
        nullable=False,
    )
    xp_reward: Mapped[int] = mapped_column(Integer, nullable=False)
    coin_reward: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[DailyMissionStatus] = mapped_column(
        SqlEnum(DailyMissionStatus, name="daily_mission_status", values_callable=_enum_values),
        nullable=False,
        server_default=text("'pending'"),
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )


class MissionTemplate(Base):
    __tablename__ = "mission_templates"
    __table_args__ = (
        Index("ix_mission_templates_tenant_id", "tenant_id"),
        Index("ix_mission_templates_school_id", "school_id"),
        Index("ix_mission_templates_class_id", "class_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    school_id: Mapped[int | None] = mapped_column(ForeignKey("schools.id"), nullable=True)
    class_id: Mapped[int | None] = mapped_column(ForeignKey("classes.id"), nullable=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    rarity: Mapped[DailyMissionRarity] = mapped_column(
        SqlEnum(DailyMissionRarity, name="daily_mission_rarity", values_callable=_enum_values),
        nullable=False,
    )
    base_xp: Mapped[int] = mapped_column(Integer, nullable=False)
    base_coin: Mapped[int] = mapped_column(Integer, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")


class Subject(Base):
    __tablename__ = "subjects"
    __table_args__ = (
        UniqueConstraint("age_group", "order", name="uq_subjects_age_group_order"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    age_group: Mapped[SubjectAgeGroup] = mapped_column(
        SqlEnum(SubjectAgeGroup, name="subject_age_group", values_callable=_enum_values),
        nullable=False,
    )
    icon: Mapped[str | None] = mapped_column(String(120), nullable=True)
    color: Mapped[str | None] = mapped_column(String(32), nullable=True)
    order: Mapped[int] = mapped_column(Integer, nullable=False)

    @hybrid_property
    def age_min(self) -> int:
        if self.age_group == SubjectAgeGroup.AGE_6_8:
            return 6
        if self.age_group == SubjectAgeGroup.AGE_9_12:
            return 9
        return 13

    @age_min.expression
    def age_min(cls):  # type: ignore[no-untyped-def]
        return case(
            (cls.age_group == SubjectAgeGroup.AGE_6_8, 6),
            (cls.age_group == SubjectAgeGroup.AGE_9_12, 9),
            else_=13,
        )

    @hybrid_property
    def age_max(self) -> int:
        if self.age_group == SubjectAgeGroup.AGE_6_8:
            return 8
        if self.age_group == SubjectAgeGroup.AGE_9_12:
            return 12
        return 15

    @age_max.expression
    def age_max(cls):  # type: ignore[no-untyped-def]
        return case(
            (cls.age_group == SubjectAgeGroup.AGE_6_8, 8),
            (cls.age_group == SubjectAgeGroup.AGE_9_12, 12),
            else_=15,
        )


class Unit(Base):
    __tablename__ = "units"
    __table_args__ = (
        UniqueConstraint("subject_id", "order", name="uq_units_subject_order"),
        Index("ix_units_subject_id", "subject_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    order: Mapped[int] = mapped_column(Integer, nullable=False)
    required_level: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")


class Lesson(Base):
    __tablename__ = "lessons"
    __table_args__ = (
        UniqueConstraint("unit_id", "order", name="uq_lessons_unit_order"),
        Index("ix_lessons_unit_id", "unit_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    unit_id: Mapped[int] = mapped_column(ForeignKey("units.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    order: Mapped[int] = mapped_column(Integer, nullable=False)
    xp_reward: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    difficulty: Mapped[LessonDifficulty] = mapped_column(
        SqlEnum(LessonDifficulty, name="lesson_difficulty"),
        nullable=False,
        server_default=text("'EASY'"),
    )
    type: Mapped[LessonType] = mapped_column(
        SqlEnum(LessonType, name="lesson_type"),
        nullable=False,
    )


class LessonContent(Base):
    __tablename__ = "lesson_contents"
    __table_args__ = (
        UniqueConstraint("lesson_id", "order", name="uq_lesson_contents_lesson_order"),
        Index("ix_lesson_contents_lesson_id", "lesson_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    lesson_id: Mapped[int] = mapped_column(ForeignKey("lessons.id"), nullable=False)
    content_type: Mapped[LessonContentType] = mapped_column(
        SqlEnum(LessonContentType, name="lesson_content_type"),
        nullable=False,
    )
    content_data: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default="{}")
    order: Mapped[int] = mapped_column(Integer, nullable=False)


class LessonProgress(Base):
    __tablename__ = "lesson_progress"
    __table_args__ = (
        UniqueConstraint("user_id", "lesson_id", name="uq_lesson_progress_user_lesson"),
        Index("ix_lesson_progress_user_id", "user_id"),
        Index("ix_lesson_progress_lesson_id", "lesson_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    lesson_id: Mapped[int] = mapped_column(ForeignKey("lessons.id"), nullable=False)
    completed: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    xp_granted: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    repeat_required: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    variation_seed: Mapped[str | None] = mapped_column(String(64), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Skill(Base):
    __tablename__ = "skills"
    __table_args__ = (
        UniqueConstraint("subject_id", "order", name="uq_skills_subject_order"),
        Index("ix_skills_subject_id", "subject_id"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        nullable=False,
        server_default=text("gen_random_uuid()"),
    )
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(140), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    age_group: Mapped[SubjectAgeGroup] = mapped_column(
        SqlEnum(SubjectAgeGroup, name="subject_age_group", values_callable=_enum_values),
        nullable=False,
    )
    order: Mapped[int] = mapped_column(Integer, nullable=False)


class LessonSkill(Base):
    __tablename__ = "lesson_skills"
    __table_args__ = (
        UniqueConstraint("lesson_id", "skill_id", name="uq_lesson_skills_lesson_skill"),
        Index("ix_lesson_skills_lesson_id", "lesson_id"),
        Index("ix_lesson_skills_skill_id", "skill_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    lesson_id: Mapped[int] = mapped_column(ForeignKey("lessons.id"), nullable=False)
    skill_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("skills.id"), nullable=False)
    weight: Mapped[float] = mapped_column(Numeric(4, 3), nullable=False, server_default="0.500")


class Question(Base):
    __tablename__ = "questions"
    __table_args__ = (
        Index("ix_questions_skill_id", "skill_id"),
        Index("ix_questions_lesson_id", "lesson_id"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        nullable=False,
        server_default=text("gen_random_uuid()"),
    )
    skill_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("skills.id"), nullable=False)
    lesson_id: Mapped[int | None] = mapped_column(ForeignKey("lessons.id"), nullable=True)
    type: Mapped[QuestionType] = mapped_column(
        SqlEnum(QuestionType, name="question_type"),
        nullable=False,
    )
    difficulty: Mapped[QuestionDifficulty] = mapped_column(
        SqlEnum(QuestionDifficulty, name="question_difficulty"),
        nullable=False,
    )
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_json: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, nullable=False, server_default="{}")
    tags: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, server_default=text("'{}'::text[]"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class QuestionVariant(Base):
    __tablename__ = "question_variants"
    __table_args__ = (
        Index("ix_question_variants_question_id", "question_id"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        nullable=False,
        server_default=text("gen_random_uuid()"),
    )
    question_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("questions.id"), nullable=False)
    variant_data: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default="{}")
    difficulty_override: Mapped[QuestionDifficulty | None] = mapped_column(
        SqlEnum(QuestionDifficulty, name="question_difficulty"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class QuestionTemplate(Base):
    __tablename__ = "question_templates"
    __table_args__ = (
        Index("ix_question_templates_skill_id", "skill_id"),
        Index("ix_question_templates_lesson_id", "lesson_id"),
        Index("ix_question_templates_type_difficulty", "template_type", "difficulty"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        nullable=False,
        server_default=text("gen_random_uuid()"),
    )
    skill_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("skills.id"), nullable=False)
    lesson_id: Mapped[int | None] = mapped_column(ForeignKey("lessons.id"), nullable=True)
    difficulty: Mapped[QuestionDifficulty] = mapped_column(
        SqlEnum(QuestionDifficulty, name="question_difficulty"),
        nullable=False,
    )
    template_type: Mapped[QuestionTemplateType] = mapped_column(
        SqlEnum(QuestionTemplateType, name="question_template_type"),
        nullable=False,
    )
    prompt_template: Mapped[str] = mapped_column(Text, nullable=False)
    explanation_template: Mapped[str | None] = mapped_column(Text, nullable=True)
    generator_spec: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default="{}")
    renderer_spec: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default="{}")
    tags: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, server_default=text("'{}'::text[]"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class GeneratedVariant(Base):
    __tablename__ = "generated_variants"
    __table_args__ = (
        Index("ix_generated_variants_user_template_created_at", "user_id", "template_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        nullable=False,
        server_default=text("gen_random_uuid()"),
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    template_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("question_templates.id"),
        nullable=False,
    )
    seed: Mapped[str] = mapped_column(String(128), nullable=False)
    variant_data: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class UserSkillMastery(Base):
    __tablename__ = "user_skill_mastery"
    __table_args__ = (
        UniqueConstraint("user_id", "skill_id", name="uq_user_skill_mastery_user_skill"),
        Index("ix_user_skill_mastery_user_id", "user_id"),
        Index("ix_user_skill_mastery_skill_id", "skill_id"),
        Index("ix_user_skill_mastery_next_review_at", "next_review_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    skill_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("skills.id"), nullable=False)
    mastery: Mapped[float] = mapped_column(Numeric(4, 3), nullable=False, server_default="0")
    streak_correct: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    streak_wrong: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    next_review_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class UserQuestionHistory(Base):
    __tablename__ = "user_question_history"
    __table_args__ = (
        Index("ix_user_question_history_user_id", "user_id"),
        Index("ix_user_question_history_question_id", "question_id"),
        Index("ix_user_question_history_created_at", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    question_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), ForeignKey("questions.id"), nullable=True)
    template_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("question_templates.id"),
        nullable=True,
    )
    generated_variant_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("generated_variants.id"),
        nullable=True,
    )
    variant_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("question_variants.id"),
        nullable=True,
    )
    result: Mapped[QuestionResult] = mapped_column(
        SqlEnum(QuestionResult, name="question_result"),
        nullable=False,
    )
    time_ms: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    difficulty_served: Mapped[QuestionDifficulty] = mapped_column(
        SqlEnum(QuestionDifficulty, name="question_difficulty"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class LearningSession(Base):
    __tablename__ = "learning_sessions"
    __table_args__ = (
        Index("ix_learning_sessions_user_id_started_at", "user_id", "started_at"),
        Index("ix_learning_sessions_subject_id", "subject_id"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        nullable=False,
        server_default=text("gen_random_uuid()"),
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id"), nullable=False)
    unit_id: Mapped[int | None] = mapped_column(ForeignKey("units.id"), nullable=True)
    lesson_id: Mapped[int | None] = mapped_column(ForeignKey("lessons.id"), nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    total_questions: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    correct_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    xp_earned: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    coins_earned: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")


class UserUXSettings(Base):
    __tablename__ = "user_ux_settings"
    __table_args__ = (
        UniqueConstraint("user_id", name="uq_user_ux_settings_user_id"),
        Index("ix_user_ux_settings_user_id", "user_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    sound_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    haptics_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    reduced_motion: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class WeeklyMission(Base):
    __tablename__ = "weekly_missions"
    __table_args__ = (
        Index("ix_weekly_missions_dates", "start_date", "end_date"),
        Index("ix_weekly_missions_age_group", "age_group"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        nullable=False,
        server_default=text("gen_random_uuid()"),
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    age_group: Mapped[SubjectAgeGroup] = mapped_column(
        SqlEnum(SubjectAgeGroup, name="subject_age_group", values_callable=_enum_values),
        nullable=False,
    )
    subject_id: Mapped[int | None] = mapped_column(ForeignKey("subjects.id"), nullable=True)
    mission_type: Mapped[WeeklyMissionType] = mapped_column(
        SqlEnum(WeeklyMissionType, name="weekly_mission_type"),
        nullable=False,
    )
    target_value: Mapped[int] = mapped_column(Integer, nullable=False)
    xp_reward: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    coin_reward: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    is_seasonal: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    theme_key: Mapped[str | None] = mapped_column(String(80), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class UserMissionProgress(Base):
    __tablename__ = "user_mission_progress"
    __table_args__ = (
        UniqueConstraint("user_id", "mission_id", name="uq_user_mission_progress_user_mission"),
        Index("ix_user_mission_progress_user_id", "user_id"),
        Index("ix_user_mission_progress_mission_id", "mission_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    mission_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("weekly_missions.id"), nullable=False)
    current_value: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    completed: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reward_granted: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")


class SeasonEvent(Base):
    __tablename__ = "season_events"
    __table_args__ = (
        Index("ix_season_events_dates", "start_date", "end_date"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        nullable=False,
        server_default=text("gen_random_uuid()"),
    )
    name: Mapped[str] = mapped_column(String(180), nullable=False)
    theme_key: Mapped[str] = mapped_column(String(80), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    background_style: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default="{}")
    bonus_xp_multiplier: Mapped[float] = mapped_column(Numeric(4, 2), nullable=False, server_default="1.00")
    bonus_coin_multiplier: Mapped[float] = mapped_column(Numeric(4, 2), nullable=False, server_default="1.00")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class UserCalendarActivity(Base):
    __tablename__ = "user_calendar_activity"
    __table_args__ = (
        UniqueConstraint("user_id", "date", name="uq_user_calendar_activity_user_date"),
        Index("ix_user_calendar_activity_user_id", "user_id"),
        Index("ix_user_calendar_activity_date", "date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    lessons_completed: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    xp_earned: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    missions_completed: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    streak_maintained: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    perfect_sessions: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")


class PathEvent(Base):
    __tablename__ = "path_events"
    __table_args__ = (
        Index("ix_path_events_subject_order", "subject_id", "order_index"),
        Index("ix_path_events_unit_lesson", "unit_id", "lesson_id"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        nullable=False,
        server_default=text("gen_random_uuid()"),
    )
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id"), nullable=False)
    age_group: Mapped[SubjectAgeGroup] = mapped_column(
        SqlEnum(SubjectAgeGroup, name="subject_age_group", values_callable=_enum_values),
        nullable=False,
    )
    unit_id: Mapped[int | None] = mapped_column(ForeignKey("units.id"), nullable=True)
    lesson_id: Mapped[int | None] = mapped_column(ForeignKey("lessons.id"), nullable=True)
    type: Mapped[PathEventType] = mapped_column(
        SqlEnum(PathEventType, name="path_event_type"),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    icon_key: Mapped[str] = mapped_column(String(80), nullable=False)
    rarity: Mapped[PathEventRarity] = mapped_column(
        SqlEnum(PathEventRarity, name="path_event_rarity"),
        nullable=False,
        server_default=text("'COMMON'"),
    )
    rules: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default="{}")
    order_index: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class UserPathEvent(Base):
    __tablename__ = "user_path_events"
    __table_args__ = (
        UniqueConstraint("user_id", "event_id", name="uq_user_path_events_user_event"),
        Index("ix_user_path_events_user_id", "user_id"),
        Index("ix_user_path_events_event_id", "event_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    event_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("path_events.id"), nullable=False)
    status: Mapped[UserPathEventStatus] = mapped_column(
        SqlEnum(UserPathEventStatus, name="user_path_event_status"),
        nullable=False,
        server_default=text("'LOCKED'"),
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reward_granted: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")


class UserBehaviorMetrics(Base):
    __tablename__ = "user_behavior_metrics"
    __table_args__ = (
        UniqueConstraint("user_id", name="uq_user_behavior_metrics_user_id"),
        Index("ix_user_behavior_metrics_user_id", "user_id"),
        Index("ix_user_behavior_metrics_updated_at", "updated_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    rhythm_score: Mapped[float] = mapped_column(Numeric(5, 4), nullable=False, server_default="0")
    frustration_score: Mapped[float] = mapped_column(Numeric(5, 4), nullable=False, server_default="0")
    confidence_score: Mapped[float] = mapped_column(Numeric(5, 4), nullable=False, server_default="0")
    dropout_risk: Mapped[float] = mapped_column(Numeric(5, 4), nullable=False, server_default="0")
    learning_momentum: Mapped[float] = mapped_column(Numeric(8, 4), nullable=False, server_default="0")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class AxionDecisionLog(Base):
    __tablename__ = "axion_decision_logs"
    __table_args__ = (
        Index("ix_axion_decision_logs_user_id", "user_id"),
        Index("ix_axion_decision_logs_created_at", "created_at"),
        Index("ix_axion_decision_logs_decision_type", "decision_type"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    decision_type: Mapped[str] = mapped_column(String(80), nullable=False)
    context: Mapped[str] = mapped_column(Text, nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class AxionMessageTemplate(Base):
    __tablename__ = "axion_message_templates"
    __table_args__ = (
        Index("ix_axion_message_templates_context", "context"),
        Index("ix_axion_message_templates_tone", "tone"),
        Index("ix_axion_message_templates_enabled", "enabled"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    context: Mapped[str] = mapped_column(String(80), nullable=False)
    tone: Mapped[AxionMessageTone] = mapped_column(
        SqlEnum(AxionMessageTone, name="axion_message_tone"),
        nullable=False,
        server_default=text("'ENCOURAGE'"),
    )
    tags: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, server_default=text("'{}'::text[]"))
    conditions: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default="{}")
    message_text: Mapped[str] = mapped_column("text", Text, nullable=False)
    weight: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class AxionMessageHistory(Base):
    __tablename__ = "axion_message_history"
    __table_args__ = (
        Index("ix_axion_message_history_user_used_at", "user_id", "used_at"),
        Index("ix_axion_message_history_template_id", "template_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    template_id: Mapped[int] = mapped_column(ForeignKey("axion_message_templates.id"), nullable=False)
    context: Mapped[str] = mapped_column(String(80), nullable=False)
    used_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class AxionPersona(Base):
    __tablename__ = "axion_personas"
    __table_args__ = (
        UniqueConstraint("name", name="uq_axion_personas_name"),
        Index("ix_axion_personas_name", "name"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    tone_bias: Mapped[str] = mapped_column(String(32), nullable=False)
    reward_bias: Mapped[float] = mapped_column(Numeric(4, 2), nullable=False, server_default="1.00")
    challenge_bias: Mapped[float] = mapped_column(Numeric(4, 2), nullable=False, server_default="1.00")
    message_style_key: Mapped[str] = mapped_column(String(80), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class UserPersonaState(Base):
    __tablename__ = "user_persona_state"
    __table_args__ = (
        Index("ix_user_persona_state_active_persona", "active_persona_id"),
    )

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    active_persona_id: Mapped[int] = mapped_column(ForeignKey("axion_personas.id"), nullable=False)
    auto_switch_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    last_switch_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class AxionUserState(Base):
    __tablename__ = "axion_user_state"
    __table_args__ = (
        UniqueConstraint("user_id", name="uq_axion_user_state_user_id"),
        Index("ix_axion_user_state_user_id", "user_id"),
        Index("ix_axion_user_state_updated_at", "updated_at"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        nullable=False,
        server_default=text("gen_random_uuid()"),
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    rhythm_score: Mapped[float] = mapped_column(Numeric(5, 4), nullable=False, server_default="0")
    frustration_score: Mapped[float] = mapped_column(Numeric(5, 4), nullable=False, server_default="0")
    confidence_score: Mapped[float] = mapped_column(Numeric(5, 4), nullable=False, server_default="0")
    dropout_risk_score: Mapped[float] = mapped_column(Numeric(5, 4), nullable=False, server_default="0")
    learning_momentum: Mapped[float] = mapped_column(Numeric(8, 4), nullable=False, server_default="0")
    risk_status: Mapped[AxionRiskStatus] = mapped_column(
        SqlEnum(AxionRiskStatus, name="axion_risk_status", values_callable=_enum_values),
        nullable=False,
        server_default=text("'HEALTHY'"),
    )
    last_active_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class AxionSignal(Base):
    __tablename__ = "axion_signals"
    __table_args__ = (
        Index("ix_axion_signals_user_id", "user_id"),
        Index("ix_axion_signals_type_created_at", "type", "created_at"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        nullable=False,
        server_default=text("gen_random_uuid()"),
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    type: Mapped[AxionSignalType] = mapped_column(
        SqlEnum(AxionSignalType, name="axion_signal_type"),
        nullable=False,
    )
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class AxionExperiment(Base):
    __tablename__ = "axion_experiments"
    __table_args__ = (
        Index("ix_axion_experiments_active_window", "active", "start_date", "end_date"),
        Index("ix_axion_experiments_experiment_id", "experiment_id"),
    )

    experiment_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    variant: Mapped[str] = mapped_column(String(80), primary_key=True)
    allocation_percentage: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    experiment_winner_variant: Mapped[str | None] = mapped_column(String(80), nullable=True)
    experiment_status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="ACTIVE")
    rollout_percent: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rollout_last_scaled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AxionFeatureRegistry(Base):
    __tablename__ = "axion_feature_registry"
    __table_args__ = (
        Index("ix_axion_feature_registry_active_created_at", "active", "created_at"),
        Index(
            "uq_axion_feature_registry_single_active",
            "active",
            unique=True,
            postgresql_where=text("active IS TRUE"),
        ),
    )

    version: Mapped[int] = mapped_column(Integer, primary_key=True)
    feature_schema_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")


class AxionFeatureSnapshot(Base):
    __tablename__ = "axion_feature_snapshot"
    __table_args__ = (
        Index("ix_axion_feature_snapshot_tenant_experiment_snapshot", "tenant_id", "experiment_key", "snapshot_at"),
        Index("ix_axion_feature_snapshot_user_snapshot", "user_id", "snapshot_at"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        nullable=False,
        server_default=text("gen_random_uuid()"),
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    experiment_key: Mapped[str | None] = mapped_column(String(80), nullable=True)
    variant: Mapped[str | None] = mapped_column(String(80), nullable=True)
    features_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    feature_version: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    snapshot_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class AxionShadowPolicyCandidate(Base):
    __tablename__ = "axion_shadow_policy_candidate"
    __table_args__ = (
        UniqueConstraint("tenant_id", "experiment_key", "policy_version", name="uq_axion_shadow_policy_candidate_version"),
        Index("ix_axion_shadow_policy_candidate_tenant_experiment_created_at", "tenant_id", "experiment_key", "created_at"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        nullable=False,
        server_default=text("gen_random_uuid()"),
    )
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    experiment_key: Mapped[str] = mapped_column(String(80), nullable=False)
    policy_version: Mapped[int] = mapped_column(Integer, nullable=False)
    weight_vector_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    expected_lift: Mapped[float] = mapped_column(Numeric(8, 4), nullable=False, server_default="0")
    confidence_score: Mapped[float] = mapped_column(Numeric(8, 4), nullable=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class AxionRewardContract(Base):
    __tablename__ = "axion_reward_contract"
    __table_args__ = (
        Index("ix_axion_reward_contract_active_created_at", "active", "created_at"),
        Index(
            "uq_axion_reward_contract_single_active",
            "active",
            unique=True,
            postgresql_where=text("active IS TRUE"),
        ),
    )

    version: Mapped[int] = mapped_column(Integer, primary_key=True)
    formula_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    weights_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")


class AxionPolicyStateHistory(Base):
    __tablename__ = "axion_policy_state_history"
    __table_args__ = (
        Index("ix_axion_policy_state_history_tenant_experiment_changed_at", "tenant_id", "experiment_key", "changed_at"),
        Index("ix_axion_policy_state_history_experiment_changed_at", "experiment_key", "changed_at"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        nullable=False,
        server_default=text("gen_random_uuid()"),
    )
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    experiment_key: Mapped[str] = mapped_column(String(80), nullable=False)
    from_state: Mapped[str] = mapped_column(String(20), nullable=False)
    to_state: Mapped[str] = mapped_column(String(20), nullable=False)
    actor_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    rollout_percentage: Mapped[int | None] = mapped_column(Integer, nullable=True)


class AxionHealthRunnerHeartbeat(Base):
    __tablename__ = "axion_health_runner_heartbeat"
    __table_args__ = (
        Index("ix_axion_health_runner_heartbeat_env_ran_at", "environment", "ran_at"),
        Index("ix_axion_health_runner_heartbeat_run_id", "run_id"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        nullable=False,
        server_default=text("gen_random_uuid()"),
    )
    environment: Mapped[str] = mapped_column(String(32), nullable=False)
    ran_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    run_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    experiments_attempted: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    experiments_processed: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    experiments_skipped_locked: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")


class AxionContentCatalog(Base):
    __tablename__ = "axion_content_catalog"
    __table_args__ = (
        Index("ix_axion_content_catalog_type_subject_active", "content_type", "subject", "is_active"),
        Index("ix_axion_content_catalog_age_active", "age_min", "age_max", "is_active"),
        Index("ix_axion_content_catalog_fingerprint", "content_fingerprint"),
    )

    content_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    content_type: Mapped[str] = mapped_column(String(32), nullable=False)
    subject: Mapped[str] = mapped_column(String(64), nullable=False)
    difficulty: Mapped[int] = mapped_column(Integer, nullable=False)
    age_min: Mapped[int] = mapped_column(Integer, nullable=False)
    age_max: Mapped[int] = mapped_column(Integer, nullable=False)
    safety_tags: Mapped[list[str]] = mapped_column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    content_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)


class ChildContentHistory(Base):
    __tablename__ = "child_content_history"
    __table_args__ = (
        Index("ix_child_content_history_tenant_child_served_at", "tenant_id", "child_id", "served_at"),
        Index("ix_child_content_history_fingerprint_served_at", "content_fingerprint", "served_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    child_id: Mapped[int] = mapped_column(ForeignKey("child_profiles.id"), nullable=False)
    content_id: Mapped[int] = mapped_column(ForeignKey("axion_content_catalog.content_id"), nullable=False)
    content_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    served_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    outcome: Mapped[str | None] = mapped_column(String(16), nullable=True)
    mastery_delta: Mapped[float | None] = mapped_column(Numeric(6, 4), nullable=True)


class ContentPrerequisite(Base):
    __tablename__ = "content_prerequisites"
    __table_args__ = (
        UniqueConstraint("content_id", "prerequisite_content_id", name="uq_content_prerequisites_pair"),
        Index("ix_content_prerequisites_content_id", "content_id"),
        Index("ix_content_prerequisites_prerequisite_content_id", "prerequisite_content_id"),
    )

    content_id: Mapped[int] = mapped_column(ForeignKey("axion_content_catalog.content_id", ondelete="CASCADE"), primary_key=True)
    prerequisite_content_id: Mapped[int] = mapped_column(
        ForeignKey("axion_content_catalog.content_id", ondelete="CASCADE"),
        primary_key=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class ChildSubjectMastery(Base):
    __tablename__ = "child_subject_mastery"
    __table_args__ = (
        UniqueConstraint("tenant_id", "child_id", "subject", name="uq_child_subject_mastery_scope"),
        Index("ix_child_subject_mastery_scope", "tenant_id", "child_id", "subject"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    child_id: Mapped[int] = mapped_column(ForeignKey("child_profiles.id"), nullable=False)
    subject: Mapped[str] = mapped_column(String(64), nullable=False)
    mastery_score: Mapped[float] = mapped_column(Numeric(5, 4), nullable=False, server_default="0")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class AxionDecision(Base):
    __tablename__ = "axion_decisions"
    __table_args__ = (
        Index("ix_axion_decisions_user_context_created_at", "user_id", "context", "created_at"),
        Index("ix_axion_decisions_tenant_child_context_created_at", "tenant_id", "child_id", "context", "created_at"),
        Index("ix_axion_decisions_cooldown_until", "cooldown_until"),
        Index("ix_axion_decisions_experiment_variant_created_at", "experiment_id", "variant", "created_at"),
        Index("ix_axion_decisions_experiment_key_variant_created_at", "experiment_key", "variant", "created_at"),
        Index("ix_axion_decisions_nba_reason_created_at", "nba_reason", "created_at"),
        Index("ix_axion_decisions_experiment_user_created_at", "experiment_key", "user_id", "created_at"),
        Index("ix_axion_decisions_experiment_id_user_created_at", "experiment_id", "user_id", "created_at"),
        Index("ix_axion_decisions_experiment_key_decided_at", "experiment_key", "decided_at"),
        Index(
            "uq_axion_decisions_tenant_correlation_id",
            "tenant_id",
            "correlation_id",
            unique=True,
            postgresql_where=text("correlation_id IS NOT NULL"),
        ),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        nullable=False,
        server_default=text("gen_random_uuid()"),
    )
    tenant_id: Mapped[int | None] = mapped_column(ForeignKey("tenants.id"), nullable=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    child_id: Mapped[int | None] = mapped_column(ForeignKey("child_profiles.id"), nullable=True)
    context: Mapped[AxionDecisionContext] = mapped_column(
        SqlEnum(AxionDecisionContext, name="axion_decision_context", values_callable=_enum_values),
        nullable=False,
    )
    experiment_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    experiment_key: Mapped[str | None] = mapped_column(String(80), nullable=True)
    variant: Mapped[str | None] = mapped_column(String(80), nullable=True)
    chosen_variant: Mapped[str | None] = mapped_column(String(80), nullable=True)
    action_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    source: Mapped[str | None] = mapped_column(String(40), nullable=True)
    cooldown_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    decided_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    decision_mode: Mapped[str] = mapped_column(String(20), nullable=False, server_default="level4")
    policy_state: Mapped[str | None] = mapped_column(String(20), nullable=True)
    policy_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    exploration_flag: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    reason_code: Mapped[str] = mapped_column(String(80), nullable=False, server_default="default")
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    nba_enabled_final: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    nba_reason: Mapped[str] = mapped_column(String(40), nullable=False, server_default="default")
    correlation_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    decisions: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB,
        nullable=False,
        server_default=text("'[]'::jsonb"),
    )
    primary_message_key: Mapped[str | None] = mapped_column(String(100), nullable=True)
    debug: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class AxionPolicyRule(Base):
    __tablename__ = "axion_policy_rules"
    __table_args__ = (
        Index("ix_axion_policy_rules_context_priority", "context", "priority"),
        Index("ix_axion_policy_rules_enabled", "enabled"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(140), nullable=False)
    context: Mapped[AxionDecisionContext] = mapped_column(
        SqlEnum(AxionDecisionContext, name="axion_decision_context", values_callable=_enum_values),
        nullable=False,
    )
    condition: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default="{}")
    actions: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB,
        nullable=False,
        server_default=text("'[]'::jsonb"),
    )
    priority: Mapped[int] = mapped_column(Integer, nullable=False, server_default="100")
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class UserTemporaryBoost(Base):
    __tablename__ = "user_temporary_boosts"
    __table_args__ = (
        Index("ix_user_temporary_boosts_user_type_expires", "user_id", "type", "expires_at"),
        Index("ix_user_temporary_boosts_expires_at", "expires_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    type: Mapped[TemporaryBoostType] = mapped_column(
        SqlEnum(TemporaryBoostType, name="temporary_boost_type"),
        nullable=False,
    )
    value: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default="{}")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class AxionPolicyRuleVersion(Base):
    __tablename__ = "axion_policy_rule_versions"
    __table_args__ = (
        UniqueConstraint("rule_id", "version", name="uq_axion_policy_rule_versions_rule_version"),
        Index("ix_axion_policy_rule_versions_rule_id", "rule_id"),
        Index("ix_axion_policy_rule_versions_created_at", "created_at"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        nullable=False,
        server_default=text("gen_random_uuid()"),
    )
    rule_id: Mapped[int] = mapped_column(ForeignKey("axion_policy_rules.id", ondelete="CASCADE"), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default="{}")
    created_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class AxionMessageTemplateVersion(Base):
    __tablename__ = "axion_message_template_versions"
    __table_args__ = (
        UniqueConstraint("template_id", "version", name="uq_axion_message_template_versions_template_version"),
        Index("ix_axion_message_template_versions_template_id", "template_id"),
        Index("ix_axion_message_template_versions_created_at", "created_at"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        nullable=False,
        server_default=text("gen_random_uuid()"),
    )
    template_id: Mapped[int] = mapped_column(ForeignKey("axion_message_templates.id", ondelete="CASCADE"), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default="{}")
    created_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class AxionStudioAuditLog(Base):
    __tablename__ = "axion_studio_audit_logs"
    __table_args__ = (
        Index("ix_axion_studio_audit_logs_actor_user_id", "actor_user_id"),
        Index("ix_axion_studio_audit_logs_entity", "entity_type", "entity_id"),
        Index("ix_axion_studio_audit_logs_created_at", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    actor_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    action: Mapped[str] = mapped_column(String(40), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(20), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(64), nullable=False)
    diff: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class AxionStudioFinanceBalance(Base):
    __tablename__ = "axion_studio_finance_balances"
    __table_args__ = (
        UniqueConstraint("tenant_id", name="uq_axion_studio_finance_balances_tenant_id"),
        Index("ix_axion_studio_finance_balances_tenant_id", "tenant_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    balance: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class AxionStudioFinanceBill(Base):
    __tablename__ = "axion_studio_finance_bills"
    __table_args__ = (
        Index("ix_axion_studio_finance_bills_tenant_due_date", "tenant_id", "due_date"),
        Index("ix_axion_studio_finance_bills_tenant_status_due_date", "tenant_id", "status", "due_date"),
        Index("ix_axion_studio_finance_bills_tenant_created_at", "tenant_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(120), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    recurrence: Mapped[AxionFinanceRecurrence] = mapped_column(
        SqlEnum(AxionFinanceRecurrence, name="axion_finance_recurrence", values_callable=_enum_values),
        nullable=False,
        server_default=AxionFinanceRecurrence.NONE.value,
    )
    status: Mapped[AxionFinanceBillStatus] = mapped_column(
        SqlEnum(AxionFinanceBillStatus, name="axion_finance_bill_status", values_callable=_enum_values),
        nullable=False,
        server_default=AxionFinanceBillStatus.PENDING.value,
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class AxionOutcomeMetric(Base):
    __tablename__ = "axion_outcome_metrics"
    __table_args__ = (
        UniqueConstraint("decision_id", "metric_type", "measured_at", name="uq_axion_outcome_metric_once"),
        Index("ix_axion_outcome_metrics_user_measured_at", "user_id", "measured_at"),
        Index("ix_axion_outcome_metrics_decision_id", "decision_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    decision_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("axion_decisions.id", ondelete="CASCADE"), nullable=False)
    metric_type: Mapped[AxionOutcomeMetricType] = mapped_column(
        SqlEnum(AxionOutcomeMetricType, name="axion_outcome_metric_type", values_callable=_enum_values),
        nullable=False,
    )
    value_before: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False, server_default="0")
    value_after: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False, server_default="0")
    delta: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False, server_default="0")
    measured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class LLMSettings(Base):
    __tablename__ = "llm_settings"
    __table_args__ = (
        UniqueConstraint("tenant_id", name="uq_llm_settings_tenant_id"),
        Index("ix_llm_settings_tenant_id", "tenant_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    provider_key: Mapped[str] = mapped_column(String(80), nullable=False, server_default=text("'noop'"))
    daily_token_budget: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    per_user_daily_limit: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    allowed_use_cases: Mapped[list[str]] = mapped_column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class LLMUsageLog(Base):
    __tablename__ = "llm_usage_logs"
    __table_args__ = (
        Index("ix_llm_usage_logs_tenant_created_at", "tenant_id", "created_at"),
        Index("ix_llm_usage_logs_user_created_at", "user_id", "created_at"),
        Index("ix_llm_usage_logs_use_case", "use_case"),
        Index("ix_llm_usage_logs_status", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    use_case: Mapped[LLMUseCase] = mapped_column(
        SqlEnum(LLMUseCase, name="llm_use_case", values_callable=_enum_values),
        nullable=False,
    )
    prompt_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    cache_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    tokens_estimated: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    latency_ms: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    status: Mapped[LLMUsageStatus] = mapped_column(
        SqlEnum(LLMUsageStatus, name="llm_usage_status", values_callable=_enum_values),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class LLMCache(Base):
    __tablename__ = "llm_cache"
    __table_args__ = (
        UniqueConstraint("cache_key", name="uq_llm_cache_cache_key"),
        Index("ix_llm_cache_expires_at", "expires_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    cache_key: Mapped[str] = mapped_column(String(255), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default="{}")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


DEFAULT_FAMILY_TASKS: list[dict[str, str | int | TaskDifficulty]] = [
    {"title": "Arrumar a cama", "difficulty": TaskDifficulty.EASY, "weight": 5},
    {"title": "Escovar os dentes", "difficulty": TaskDifficulty.EASY, "weight": 5},
    {"title": "Organizar os brinquedos", "difficulty": TaskDifficulty.EASY, "weight": 10},
    {"title": "Fazer a licao de casa", "difficulty": TaskDifficulty.MEDIUM, "weight": 15},
    {"title": "Ajudar na cozinha", "difficulty": TaskDifficulty.MEDIUM, "weight": 20},
    {"title": "Ler por 30 minutos", "difficulty": TaskDifficulty.HARD, "weight": 30},
    {"title": "Projeto especial da semana", "difficulty": TaskDifficulty.LEGENDARY, "weight": 50},
]


@event.listens_for(Tenant, "after_insert")
def seed_default_family_data(_, connection, target: Tenant) -> None:
    if target.type != TenantType.FAMILY:
        return

    today = date.today()
    try:
        default_dob = today.replace(year=today.year - 8)
    except ValueError:
        default_dob = today.replace(year=today.year - 8, day=28)

    child_id = connection.execute(
        ChildProfile.__table__.insert()
        .values(
            tenant_id=target.id,
            display_name="Child 1",
            avatar_key=None,
            date_of_birth=default_dob,
            birth_year=default_dob.year,
            needs_profile_completion=False,
        )
        .returning(ChildProfile.__table__.c.id),
    ).scalar_one()

    wallet_id = connection.execute(
        Wallet.__table__.insert()
        .values(
            tenant_id=target.id,
            child_id=child_id,
            currency_code="BRL",
        )
        .returning(Wallet.__table__.c.id),
    ).scalar_one()

    connection.execute(
        PotAllocation.__table__.insert(),
        [
            {
                "tenant_id": target.id,
                "wallet_id": wallet_id,
                "pot": PotType.SPEND,
                "percent": 50,
            },
            {
                "tenant_id": target.id,
                "wallet_id": wallet_id,
                "pot": PotType.SAVE,
                "percent": 30,
            },
            {
                "tenant_id": target.id,
                "wallet_id": wallet_id,
                "pot": PotType.DONATE,
                "percent": 20,
            },
        ],
    )

    task_rows = [
        {
            "tenant_id": target.id,
            "title": task["title"],
            "description": None,
            "difficulty": task["difficulty"],
            "weight": task["weight"],
            "is_active": True,
        }
        for task in DEFAULT_FAMILY_TASKS
    ]
    connection.execute(Task.__table__.insert(), task_rows)

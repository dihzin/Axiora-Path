from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Any

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum as SqlEnum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    event,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class TenantType(str, Enum):
    FAMILY = "FAMILY"
    SCHOOL = "SCHOOL"


class MembershipRole(str, Enum):
    PARENT = "PARENT"
    TEACHER = "TEACHER"
    CHILD = "CHILD"


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
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )


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


class ChildProfile(Base):
    __tablename__ = "child_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    avatar_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    birth_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    theme: Mapped[str] = mapped_column(String(32), nullable=False, server_default="default")
    avatar_stage: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    xp_total: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    last_mission_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


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
    slug: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
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
        SqlEnum(DailyMissionSourceType, name="daily_mission_source_type"),
        nullable=False,
        server_default=text("'system'"),
    )
    source_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    school_id: Mapped[int | None] = mapped_column(ForeignKey("schools.id"), nullable=True)
    class_id: Mapped[int | None] = mapped_column(ForeignKey("classes.id"), nullable=True)
    rarity: Mapped[DailyMissionRarity] = mapped_column(
        SqlEnum(DailyMissionRarity, name="daily_mission_rarity"),
        nullable=False,
    )
    xp_reward: Mapped[int] = mapped_column(Integer, nullable=False)
    coin_reward: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[DailyMissionStatus] = mapped_column(
        SqlEnum(DailyMissionStatus, name="daily_mission_status"),
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
        SqlEnum(DailyMissionRarity, name="daily_mission_rarity"),
        nullable=False,
    )
    base_xp: Mapped[int] = mapped_column(Integer, nullable=False)
    base_coin: Mapped[int] = mapped_column(Integer, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")


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

    child_id = connection.execute(
        ChildProfile.__table__.insert()
        .values(
            tenant_id=target.id,
            display_name="Child 1",
            avatar_key=None,
            birth_year=None,
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

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from typing import Any
from uuid import uuid4

from sqlalchemy import UniqueConstraint

from app.api.routes.daily_missions import get_daily_mission_history
from app.models import (
    ChildProfile,
    DailyMission,
    DailyMissionRarity,
    DailyMissionStatus,
    MembershipRole,
    PotAllocation,
    PotType,
    Streak,
    Tenant,
    TenantType,
    User,
    Wallet,
)
from app.services import daily_mission_service
from app.services.daily_mission_service import _resolve_rarity, complete_daily_mission_by_id, generate_daily_mission


class _FakeScalarResult:
    def __init__(self, values: list[Any]) -> None:
        self._values = values

    def all(self) -> list[Any]:
        return self._values


class _FakeEvents:
    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    def emit(self, **kwargs: Any) -> None:
        self.calls.append(kwargs)


class _FakeBeginContext:
    def __enter__(self) -> "_FakeBeginContext":
        return self

    def __exit__(self, exc_type: Any, exc: Any, tb: Any) -> bool:
        return False


class _FakeMissionGenerationDB:
    def __init__(self, streak: Streak | None) -> None:
        self.streak = streak
        self.mission: DailyMission | None = None
        self.pending_add: Any | None = None
        self.rollbacks = 0

    def scalar(self, query: Any) -> Any:
        sql = str(query)
        if "FROM daily_missions" in sql:
            return self.mission
        if "FROM task_logs" in sql:
            return None
        if "FROM saving_goals" in sql:
            return None
        return None

    def get(self, model: Any, _key: Any) -> Any:
        if model is Streak:
            return self.streak
        return None

    def add(self, obj: Any) -> None:
        self.pending_add = obj

    def commit(self) -> None:
        if isinstance(self.pending_add, DailyMission):
            if not self.pending_add.id:
                self.pending_add.id = str(uuid4())
            self.mission = self.pending_add

    def rollback(self) -> None:
        self.rollbacks += 1

    def refresh(self, _obj: Any) -> None:
        return


class _FakeMissionCompleteDB:
    def __init__(
        self,
        mission: DailyMission,
        child: ChildProfile,
        wallet: Wallet,
        allocations: list[PotAllocation],
    ) -> None:
        self._scalar_values: list[Any] = [mission, child, wallet]
        self._allocations = allocations
        self.added: list[Any] = []
        self._streak: Streak | None = None

    def begin(self) -> _FakeBeginContext:
        return _FakeBeginContext()

    def scalar(self, _query: Any) -> Any:
        return self._scalar_values.pop(0)

    def scalars(self, _query: Any) -> _FakeScalarResult:
        return _FakeScalarResult(self._allocations)

    def get(self, model: Any, _key: Any) -> Any:
        if model is Streak:
            return self._streak
        return None

    def add(self, obj: Any) -> None:
        self.added.append(obj)
        if isinstance(obj, Streak):
            self._streak = obj

    def flush(self) -> None:
        for obj in self.added:
            if isinstance(obj, DailyMission):
                continue
            if getattr(obj, "id", None) is None:
                obj.id = 999


class _FakeHistoryDB:
    def __init__(self, child: ChildProfile, missions: list[DailyMission]) -> None:
        self._child = child
        self._missions = missions
        self.scalars_called = False

    def scalar(self, _query: Any) -> Any:
        sql = str(_query)
        if "FROM feature_flags" in sql:
            return type("FeatureFlagStub", (), {"enabled_globally": True})()
        return self._child

    def scalars(self, query: Any) -> _FakeScalarResult:
        sql = str(query)
        assert "ORDER BY daily_missions.date DESC" in sql
        assert "LIMIT" in sql
        self.scalars_called = True
        return _FakeScalarResult(self._missions[:30])


def test_generate_daily_mission_is_unique_per_day(monkeypatch: Any) -> None:
    monkeypatch.setattr(daily_mission_service.random, "random", lambda: 0.99)
    monkeypatch.setattr(daily_mission_service.random, "randint", lambda a, _b: a)

    child = ChildProfile(tenant_id=1, display_name="Child", avatar_key=None, birth_year=None, xp_total=0)
    child.id = 10
    db = _FakeMissionGenerationDB(streak=None)

    first = generate_daily_mission(db, child)
    second = generate_daily_mission(db, child)

    assert first is second
    assert first.child_id == child.id


def test_rarity_respects_streak_thresholds(monkeypatch: Any) -> None:
    monkeypatch.setattr(daily_mission_service.random, "random", lambda: 0.10)
    assert _resolve_rarity(21) == DailyMissionRarity.EPIC

    monkeypatch.setattr(daily_mission_service.random, "random", lambda: 0.30)
    assert _resolve_rarity(21) == DailyMissionRarity.SPECIAL

    monkeypatch.setattr(daily_mission_service.random, "random", lambda: 0.20)
    assert _resolve_rarity(7) == DailyMissionRarity.SPECIAL

    monkeypatch.setattr(daily_mission_service.random, "random", lambda: 0.90)
    assert _resolve_rarity(6) == DailyMissionRarity.NORMAL


def test_complete_daily_mission_updates_child_xp(monkeypatch: Any) -> None:
    monkeypatch.setattr(daily_mission_service, "sync_locked_goals_for_child", lambda *_args, **_kwargs: [])

    mission = DailyMission(
        id=str(uuid4()),
        child_id=10,
        date=date.today(),
        title="Mission",
        description="Desc",
        rarity=DailyMissionRarity.NORMAL,
        xp_reward=18,
        coin_reward=9,
        status=DailyMissionStatus.PENDING,
        completed_at=None,
        created_at=datetime.now(UTC),
    )
    child = ChildProfile(tenant_id=1, display_name="Child", avatar_key=None, birth_year=None, xp_total=20)
    child.id = 10
    wallet = Wallet(tenant_id=1, child_id=10, currency_code="BRL")
    wallet.id = 30
    allocations = [
        PotAllocation(tenant_id=1, wallet_id=30, pot=PotType.SPEND, percent=50),
        PotAllocation(tenant_id=1, wallet_id=30, pot=PotType.SAVE, percent=30),
        PotAllocation(tenant_id=1, wallet_id=30, pot=PotType.DONATE, percent=20),
    ]
    db = _FakeMissionCompleteDB(mission=mission, child=child, wallet=wallet, allocations=allocations)
    events = _FakeEvents()
    tenant = Tenant(type=TenantType.FAMILY, name="Family", slug="family")
    tenant.id = 1
    user = User(email="parent@test.com", name="Parent", password_hash="x")
    user.id = 2

    completed_mission, xp_gained, streak_current = complete_daily_mission_by_id(
        db=db,  # type: ignore[arg-type]
        events=events,  # type: ignore[arg-type]
        tenant=tenant,
        user=user,
        mission_id=mission.id,
    )

    assert completed_mission.status == DailyMissionStatus.COMPLETED
    assert completed_mission.completed_at is not None
    assert xp_gained == 18
    assert child.xp_total == 38
    assert streak_current == 1
    assert [item["type"] for item in events.calls] == ["daily_mission.completed", "mission_completed"]


def test_daily_mission_model_has_unique_constraint_for_child_date() -> None:
    constraints = [item for item in DailyMission.__table_args__ if isinstance(item, UniqueConstraint)]
    assert any(tuple(constraint.columns.keys()) == ("child_id", "date") for constraint in constraints)


def test_daily_mission_history_is_limited_to_30_days_and_sorted_desc() -> None:
    child = ChildProfile(tenant_id=1, display_name="Child", avatar_key=None, birth_year=None, xp_total=0)
    child.id = 10
    start = date.today()
    missions = [
        DailyMission(
            id=str(uuid4()),
            child_id=child.id,
            date=start - timedelta(days=index),
            title=f"M{index}",
            description="x",
            rarity=DailyMissionRarity.NORMAL,
            xp_reward=10,
            coin_reward=5,
            status=DailyMissionStatus.PENDING,
            completed_at=None,
            created_at=datetime.now(UTC),
        )
        for index in range(35)
    ]
    db = _FakeHistoryDB(child=child, missions=missions)
    tenant = Tenant(type=TenantType.FAMILY, name="Family", slug="family")
    tenant.id = 1

    history = get_daily_mission_history(
        child_id=child.id,
        db=db,  # type: ignore[arg-type]
        tenant=tenant,
        _=User(email="u@test.com", name="U", password_hash="x"),
        __=MembershipRole.PARENT,  # type: ignore[arg-type]
    )

    assert db.scalars_called is True
    assert len(history) == 30
    assert all(history[index].date >= history[index + 1].date for index in range(len(history) - 1))

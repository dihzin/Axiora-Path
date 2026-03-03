from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Any

import pytest
from fastapi import HTTPException

from app.api.routes import routine as routine_routes
from app.api.routes.routine import decide_routine
from app.models import (
    ChildProfile,
    LedgerTransaction,
    MembershipRole,
    PotAllocation,
    PotType,
    Task,
    TaskDifficulty,
    TaskLog,
    TaskLogStatus,
    Tenant,
    TenantType,
    User,
    Wallet,
)
from app.schemas.routine import RoutineDecideRequest


class _FakeScalarResult:
    def __init__(self, values: list[Any]) -> None:
        self._values = values

    def all(self) -> list[Any]:
        return self._values


class _FakeDB:
    def __init__(self, scalar_values: list[Any], scalars_values: list[list[Any]]) -> None:
        self._scalar_values = scalar_values
        self._scalars_values = scalars_values
        self.added: list[Any] = []
        self.committed = False

    def scalar(self, _query: Any) -> Any:
        return self._scalar_values.pop(0)

    def scalars(self, _query: Any) -> _FakeScalarResult:
        return _FakeScalarResult(self._scalars_values.pop(0))

    def add(self, obj: Any) -> None:
        self.added.append(obj)

    def commit(self) -> None:
        self.committed = True


class _FakeEvents:
    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    def emit(self, **kwargs: Any) -> None:
        self.calls.append(kwargs)


def test_task_xp_awarded_once_per_day(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(routine_routes, "sync_locked_goals_for_child", lambda *_args, **_kwargs: [])

    log = TaskLog(
        tenant_id=1,
        child_id=10,
        task_id=20,
        date=date(2026, 2, 28),
        status=TaskLogStatus.PENDING,
        created_at=datetime.now(UTC),
    )
    log.id = 99
    task = Task(
        tenant_id=1,
        title="Arrumar quarto",
        description=None,
        difficulty=TaskDifficulty.MEDIUM,
        weight=3,
        is_active=True,
    )
    task.id = 20
    child = ChildProfile(tenant_id=1, display_name="Child", avatar_key=None, birth_year=None, xp_total=200)
    child.id = 10
    wallet = Wallet(tenant_id=1, child_id=10, currency_code="BRL")
    wallet.id = 33
    allocations = [
        PotAllocation(tenant_id=1, wallet_id=33, pot=PotType.SPEND, percent=50),
        PotAllocation(tenant_id=1, wallet_id=33, pot=PotType.SAVE, percent=30),
        PotAllocation(tenant_id=1, wallet_id=33, pot=PotType.DONATE, percent=20),
    ]

    tenant = Tenant(type=TenantType.FAMILY, name="Family", slug="family")
    tenant.id = 1
    user = User(email="parent@test.com", name="Parent", password_hash="x")
    user.id = 2

    db_first = _FakeDB(scalar_values=[log, task, child, wallet], scalars_values=[allocations])
    events_first = _FakeEvents()
    xp_before = child.xp_total

    result = decide_routine(
        payload=RoutineDecideRequest(log_id=log.id, decision="APPROVE"),
        db=db_first,  # type: ignore[arg-type]
        events=events_first,  # type: ignore[arg-type]
        tenant=tenant,
        user=user,
        _=MembershipRole.PARENT,  # type: ignore[arg-type]
    )

    xp_after_first = child.xp_total
    expected_delta = task.weight * routine_routes.XP_PER_WEIGHT
    assert result.status == "APPROVED"
    assert result.xp_awarded == expected_delta
    assert result.xp_source == routine_routes.TASK_XP_SOURCE
    assert xp_after_first == xp_before + expected_delta
    assert len([item for item in db_first.added if isinstance(item, LedgerTransaction)]) == 1

    db_replay = _FakeDB(scalar_values=[log], scalars_values=[])
    events_replay = _FakeEvents()
    with pytest.raises(HTTPException) as replay_exc:
        decide_routine(
            payload=RoutineDecideRequest(log_id=log.id, decision="APPROVE"),
            db=db_replay,  # type: ignore[arg-type]
            events=events_replay,  # type: ignore[arg-type]
            tenant=tenant,
            user=user,
            _=MembershipRole.PARENT,  # type: ignore[arg-type]
        )

    assert replay_exc.value.status_code == 409
    assert child.xp_total == xp_after_first
    assert db_replay.added == []
    assert events_replay.calls == []

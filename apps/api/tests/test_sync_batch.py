from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from app.api.routes import sync as sync_module
from app.api.routes.sync import sync_batch
from app.models import MembershipRole, Tenant, TenantType, User
from app.schemas.sync import SyncBatchRequest


class _FakeDB:
    def __init__(self) -> None:
        self.commit_count = 0
        self.rollback_count = 0

    def commit(self) -> None:
        self.commit_count += 1

    def rollback(self) -> None:
        self.rollback_count += 1


class _FakeEvents:
    pass


def test_sync_batch_processes_in_order_and_reports_failures(monkeypatch: Any) -> None:
    call_order: list[str] = []

    def fake_process_routine_mark(*_args: Any, **_kwargs: Any) -> None:
        call_order.append("routine.mark")

    def fake_process_coach_use(item: Any, *_args: Any, **_kwargs: Any) -> None:
        call_order.append("coach.use")
        if item.id == "2":
            raise ValueError("forced error")

    def fake_process_daily_mission_complete(*_args: Any, **_kwargs: Any) -> None:
        call_order.append("daily_mission.complete")

    monkeypatch.setattr(sync_module, "_process_routine_mark", fake_process_routine_mark)
    monkeypatch.setattr(sync_module, "_process_coach_use", fake_process_coach_use)
    monkeypatch.setattr(sync_module, "_process_daily_mission_complete", fake_process_daily_mission_complete)

    payload = SyncBatchRequest(
        items=[
            {
                "id": "1",
                "type": "routine.mark",
                "payload": {"child_id": 1, "task_id": 2, "date": "2026-02-17"},
                "createdAt": datetime.now(UTC),
            },
            {
                "id": "2",
                "type": "coach.use",
                "payload": {"child_id": 1, "mode": "PARENT"},
                "createdAt": datetime.now(UTC),
            },
            {
                "id": "3",
                "type": "daily_mission.complete",
                "payload": {"mission_id": "test-mission-id"},
                "createdAt": datetime.now(UTC),
            },
            {
                "id": "4",
                "type": "routine.mark",
                "payload": {"child_id": 1, "task_id": 3, "date": "2026-02-17"},
                "createdAt": datetime.now(UTC),
            },
        ],
    )
    db = _FakeDB()
    tenant = Tenant(type=TenantType.FAMILY, name="Family", slug="family")
    tenant.id = 1
    user = User(email="parent@test.com", name="Parent", password_hash="x")
    user.id = 5

    result = sync_batch(
        payload=payload,
        db=db,  # type: ignore[arg-type]
        events=_FakeEvents(),  # type: ignore[arg-type]
        tenant=tenant,
        user=user,
        _=MembershipRole.PARENT,  # type: ignore[arg-type]
    )

    assert call_order == ["routine.mark", "coach.use", "daily_mission.complete", "routine.mark"]
    assert result.processed == 3
    assert len(result.failed) == 1
    assert result.failed[0].id == "2"
    assert db.commit_count == 3
    assert db.rollback_count == 1

from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Any

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


def test_decide_approve_creates_earn_transaction() -> None:
    log = TaskLog(
        tenant_id=1,
        child_id=10,
        task_id=20,
        date=date(2026, 2, 17),
        status=TaskLogStatus.PENDING,
        created_at=datetime.now(UTC),
    )
    log.id = 1
    task = Task(
        tenant_id=1,
        title="Test",
        description=None,
        difficulty=TaskDifficulty.HARD,
        weight=2,
        is_active=True,
    )
    task.id = 20
    wallet = Wallet(tenant_id=1, child_id=10, currency_code="BRL")
    wallet.id = 30
    child = ChildProfile(tenant_id=1, display_name="Child", avatar_key=None, birth_year=None, xp_total=0)
    child.id = 10
    allocations = [
        PotAllocation(tenant_id=1, wallet_id=30, pot=PotType.SPEND, percent=50),
        PotAllocation(tenant_id=1, wallet_id=30, pot=PotType.SAVE, percent=30),
        PotAllocation(tenant_id=1, wallet_id=30, pot=PotType.DONATE, percent=20),
    ]
    db = _FakeDB(
        scalar_values=[log, task, child, wallet, wallet],
        scalars_values=[allocations, [], []],
    )
    events = _FakeEvents()
    tenant = Tenant(type=TenantType.FAMILY, name="Family", slug="family")
    tenant.id = 1
    user = User(email="parent@test.com", name="Parent", password_hash="x")
    user.id = 2

    result = decide_routine(
        payload=RoutineDecideRequest(log_id=1, decision="APPROVE", parent_comment="ok"),
        db=db,  # type: ignore[arg-type]
        events=events,  # type: ignore[arg-type]
        tenant=tenant,
        user=user,
        _=MembershipRole.PARENT,  # type: ignore[arg-type]
    )

    ledger_txs = [item for item in db.added if isinstance(item, LedgerTransaction)]
    assert len(ledger_txs) == 1
    tx = ledger_txs[0]
    assert tx.amount_cents == 400
    assert tx.type.value == "EARN"
    assert tx.metadata_json["pot_split"] == {"SPEND": 200, "SAVE": 120, "DONATE": 80}
    assert result.status == "APPROVED"
    assert db.committed is True
    assert events.calls[0]["type"] == "routine.approved"

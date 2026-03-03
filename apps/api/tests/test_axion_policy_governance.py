from __future__ import annotations

from app.models import AxionPolicyStateHistory
from app.services import axion_policy_governance as policy_gov


class _FakeDB:
    def __init__(self, current_state: str | None = None) -> None:
        self.current_state = current_state
        self.added: list[object] = []
        self.commits = 0
        self.flushes = 0

    def scalar(self, *_args, **_kwargs):
        return self.current_state

    def add(self, item: object) -> None:
        self.added.append(item)
        if isinstance(item, AxionPolicyStateHistory):
            self.current_state = item.to_state

    def flush(self) -> None:
        self.flushes += 1

    def commit(self) -> None:
        self.commits += 1


def test_invalid_transition_blocked() -> None:
    db = _FakeDB(current_state="SHADOW")
    try:
        policy_gov.transition_policy_state(
            db,
            tenant_id=1,
            experiment_key="nba_retention_v1",
            to_state="ACTIVE",
            actor_user_id=10,
        )
        raise AssertionError("expected invalid transition error")
    except ValueError as exc:
        assert "invalid_transition" in str(exc)
    assert db.commits == 0
    assert len(db.added) == 0


def test_policy_state_history_recorded() -> None:
    db = _FakeDB(current_state="SHADOW")
    result = policy_gov.transition_policy_state(
        db,
        tenant_id=1,
        experiment_key="nba_retention_v1",
        to_state="CANARY",
        actor_user_id=99,
        reason="manual_canary_start",
    )

    assert result.previous_state == "SHADOW"
    assert result.current_state == "CANARY"
    assert db.commits == 1
    history = [item for item in db.added if isinstance(item, AxionPolicyStateHistory)]
    assert len(history) == 1
    row = history[0]
    assert row.from_state == "SHADOW"
    assert row.to_state == "CANARY"
    assert row.tenant_id == 1
    assert row.experiment_key == "nba_retention_v1"
    assert row.actor_user_id == 99
    assert row.reason == "manual_canary_start"


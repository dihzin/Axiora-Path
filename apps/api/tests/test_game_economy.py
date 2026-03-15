from __future__ import annotations

from typing import Any

import pytest

from app.models import EventLog, UserGameProfile
from app.services import game_economy


class _FakeDB:
    def __init__(self) -> None:
        self.profile_by_user: dict[int, UserGameProfile] = {}
        self.added_events: list[EventLog] = []
        self.flush_calls = 0

    def scalar(self, _query: Any) -> UserGameProfile | None:
        return next(iter(self.profile_by_user.values()), None) if self.profile_by_user else None

    def add(self, obj: Any) -> None:
        if isinstance(obj, UserGameProfile):
            self.profile_by_user[int(obj.user_id)] = obj
        elif isinstance(obj, EventLog):
            self.added_events.append(obj)

    def flush(self) -> None:
        self.flush_calls += 1


def test_lookup_valid_event() -> None:
    reward = game_economy.get_economy_reward("GAME_PLAYED")
    assert reward.xp == 10
    assert reward.coins == 2
    assert reward.season_xp == 10


def test_lookup_invalid_event_raises_domain_error() -> None:
    with pytest.raises(game_economy.GameEconomyError):
        game_economy.get_economy_reward("INVALID_EVENT")  # type: ignore[arg-type]


def test_award_applies_xp_and_coins() -> None:
    db = _FakeDB()
    result = game_economy.award_economy_event(
        db,  # type: ignore[arg-type]
        child_id=10,
        beneficiary_user_id=200,
        tenant_id=1,
        event_type="GAME_WON",
    )
    profile = db.profile_by_user[200]
    assert result.granted.xp == 20
    assert result.granted.coins == 4
    assert profile.xp == 20
    assert profile.axion_coins == 4


def test_award_integrates_season_xp_log() -> None:
    db = _FakeDB()
    result = game_economy.award_economy_event(
        db,  # type: ignore[arg-type]
        child_id=15,
        beneficiary_user_id=300,
        tenant_id=2,
        event_type="WEEKLY_MISSION_COMPLETED",
        metadata={"origin": "test"},
    )
    assert result.granted.season_xp == 80
    assert len(db.added_events) == 1
    event = db.added_events[0]
    assert event.type == "games.season_xp.awarded"
    assert event.payload["seasonXp"] == 80
    assert event.payload["eventType"] == "WEEKLY_MISSION_COMPLETED"
    assert event.payload["origin"] == "test"


def test_event_with_zero_reward_does_not_break() -> None:
    db = _FakeDB()
    result = game_economy.award_economy_event(
        db,  # type: ignore[arg-type]
        child_id=20,
        beneficiary_user_id=400,
        tenant_id=3,
        event_type="SEASON_TIER_REWARD",
    )
    profile = db.profile_by_user[400]
    assert result.granted.xp == 0
    assert result.granted.coins == 0
    assert result.granted.season_xp == 0
    assert profile.xp == 0
    assert profile.axion_coins == 0
    assert len(db.added_events) == 0


def test_ownership_is_explicit_beneficiary_user() -> None:
    db = _FakeDB()
    result = game_economy.award_economy_event(
        db,  # type: ignore[arg-type]
        child_id=25,
        beneficiary_user_id=555,
        tenant_id=7,
        event_type="DAILY_MISSION_COMPLETED",
    )
    assert result.granted.xp == 40
    assert 555 in db.profile_by_user
    assert all(profile.user_id == 555 for profile in db.profile_by_user.values())


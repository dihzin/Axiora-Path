from __future__ import annotations

from datetime import UTC, date, datetime
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.routes import games as games_routes
from app.services import game_league


class _FakeScalarDB:
    def __init__(self, values: list[object | None]) -> None:
        self._values = values
        self.flush_calls = 0

    def scalar(self, _query: object) -> object | None:
        if self._values:
            return self._values.pop(0)
        return None

    def flush(self) -> None:
        self.flush_calls += 1


class _FakeScalarsResult:
    def __init__(self, values: list[object]) -> None:
        self._values = values

    def all(self) -> list[object]:
        return list(self._values)


class _FakeSummaryDB:
    def __init__(self, top_profiles: list[object], pending_reward: object | None) -> None:
        self._top_profiles = top_profiles
        self._pending_reward = pending_reward

    def scalars(self, _query: object) -> _FakeScalarsResult:
        return _FakeScalarsResult(self._top_profiles)

    def scalar(self, _query: object) -> object | None:
        return self._pending_reward

    def flush(self) -> None:
        return None


class _FakeRouteDB:
    def commit(self) -> None:
        return None


def test_claim_is_idempotent_and_grants_once(monkeypatch: pytest.MonkeyPatch) -> None:
    reward = SimpleNamespace(
        reward_xp=90,
        reward_coins=25,
        claimed_at=None,
        cycle_week_start=date(2026, 3, 2),
        cycle_week_end=date(2026, 3, 8),
        tier_from="BRONZE",
        tier_to="SILVER",
        result_status="promoted",
    )
    db = _FakeScalarDB([reward, reward])
    grants: list[tuple[str, int]] = []

    def _fake_add_xp(_db: object, *, user_id: int, xp_amount: int, target_date: date, max_xp_per_day: int) -> None:
        grants.append(("xp", user_id))

    def _fake_add_coins(_db: object, *, user_id: int, coin_amount: int) -> None:
        grants.append(("coins", user_id))

    monkeypatch.setattr(game_league, "addXP", _fake_add_xp)
    monkeypatch.setattr(game_league, "addCoins", _fake_add_coins)

    first = game_league.claim_games_league_reward(
        db,  # type: ignore[arg-type]
        tenant_id=1,
        child_id=10,
        beneficiary_user_id=123,
    )
    second = game_league.claim_games_league_reward(
        db,  # type: ignore[arg-type]
        tenant_id=1,
        child_id=10,
        beneficiary_user_id=123,
    )

    assert first.reward_granted is True
    assert second.already_claimed is True
    assert grants == [("xp", 123), ("coins", 123)]


@pytest.mark.parametrize("role_name", ["PARENT", "TEACHER"])
def test_route_claim_uses_child_user_id_not_actor(monkeypatch: pytest.MonkeyPatch, role_name: str) -> None:
    captured: dict[str, int] = {}

    def _fake_resolve_child_context(*_args: object, **_kwargs: object) -> SimpleNamespace:
        return SimpleNamespace(id=77, user_id=444)

    def _fake_claim(*_args: object, **kwargs: object) -> SimpleNamespace:
        captured["beneficiary_user_id"] = int(kwargs["beneficiary_user_id"])
        return SimpleNamespace(
            reward_granted=True,
            already_claimed=False,
            xp_reward=10,
            coin_reward=5,
            cycle_week_start=date(2026, 3, 2),
            cycle_week_end=date(2026, 3, 8),
            tier_from="BRONZE",
            tier_to="SILVER",
            result_status="promoted",
        )

    monkeypatch.setattr(games_routes, "_resolve_child_context", _fake_resolve_child_context)
    monkeypatch.setattr(games_routes, "claim_games_league_reward", _fake_claim)

    response = games_routes.claim_games_league(
        db=_FakeRouteDB(),
        tenant=SimpleNamespace(id=1),
        user=SimpleNamespace(id=999),
        membership=SimpleNamespace(role=SimpleNamespace(value=role_name)),
        childId=77,
    )
    assert response.reward_granted is True
    assert captured["beneficiary_user_id"] == 444


def test_route_claim_rejects_child_without_linked_user(monkeypatch: pytest.MonkeyPatch) -> None:
    def _fake_resolve_child_context(*_args: object, **_kwargs: object) -> SimpleNamespace:
        return SimpleNamespace(id=77, user_id=None)

    monkeypatch.setattr(games_routes, "_resolve_child_context", _fake_resolve_child_context)

    with pytest.raises(HTTPException) as exc:
        games_routes.claim_games_league(
            db=_FakeRouteDB(),
            tenant=SimpleNamespace(id=1),
            user=SimpleNamespace(id=999),
            membership=SimpleNamespace(role=SimpleNamespace(value="PARENT")),
            childId=77,
        )
    assert exc.value.status_code == 409
    assert "not linked to a user account" in str(exc.value.detail)


def test_route_claim_propagates_ambiguous_child_error(monkeypatch: pytest.MonkeyPatch) -> None:
    def _fake_resolve_child_context(*_args: object, **_kwargs: object) -> None:
        raise HTTPException(status_code=409, detail="Multiple children found. Provide childId explicitly.")

    monkeypatch.setattr(games_routes, "_resolve_child_context", _fake_resolve_child_context)

    with pytest.raises(HTTPException) as exc:
        games_routes.claim_games_league(
            db=_FakeRouteDB(),
            tenant=SimpleNamespace(id=1),
            user=SimpleNamespace(id=999),
            membership=SimpleNamespace(role=SimpleNamespace(value="PARENT")),
            childId=None,
        )
    assert exc.value.status_code == 409
    assert "Multiple children found" in str(exc.value.detail)


def test_classify_position_promote_and_relegate_edges() -> None:
    status_top, promotion_max, relegation_min = game_league._classify_position(tier="SILVER", group_size=20, position=2)
    status_bottom, _, relegation_bottom = game_league._classify_position(tier="SILVER", group_size=20, position=19)
    status_bronze, _, relegation_bronze = game_league._classify_position(tier="BRONZE", group_size=20, position=20)

    assert status_top == "promoted"
    assert promotion_max == 3
    assert relegation_min == 18
    assert status_bottom == "relegated"
    assert relegation_bottom == 18
    assert status_bronze == "safe"
    assert relegation_bronze is None


def test_summary_builds_with_expected_league_state(monkeypatch: pytest.MonkeyPatch) -> None:
    profile = SimpleNamespace(current_tier="SILVER", last_cycle_applied_week_start=date(2026, 3, 9))

    monkeypatch.setattr(game_league, "_ensure_league_profile", lambda *_args, **_kwargs: profile)
    monkeypatch.setattr(game_league, "_apply_week_rollover", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(
        game_league,
        "_build_group_standings",
        lambda *_args, **_kwargs: ([(10, 140, datetime.now(UTC)), (11, 110, datetime.now(UTC))], 1),
    )

    db = _FakeSummaryDB(
        top_profiles=[SimpleNamespace(id=10, display_name="Ana", avatar_key="a"), SimpleNamespace(id=11, display_name="Beto", avatar_key="b")],
        pending_reward=None,
    )
    summary = game_league.build_games_league_summary(
        db,  # type: ignore[arg-type]
        tenant_id=1,
        child_id=10,
        user_id=100,
        timezone_name="UTC",
    )
    assert summary.tier == "SILVER"
    assert summary.position == 1
    assert summary.score_week == 140
    assert len(summary.top_entries) == 2


def test_claim_without_pending_reward_is_safe_noop() -> None:
    db = _FakeScalarDB([None])
    result = game_league.claim_games_league_reward(
        db,  # type: ignore[arg-type]
        tenant_id=1,
        child_id=10,
        beneficiary_user_id=101,
    )
    assert result.reward_granted is False
    assert result.already_claimed is False
    assert result.xp_reward == 0
    assert result.coin_reward == 0


def test_league_claim_changes_do_not_break_weekly_ranking_route(monkeypatch: pytest.MonkeyPatch) -> None:
    def _fake_resolve_child_context(*_args: object, **_kwargs: object) -> SimpleNamespace:
        return SimpleNamespace(id=77, user_id=444)

    def _fake_weekly_snapshot(*_args: object, **_kwargs: object) -> SimpleNamespace:
        return SimpleNamespace(
            game_id="quiz",
            metric=SimpleNamespace(key="best_score", label="Pontuação", direction="desc", unit="pts"),
            week_start=date(2026, 3, 9),
            week_end=date(2026, 3, 15),
            top=[SimpleNamespace(position=1, player="An***", avatar_key=None, score=180.0, last_played_at=datetime.now(UTC))],
            me=SimpleNamespace(position=4, score=120.0, in_top=True, total_players=20),
        )

    monkeypatch.setattr(games_routes, "_resolve_child_context", _fake_resolve_child_context)
    monkeypatch.setattr(games_routes, "get_weekly_ranking_snapshot", _fake_weekly_snapshot)

    response = games_routes.get_game_weekly_ranking(
        game_id="quiz",
        db=_FakeRouteDB(),
        tenant=SimpleNamespace(id=1),
        user=SimpleNamespace(id=999),
        membership=SimpleNamespace(role=SimpleNamespace(value="PARENT")),
        childId=77,
        limit=10,
        timezone="UTC",
    )
    assert response.game_id == "quiz"
    assert response.me.position == 4

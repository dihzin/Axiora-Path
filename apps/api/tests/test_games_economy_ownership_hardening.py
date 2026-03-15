from __future__ import annotations

from contextlib import nullcontext
from dataclasses import replace
from datetime import UTC, date, datetime
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.routes import games as games_routes
from app.schemas.games import GameMetagameClaimRequest, GameSessionCompleteRequest, GameSessionCreateRequest
from app.services import game_metagame


class _FakeRouteDB:
    def begin_nested(self):  # noqa: ANN201
        return nullcontext()

    def commit(self) -> None:
        return None


@pytest.mark.parametrize("role_name", ["PARENT", "TEACHER"])
def test_metagame_claim_route_uses_child_beneficiary_not_actor(
    monkeypatch: pytest.MonkeyPatch, role_name: str
) -> None:
    captured: dict[str, int] = {}

    def _fake_resolve_child_context_and_beneficiary(*_args: object, **_kwargs: object) -> tuple[SimpleNamespace, int]:
        return SimpleNamespace(id=77, user_id=444), 444

    def _fake_claim(*_args: object, **kwargs: object) -> SimpleNamespace:
        captured["beneficiary_user_id"] = int(kwargs["beneficiary_user_id"])
        return SimpleNamespace(
            mission_id="daily_play_1",
            scope="daily",
            completed=True,
            reward_granted=True,
            already_claimed=False,
            xp_reward=20,
            coin_reward=5,
        )

    monkeypatch.setattr(games_routes, "_resolve_child_context_and_beneficiary", _fake_resolve_child_context_and_beneficiary)
    monkeypatch.setattr(games_routes, "claim_games_metagame_mission", _fake_claim)

    payload = GameMetagameClaimRequest.model_validate(
        {
            "childId": 77,
            "missionScope": "daily",
            "missionId": "daily_play_1",
        }
    )
    response = games_routes.claim_games_metagame(
        payload=payload,
        db=_FakeRouteDB(),
        tenant=SimpleNamespace(id=1),
        user=SimpleNamespace(id=999),
        membership=SimpleNamespace(role=SimpleNamespace(value=role_name)),
    )

    assert response.reward_granted is True
    assert captured["beneficiary_user_id"] == 444


def test_metagame_claim_route_propagates_multi_child_ambiguity(monkeypatch: pytest.MonkeyPatch) -> None:
    def _fake_resolve_child_context_and_beneficiary(*_args: object, **_kwargs: object) -> tuple[SimpleNamespace, int]:
        raise HTTPException(status_code=409, detail="Multiple children found. Provide childId explicitly.")

    monkeypatch.setattr(games_routes, "_resolve_child_context_and_beneficiary", _fake_resolve_child_context_and_beneficiary)

    payload = GameMetagameClaimRequest.model_validate(
        {
            "childId": None,
            "missionScope": "weekly",
            "missionId": "weekly_sessions_3",
        }
    )
    with pytest.raises(HTTPException) as exc:
        games_routes.claim_games_metagame(
            payload=payload,
            db=_FakeRouteDB(),
            tenant=SimpleNamespace(id=1),
            user=SimpleNamespace(id=999),
            membership=SimpleNamespace(role=SimpleNamespace(value="PARENT")),
        )

    assert exc.value.status_code == 409
    assert "Multiple children found" in str(exc.value.detail)


@pytest.mark.parametrize("role_name", ["PARENT", "TEACHER"])
def test_create_game_session_route_uses_beneficiary_for_registration_and_missions(
    monkeypatch: pytest.MonkeyPatch, role_name: str
) -> None:
    captured: dict[str, int] = {}

    def _fake_resolve_child_context_and_beneficiary(*_args: object, **_kwargs: object) -> tuple[SimpleNamespace, int]:
        return SimpleNamespace(id=77, user_id=444), 444

    def _fake_register_game_session(*_args: object, **kwargs: object) -> SimpleNamespace:
        captured["register_beneficiary_user_id"] = int(kwargs["beneficiary_user_id"])
        profile = SimpleNamespace(
            id="profile-1",
            user_id=444,
            xp=90,
            level=1,
            axion_coins=10,
            daily_xp=20,
            last_xp_reset=date(2026, 3, 15),
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        session = SimpleNamespace(
            id="session-1",
            user_id=444,
            game_type=SimpleNamespace(value="CROSSWORD"),
            score=120,
            xp_earned=20,
            coins_earned=5,
            created_at=datetime.now(UTC),
        )
        return SimpleNamespace(
            profile=profile,
            session=session,
            requested_xp=20,
            granted_xp=20,
            remaining_xp_today=180,
            max_xp_per_day=200,
            unlocked_achievements=[],
        )

    def _fake_track_mission_progress(*_args: object, **kwargs: object) -> None:
        captured["mission_user_id"] = int(kwargs["user_id"])

    monkeypatch.setattr(games_routes, "_resolve_child_context_and_beneficiary", _fake_resolve_child_context_and_beneficiary)
    monkeypatch.setattr(games_routes, "_resolve_game_settings", lambda *_args, **_kwargs: (None, 200))
    monkeypatch.setattr(games_routes, "registerGameSession", _fake_register_game_session)
    monkeypatch.setattr(games_routes, "track_mission_progress", _fake_track_mission_progress)

    payload = GameSessionCreateRequest.model_validate({"gameType": "CROSSWORD", "childId": 77, "score": 120})
    response = games_routes.create_game_session(
        payload=payload,
        db=_FakeRouteDB(),
        tenant=SimpleNamespace(id=1),
        user=SimpleNamespace(id=999),
        membership=SimpleNamespace(role=SimpleNamespace(value=role_name)),
    )

    assert response.profile.user_id == 444
    assert captured["register_beneficiary_user_id"] == 444
    assert captured["mission_user_id"] == 444


def test_complete_game_session_route_uses_beneficiary_for_economy_flows(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, int] = {}

    def _fake_resolve_child_context_and_beneficiary(*_args: object, **_kwargs: object) -> tuple[SimpleNamespace, int]:
        return SimpleNamespace(id=77, user_id=444), 444

    def _fake_complete_game_session(*_args: object, **kwargs: object) -> SimpleNamespace:
        captured["complete_beneficiary_user_id"] = int(kwargs["beneficiary_user_id"])
        profile = SimpleNamespace(
            id="profile-1",
            user_id=444,
            xp=90,
            level=1,
            axion_coins=10,
            daily_xp=20,
            last_xp_reset=date(2026, 3, 15),
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        session = SimpleNamespace(
            id="session-1",
            user_id=444,
            game_type=SimpleNamespace(value="CROSSWORD"),
            score=120,
            xp_earned=20,
            coins_earned=5,
            created_at=datetime.now(UTC),
        )
        register_result = SimpleNamespace(
            profile=profile,
            session=session,
            requested_xp=20,
            granted_xp=20,
            remaining_xp_today=180,
            max_xp_per_day=200,
            unlocked_achievements=[],
        )
        return SimpleNamespace(
            register_result=register_result,
            is_personal_best=False,
            personal_best_type=None,
            personal_best=None,
        )

    def _fake_track_mission_progress(*_args: object, **kwargs: object) -> None:
        captured["mission_user_id"] = int(kwargs["user_id"])

    monkeypatch.setattr(games_routes, "_resolve_child_context_and_beneficiary", _fake_resolve_child_context_and_beneficiary)
    monkeypatch.setattr(games_routes, "_resolve_game_settings", lambda *_args, **_kwargs: (None, 200))
    monkeypatch.setattr(games_routes, "resolve_game_type_strict", lambda *_args, **_kwargs: games_routes.GameType.CROSSWORD)
    monkeypatch.setattr(games_routes, "complete_game_session", _fake_complete_game_session)
    monkeypatch.setattr(games_routes, "track_mission_progress", _fake_track_mission_progress)
    monkeypatch.setattr(
        games_routes,
        "get_weekly_ranking_snapshot",
        lambda *_args, **_kwargs: SimpleNamespace(me=SimpleNamespace(position=5, score=100.0, in_top=True, total_players=25)),
    )
    monkeypatch.setattr(
        games_routes,
        "build_games_league_summary",
        lambda *_args, **_kwargs: SimpleNamespace(position=3, tier_label="Prata"),
    )

    payload = GameSessionCompleteRequest.model_validate(
        {
            "childId": 77,
            "result": {
                "gameId": "quiz",
                "sessionId": "s1",
                "score": 120,
                "completed": True,
                "xpDelta": 20,
                "coinsDelta": 5,
            },
        }
    )
    response = games_routes.complete_game_session_route(
        payload=payload,
        db=_FakeRouteDB(),
        tenant=SimpleNamespace(id=1),
        user=SimpleNamespace(id=999),
        membership=SimpleNamespace(role=SimpleNamespace(value="PARENT")),
    )

    assert response.profile.user_id == 444
    assert captured["complete_beneficiary_user_id"] == 444
    assert captured["mission_user_id"] == 444


class _FakeMetagameDB:
    def __init__(self, *, existing_claim: object | None = None) -> None:
        self._existing_claim = existing_claim
        self.added: list[object] = []
        self.flush_calls = 0

    def scalar(self, _query: object) -> object | None:
        value = self._existing_claim
        self._existing_claim = None
        return value

    def add(self, obj: object) -> None:
        self.added.append(obj)

    def flush(self) -> None:
        self.flush_calls += 1


def test_metagame_service_claim_uses_beneficiary_for_award_and_claim_owner(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    stats = game_metagame.GameMetagameStats(
        total_sessions=5,
        weekly_sessions=2,
        daily_sessions=1,
        xp_today=100,
        xp_week=180,
        records_total=1,
        records_today=0,
        records_week=1,
        favorite_game_id="quiz",
        distinct_games_played=2,
        current_streak=2,
        best_streak=3,
    )
    mission = game_metagame.GameMetagameMission(
        id="daily_xp_80",
        scope="daily",
        title="Missão de hoje",
        description="Ganhe XP",
        metric="xp",
        target=80,
        current=80,
        progress_percent=100.0,
        reward_xp=40,
        reward_coins=10,
        period_start=date(2026, 3, 15),
        period_end=date(2026, 3, 15),
        claimed=False,
        reward_ready=True,
        cta_label="Jogar",
    )
    summary = game_metagame.GameMetagameSummary(
        generated_at=datetime.now(UTC),
        streak_current=2,
        streak_best=3,
        stats=stats,
        daily_mission=mission,
        weekly_mission=replace(mission, scope="weekly", id="weekly_xp_180"),
        badges=[],
        motivation_message="Siga jogando",
    )

    captured: dict[str, int] = {}

    def _fake_award(*_args: object, **kwargs: object) -> None:
        captured["beneficiary_user_id"] = int(kwargs["beneficiary_user_id"])

    monkeypatch.setattr(game_metagame, "build_games_metagame_summary", lambda *_args, **_kwargs: summary)
    monkeypatch.setattr(game_metagame, "award_economy_event", _fake_award)
    monkeypatch.setattr(game_metagame, "get_economy_reward", lambda *_args, **_kwargs: SimpleNamespace(season_xp=40))

    db = _FakeMetagameDB()
    result = game_metagame.claim_games_metagame_mission(
        db,  # type: ignore[arg-type]
        tenant_id=1,
        beneficiary_user_id=444,
        child_id=77,
        mission_scope="daily",
        mission_id="daily_xp_80",
    )

    assert result.reward_granted is True
    assert captured["beneficiary_user_id"] == 444
    assert len(db.added) == 1
    claim = db.added[0]
    assert int(claim.user_id) == 444

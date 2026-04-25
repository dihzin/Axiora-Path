from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.routes import tools
from app.models import User
from app.schemas.tools import ToolsGenerateExercisesRequest


class _FakeDB:
    def __init__(self) -> None:
        self.saved: list[object] = []
        self.commits = 0
        self.users: dict[int, User] = {}
        self.checkout_sessions: dict[str, object] = {}

    def add(self, obj: object) -> None:
        self.saved.append(obj)

    def scalar(self, *_args, **_kwargs):
        return None

    def commit(self) -> None:
        self.commits += 1

    def flush(self) -> None:
        return

    def get(self, model, ident):  # type: ignore[no-untyped-def]
        if model is User:
            return self.users.get(int(ident))
        if getattr(model, "__name__", "") == "ToolsCheckoutSession":
            return self.checkout_sessions.get(str(ident))
        return None


class _FakeRequest:
    def __init__(self, *, headers: dict[str, str] | None = None, payload: dict[str, object] | None = None) -> None:
        self.headers = headers or {}
        self.client = SimpleNamespace(host="127.0.0.1")
        self._payload = payload or {}

    async def body(self) -> bytes:
        return json.dumps(self._payload).encode("utf-8")


def test_use_credit_decrements_and_blocks_when_zero(monkeypatch: pytest.MonkeyPatch) -> None:
    db = _FakeDB()
    user = User(id=9, email="credits@axiora.local", name="Credits", password_hash="hashed")
    row = SimpleNamespace(user_id=user.id, credits=1)
    monkeypatch.setattr(tools, "_get_or_create_user_credits", lambda *_args, **_kwargs: row)
    monkeypatch.setattr(tools, "_resolve_auth_trial_balance", lambda *_args, **_kwargs: 0)

    request = _FakeRequest(headers={"X-Device-Fingerprint": "fp-credits"})
    first = asyncio.run(tools.use_tools_credit(request, db, user))  # type: ignore[arg-type]
    assert first.credits == 0

    with pytest.raises(HTTPException) as exc:
        asyncio.run(tools.use_tools_credit(request, db, user))  # type: ignore[arg-type]
    assert exc.value.status_code == 402


def test_generate_exercises_uses_one_credit_for_authenticated_user(monkeypatch: pytest.MonkeyPatch) -> None:
    db = _FakeDB()
    user = User(id=12, email="user12@axiora.local", name="User 12", password_hash="hashed")
    db.users[user.id] = user
    monkeypatch.setattr(tools, "decode_token", lambda *_args, **_kwargs: {"type": "access", "sub": str(user.id)})

    row = SimpleNamespace(user_id=user.id, credits=2)
    monkeypatch.setattr(tools, "_get_or_create_user_credits", lambda *_args, **_kwargs: row)

    class _Gen:
        def generate(self, _input):  # type: ignore[no-untyped-def]
            return (
                {
                    "title": "Lista",
                    "instructions": "Resolva.",
                    "exercises": [{"number": 1, "prompt": "2+2", "answer": "4"}],
                },
                "fallback",
            )

    monkeypatch.setattr(tools, "ToolsExerciseGeneratorService", _Gen)

    request = _FakeRequest(headers={"Authorization": "Bearer token"})
    response = asyncio.run(
        tools.generate_exercises(
            ToolsGenerateExercisesRequest(subject="Matematica", topic="Soma", age=10, difficulty="facil", exercise_count=3),
            request,  # type: ignore[arg-type]
            SimpleNamespace(),
            db,  # type: ignore[arg-type]
        )
    )

    assert response.paid_credits_remaining == 1
    assert row.credits == 1


def test_get_tools_credits_returns_zero_when_trial_scope_already_claimed(monkeypatch: pytest.MonkeyPatch) -> None:
    db = _FakeDB()
    user = User(id=21, email="repeat@axiora.local", name="Repeat", password_hash="hashed")
    request = _FakeRequest(headers={"X-Device-Fingerprint": "fp-repeat"})

    monkeypatch.setattr(tools, "_has_any_trial_claim", lambda *_args, **_kwargs: True)

    response = asyncio.run(tools.get_tools_credits(request, db, user))  # type: ignore[arg-type]

    assert response.credits == 0


def test_webhook_checkout_completed_adds_credits_to_user(monkeypatch: pytest.MonkeyPatch) -> None:
    db = _FakeDB()
    user = User(id=5, email="buyer@axiora.local", name="Buyer", password_hash="hashed")
    row = SimpleNamespace(user_id=user.id, credits=0)
    monkeypatch.setattr(tools, "_get_or_create_user_credits", lambda *_args, **_kwargs: row)

    monkeypatch.setattr(tools.ToolsBillingService, "__init__", lambda self: setattr(self, "webhook_secret", "whsec_test"))
    monkeypatch.setattr(tools.ToolsBillingService, "verify_webhook_signature", lambda *_args, **_kwargs: True)
    monkeypatch.setattr(
        tools.ToolsBillingService,
        "parse_checkout_completed_event",
        lambda *_args, **_kwargs: ("user:5", 30),
    )

    request = _FakeRequest(payload={"type": "checkout.session.completed"})
    result = asyncio.run(
        tools.handle_tools_stripe_webhook(
            request,  # type: ignore[arg-type]
            SimpleNamespace(),
            db,  # type: ignore[arg-type]
            stripe_signature="t=1,v1=signature",
        )
    )

    assert result == {"ok": True}
    assert row.credits == 30


def test_webhook_uses_recorded_checkout_plan_instead_of_metadata_credits(monkeypatch: pytest.MonkeyPatch) -> None:
    db = _FakeDB()
    row = SimpleNamespace(user_id=5, credits=0)
    db.checkout_sessions["cs_test_123"] = SimpleNamespace(
        id="cs_test_123",
        user_id=5,
        anon_id=None,
        plan_code="credits_30",
        status="created",
    )

    monkeypatch.setattr(tools, "_get_or_create_user_credits", lambda *_args, **_kwargs: row)
    monkeypatch.setattr(tools.ToolsBillingService, "__init__", lambda self: setattr(self, "webhook_secret", "whsec_test"))
    monkeypatch.setattr(tools.ToolsBillingService, "verify_webhook_signature", lambda *_args, **_kwargs: True)
    monkeypatch.setattr(
        tools.ToolsBillingService,
        "parse_checkout_completed_event",
        lambda *_args, **_kwargs: ("user:5", 9999),
    )

    request = _FakeRequest(
        payload={
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "id": "cs_test_123",
                    "payment_status": "paid",
                    "amount_total": 2900,
                    "currency": "brl",
                }
            },
        }
    )
    result = asyncio.run(
        tools.handle_tools_stripe_webhook(
            request,  # type: ignore[arg-type]
            SimpleNamespace(),
            db,  # type: ignore[arg-type]
            stripe_signature="t=1,v1=signature",
        )
    )

    assert result == {"ok": True}
    assert row.credits == 30


def test_checkout_status_requires_matching_anonymous_identity() -> None:
    db = _FakeDB()
    db.checkout_sessions["cs_test_anon"] = SimpleNamespace(
        id="cs_test_anon",
        anon_id="anon-123",
        user_id=None,
        plan_code="credits_30",
        status="paid",
    )
    request = _FakeRequest()

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(tools.get_checkout_status("cs_test_anon", request, db))  # type: ignore[arg-type]

    assert exc_info.value.status_code == 404

    response = asyncio.run(
        tools.get_checkout_status("cs_test_anon", request, db, anonymous_id="anon-123")  # type: ignore[arg-type]
    )
    assert response.payment_status == "paid"

from __future__ import annotations

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

    def add(self, obj: object) -> None:
        self.saved.append(obj)

    def commit(self) -> None:
        self.commits += 1

    def flush(self) -> None:
        return

    def get(self, model, ident):  # type: ignore[no-untyped-def]
        if model is User:
            return self.users.get(int(ident))
        return None


class _FakeRequest:
    def __init__(self, *, headers: dict[str, str] | None = None, payload: dict[str, object] | None = None) -> None:
        self.headers = headers or {}
        self.client = SimpleNamespace(host="127.0.0.1")
        self._payload = payload or {}

    async def body(self) -> bytes:
        return json.dumps(self._payload).encode("utf-8")


@pytest.mark.asyncio
async def test_use_credit_decrements_and_blocks_when_zero(monkeypatch: pytest.MonkeyPatch) -> None:
    db = _FakeDB()
    user = User(id=9, email="credits@axiora.local", name="Credits", password_hash="hashed")
    row = SimpleNamespace(user_id=user.id, credits=1)
    monkeypatch.setattr(tools, "_get_or_create_user_credits", lambda *_args, **_kwargs: row)

    first = await tools.use_tools_credit(db, user)  # type: ignore[arg-type]
    assert first.credits == 0

    with pytest.raises(HTTPException) as exc:
        await tools.use_tools_credit(db, user)  # type: ignore[arg-type]
    assert exc.value.status_code == 402


@pytest.mark.asyncio
async def test_generate_exercises_uses_one_credit_for_authenticated_user(monkeypatch: pytest.MonkeyPatch) -> None:
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
    response = await tools.generate_exercises(
        ToolsGenerateExercisesRequest(subject="Matemática", topic="Soma", age=10, difficulty="facil", exercise_count=3),
        request,  # type: ignore[arg-type]
        SimpleNamespace(),  # service not used in authenticated credit path
        db,  # type: ignore[arg-type]
    )

    assert response.paid_credits_remaining == 1
    assert row.credits == 1


@pytest.mark.asyncio
async def test_webhook_checkout_completed_adds_credits_to_user(monkeypatch: pytest.MonkeyPatch) -> None:
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
    result = await tools.handle_tools_stripe_webhook(
        request,  # type: ignore[arg-type]
        SimpleNamespace(),
        db,  # type: ignore[arg-type]
        stripe_signature="t=1,v1=signature",
    )

    assert result == {"ok": True}
    assert row.credits == 30

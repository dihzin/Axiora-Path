from __future__ import annotations

from types import SimpleNamespace

from app.services import axion_safety_gating as safety


class _FakeScalarRows:
    def __init__(self, rows: list[object]) -> None:
        self._rows = rows

    def all(self) -> list[object]:
        return list(self._rows)


class _FakeDB:
    def __init__(self, rows: list[object]) -> None:
        self._rows = rows

    def scalars(self, *_args: object, **_kwargs: object) -> _FakeScalarRows:
        return _FakeScalarRows(self._rows)


def test_safety_tags_blocked_by_age_policy(monkeypatch) -> None:
    monkeypatch.setattr(safety.settings, "axion_safety_allowed_tags_csv", "violence_mild,violence,drugs,self_harm,sexuality,bullying")
    monkeypatch.setattr(
        safety.settings,
        "axion_safety_age_policy_json",
        '{"lt10":["violence","drugs","sexuality","self_harm"],"10_12":["violence","drugs"],"13_15":["drugs"],"16_18":[]}',
    )
    db = _FakeDB(
        [
            SimpleNamespace(content_id=101, safety_tags=["violence"], is_active=True),
            SimpleNamespace(content_id=102, safety_tags=["bullying"], is_active=True),
        ]
    )
    eligible = safety.filter_candidates_by_safety_tags(
        db,
        candidate_content_ids=[101, 102],
        child_age=9,
    )
    assert eligible == [102]


def test_safety_tags_allowed_when_policy_allows(monkeypatch) -> None:
    monkeypatch.setattr(safety.settings, "axion_safety_allowed_tags_csv", "violence_mild,violence,drugs,self_harm,sexuality,bullying")
    monkeypatch.setattr(
        safety.settings,
        "axion_safety_age_policy_json",
        '{"lt10":["violence","drugs","sexuality","self_harm"],"10_12":["violence","drugs"],"13_15":["drugs"],"16_18":[]}',
    )
    db = _FakeDB(
        [
            SimpleNamespace(content_id=201, safety_tags=["violence"], is_active=True),
            SimpleNamespace(content_id=202, safety_tags=["bullying"], is_active=True),
        ]
    )
    eligible = safety.filter_candidates_by_safety_tags(
        db,
        candidate_content_ids=[201, 202],
        child_age=16,
    )
    assert eligible == [201, 202]


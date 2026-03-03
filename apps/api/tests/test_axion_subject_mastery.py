from __future__ import annotations

from types import SimpleNamespace

from app.services import axion_subject_mastery as mastery


class _FakeDB:
    def __init__(self) -> None:
        self.added: list[object] = []

    def add(self, item: object) -> None:
        self.added.append(item)


def test_mastery_accumulates_over_time(monkeypatch) -> None:
    db = _FakeDB()
    row = SimpleNamespace(mastery_score=0.0, updated_at=None, subject="math")

    monkeypatch.setattr(mastery.settings, "axion_subject_mastery_alpha", 0.2)
    monkeypatch.setattr(mastery.settings, "axion_subject_mastery_beta", 0.1)
    monkeypatch.setattr(
        mastery,
        "_get_subject_mastery_row",
        lambda *_args, **_kwargs: row,
    )

    v1 = mastery.update_child_subject_mastery(
        db,
        tenant_id=1,
        child_id=10,
        subject="math",
        outcome="correct",
    )
    v2 = mastery.update_child_subject_mastery(
        db,
        tenant_id=1,
        child_id=10,
        subject="math",
        outcome="correct",
    )
    v3 = mastery.update_child_subject_mastery(
        db,
        tenant_id=1,
        child_id=10,
        subject="math",
        outcome="incorrect",
    )
    assert round(v1, 4) == 0.2
    assert round(v2, 4) == 0.4
    assert round(v3, 4) == 0.3


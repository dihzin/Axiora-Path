from __future__ import annotations

from app.services import axion_content_prerequisites as prereq


class _FakeDB:
    pass


def test_prereq_blocks_when_not_completed(monkeypatch) -> None:
    db = _FakeDB()
    monkeypatch.setattr(prereq, "_list_prerequisites", lambda _db, *, content_id: [100] if content_id == 200 else [])
    monkeypatch.setattr(
        prereq,
        "_has_served_content",
        lambda _db, *, tenant_id, child_id, content_id: False,
    )
    monkeypatch.setattr(
        prereq,
        "_subject_mastery_for_content",
        lambda _db, *, tenant_id, child_id, content_id: None,
    )
    allowed = prereq.can_serve_content(
        db,
        tenant_id=1,
        child_id=10,
        content_id=200,
        mastery_threshold=0.6,
    )
    assert allowed is False


def test_prereq_allows_when_completed_and_mastered(monkeypatch) -> None:
    db = _FakeDB()
    monkeypatch.setattr(prereq, "_list_prerequisites", lambda _db, *, content_id: [100] if content_id == 200 else [])
    monkeypatch.setattr(
        prereq,
        "_has_served_content",
        lambda _db, *, tenant_id, child_id, content_id: True,
    )
    monkeypatch.setattr(
        prereq,
        "_subject_mastery_for_content",
        lambda _db, *, tenant_id, child_id, content_id: 0.85 if content_id == 100 else None,
    )
    allowed = prereq.can_serve_content(
        db,
        tenant_id=1,
        child_id=10,
        content_id=200,
        mastery_threshold=0.6,
    )
    assert allowed is True


def test_prerequisite_uses_mastery_score_not_delta(monkeypatch) -> None:
    db = _FakeDB()
    monkeypatch.setattr(prereq, "_list_prerequisites", lambda _db, *, content_id: [100] if content_id == 200 else [])
    monkeypatch.setattr(prereq, "_has_served_content", lambda _db, *, tenant_id, child_id, content_id: True)
    # Even if legacy mastery_delta would be "high", serving should block when subject mastery_score is low.
    monkeypatch.setattr(
        prereq,
        "_subject_mastery_for_content",
        lambda _db, *, tenant_id, child_id, content_id: 0.2,
    )
    allowed = prereq.can_serve_content(
        db,
        tenant_id=1,
        child_id=10,
        content_id=200,
        mastery_threshold=0.6,
    )
    assert allowed is False

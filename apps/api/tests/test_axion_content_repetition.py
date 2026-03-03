from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

from app.services.axion_content_repetition import compute_content_fingerprint, filter_repeated_candidates


class _FakeScalarRows:
    def __init__(self, rows: list[object]) -> None:
        self._rows = rows

    def all(self) -> list[object]:
        return list(self._rows)


class _FakeDB:
    def __init__(self, *, catalog_rows: list[object], history_rows: list[object]) -> None:
        self._catalog_rows = catalog_rows
        self._history_rows = history_rows
        self._calls = 0

    def scalars(self, *_args: object, **_kwargs: object) -> _FakeScalarRows:
        self._calls += 1
        if self._calls == 1:
            return _FakeScalarRows(self._catalog_rows)
        return _FakeScalarRows(self._history_rows)


def test_no_repeat_within_window() -> None:
    now = datetime.now(UTC)
    fp = compute_content_fingerprint(normalized_text="2 + 2 = ?", content_type="question", subject="math")
    db = _FakeDB(
        catalog_rows=[SimpleNamespace(content_id=1001, content_fingerprint=fp)],
        history_rows=[
            SimpleNamespace(
                content_fingerprint=fp,
                served_at=now - timedelta(days=1),
                outcome="correct",
            )
        ],
    )
    eligible = filter_repeated_candidates(
        db,
        tenant_id=1,
        child_id=10,
        candidate_content_ids=[1001],
        mode="learn",
        window_days=7,
        review_cooldown_hours=24,
    )
    assert eligible == []


def test_repeat_allowed_after_window() -> None:
    fp = compute_content_fingerprint(normalized_text="1 + 1 = ?", content_type="question", subject="math")
    db = _FakeDB(
        catalog_rows=[SimpleNamespace(content_id=1002, content_fingerprint=fp)],
        history_rows=[],
    )
    eligible = filter_repeated_candidates(
        db,
        tenant_id=1,
        child_id=10,
        candidate_content_ids=[1002],
        mode="learn",
        window_days=7,
        review_cooldown_hours=24,
    )
    assert eligible == [1002]


def test_repeat_allowed_for_review_after_incorrect() -> None:
    now = datetime.now(UTC)
    fp = compute_content_fingerprint(normalized_text="fractions", content_type="question", subject="math")
    db = _FakeDB(
        catalog_rows=[SimpleNamespace(content_id=1003, content_fingerprint=fp)],
        history_rows=[
            SimpleNamespace(
                content_fingerprint=fp,
                served_at=now - timedelta(hours=30),
                outcome="incorrect",
            )
        ],
    )
    eligible = filter_repeated_candidates(
        db,
        tenant_id=1,
        child_id=10,
        candidate_content_ids=[1003],
        mode="review",
        window_days=7,
        review_cooldown_hours=24,
    )
    assert eligible == [1003]


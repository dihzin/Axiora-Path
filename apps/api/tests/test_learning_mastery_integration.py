from __future__ import annotations

from types import SimpleNamespace

from app.models import Plan, QuestionResult
from app.services import axion_mode
from app.observability import axion_metrics
from app.api.routes import learning as learning_route
from app.schemas.learning import LearningAnswerRequest
from app.services import axion_subject_mastery


class _FakeDB:
    def __init__(self) -> None:
        self.commits = 0
        self.decision = None
        self.added: list[object] = []
        self.prerequisites: dict[int, list[int]] = {}
        self.content_subject: dict[int, str] = {}
        self.served: set[tuple[int, int, int]] = set()
        self.subject_mastery_rows: dict[tuple[int, int, str], object] = {}
        self.mastery_events: set[tuple[int, int, str, str]] = set()

    def commit(self) -> None:
        self.commits += 1

    def refresh(self, _item: object) -> None:
        return None

    def add(self, item: object) -> None:
        self.added.append(item)
        name = item.__class__.__name__
        if name == "ChildSubjectMastery":
            key = (int(item.tenant_id), int(item.child_id), str(item.subject).strip().lower())
            self.subject_mastery_rows[key] = item
        if name == "EventLog" and getattr(item, "type", "") == "axion_subject_mastery_outcome":
            payload = getattr(item, "payload", {}) or {}
            corr = str(payload.get("correlation_id") or "")
            subject = str(payload.get("subject") or "").strip().lower()
            child_id = int(getattr(item, "child_id"))
            tenant_id = int(getattr(item, "tenant_id"))
            self.mastery_events.add((tenant_id, child_id, subject, corr))

    def flush(self) -> None:
        return None

    class _Rows:
        def __init__(self, rows: list[object]) -> None:
            self._rows = rows

        def all(self) -> list[object]:
            return list(self._rows)

    def scalars(self, statement, *_args, **_kwargs):
        compiled = statement.compile()
        sql = str(compiled).lower()
        params = compiled.params
        if "from content_prerequisites" in sql:
            content_id = int(next(iter(params.values())))
            return _FakeDB._Rows(self.prerequisites.get(content_id, []))
        return _FakeDB._Rows([])

    def scalar(self, statement, *_args, **_kwargs):
        compiled = str(statement)
        low = compiled.lower()
        params = statement.compile().params
        if "axion_decisions" in low:
            return self.decision
        if "from child_content_history" in low and "select child_content_history.id" in low:
            tenant_id = int(params.get("tenant_id_1"))
            child_id = int(params.get("child_id_1"))
            content_id = int(params.get("content_id_1"))
            return 1 if (tenant_id, child_id, content_id) in self.served else None
        if "from axion_content_catalog" in low and "select axion_content_catalog.subject" in low:
            content_id = int(params.get("content_id_1"))
            return self.content_subject.get(content_id)
        if "from child_subject_mastery" in low and "select child_subject_mastery.mastery_score" in low:
            tenant_id = int(params.get("tenant_id_1"))
            child_id = int(params.get("child_id_1"))
            subject = str(params.get("subject_1")).strip().lower()
            row = self.subject_mastery_rows.get((tenant_id, child_id, subject))
            return None if row is None else row.mastery_score
        if "from child_subject_mastery" in low and "select child_subject_mastery.id" in low:
            tenant_id = int(params.get("tenant_id_1"))
            child_id = int(params.get("child_id_1"))
            subject = str(params.get("subject_1")).strip().lower()
            return self.subject_mastery_rows.get((tenant_id, child_id, subject))
        if "from child_subject_mastery" in low:
            tenant_id = int(params.get("tenant_id_1"))
            child_id = int(params.get("child_id_1"))
            subject = str(params.get("subject_1")).strip().lower()
            return self.subject_mastery_rows.get((tenant_id, child_id, subject))
        if "from event_log" in low and "axion_subject_mastery_outcome" in low:
            tenant_id = int(params.get("tenant_id_1"))
            child_id = int(params.get("child_id_1"))
            correlation_id = str(params.get("payload_1", ""))
            subject = str(params.get("payload_2", "")).strip().lower()
            if (tenant_id, child_id, subject, correlation_id) in self.mastery_events:
                return 1
            return None
        return None


def test_mastery_updates_after_real_answer_submission(monkeypatch) -> None:
    db = _FakeDB()
    tenant = SimpleNamespace(id=10)
    user = SimpleNamespace(id=30)

    result_payload = SimpleNamespace(
        mastery=SimpleNamespace(mastery=0.4, streak_correct=1, streak_wrong=0, next_review_at=None),
        mastery_delta=0.1,
        skill_id="skill-math",
        question_id="q-1",
        template_id=None,
        generated_variant_id=None,
    )
    monkeypatch.setattr(learning_route, "track_question_answer", lambda *_args, **_kwargs: result_payload)
    monkeypatch.setattr(learning_route, "resolve_child_for_user", lambda *_args, **_kwargs: 99)
    monkeypatch.setattr(learning_route, "_resolve_subject_name_for_skill", lambda *_args, **_kwargs: "math")
    monkeypatch.setattr(learning_route, "maybe_enrich_wrong_answer_explanation", lambda *_args, **_kwargs: None)

    seen_keys: set[tuple[int, int, str, str]] = set()
    updates = {"count": 0}

    def _already(_db, *, tenant_id: int, child_id: int, subject: str, correlation_id: str) -> bool:
        return (tenant_id, child_id, subject, correlation_id) in seen_keys

    def _mark(_db, *, tenant_id: int, child_id: int, subject: str, outcome: str, correlation_id: str | None, mastery_score: float) -> None:
        if correlation_id:
            seen_keys.add((tenant_id, child_id, subject, correlation_id))

    def _update(_db, *, tenant_id: int, child_id: int, subject: str, outcome: str, alpha=None, beta=None) -> float:
        updates["count"] += 1
        return 0.55

    monkeypatch.setattr(axion_subject_mastery, "_outcome_already_recorded", _already)
    monkeypatch.setattr(axion_subject_mastery, "_mark_outcome_recorded", _mark)
    monkeypatch.setattr(axion_subject_mastery, "update_child_subject_mastery", _update)
    monkeypatch.setattr(learning_route, "record_content_outcome", axion_subject_mastery.record_content_outcome)

    payload = LearningAnswerRequest(
        questionId="q-1",
        result=QuestionResult.CORRECT,
        timeMs=1200,
        correlationId="56d4b215-74e9-4fce-b21e-6eb9bb6f95ea",
    )

    first = learning_route.submit_learning_answer(
        payload=payload,
        db=db,
        tenant=tenant,
        user=user,
        __=SimpleNamespace(),
    )
    second = learning_route.submit_learning_answer(
        payload=payload,
        db=db,
        tenant=tenant,
        user=user,
        __=SimpleNamespace(),
    )

    assert first.mastery == 0.4
    assert second.mastery == 0.4
    assert updates["count"] == 1
    assert db.commits == 2


def test_mastery_not_applied_twice_under_replay(monkeypatch) -> None:
    db = _FakeDB()
    db.decision = SimpleNamespace(mastery_applied=False)
    calls = {"count": 0}

    def _record(*_args, **_kwargs):
        calls["count"] += 1
        return 0.61

    monkeypatch.setattr(learning_route, "record_content_outcome", _record)

    first = learning_route._apply_subject_mastery_once_per_decision(
        db,
        tenant_id=10,
        user_id=30,
        child_id=99,
        subject="math",
        outcome="correct",
        correlation_id="56d4b215-74e9-4fce-b21e-6eb9bb6f95ea",
    )
    second = learning_route._apply_subject_mastery_once_per_decision(
        db,
        tenant_id=10,
        user_id=30,
        child_id=99,
        subject="math",
        outcome="correct",
        correlation_id="56d4b215-74e9-4fce-b21e-6eb9bb6f95ea",
    )

    assert first == 0.61
    assert second is None
    assert calls["count"] == 1
    assert db.decision.mastery_applied is True


def test_prerequisite_unlocks_after_real_mastery_progression(monkeypatch) -> None:
    db = _FakeDB()
    tenant = SimpleNamespace(id=10)
    user = SimpleNamespace(id=30)
    child_id = 99
    content_a = 1001
    content_b = 1002
    db.content_subject[content_a] = "math"
    db.content_subject[content_b] = "math"
    db.prerequisites[content_b] = [content_a]
    db.served.add((tenant.id, child_id, content_a))
    db.subject_mastery_rows[(tenant.id, child_id, "math")] = SimpleNamespace(
        tenant_id=tenant.id,
        child_id=child_id,
        subject="math",
        mastery_score=0.2,
        updated_at=None,
    )

    monkeypatch.setattr(learning_route, "resolve_child_for_user", lambda *_args, **_kwargs: child_id)
    monkeypatch.setattr(learning_route, "_resolve_subject_name_for_skill", lambda *_args, **_kwargs: "math")
    monkeypatch.setattr(learning_route, "maybe_enrich_wrong_answer_explanation", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(
        learning_route,
        "track_question_answer",
        lambda *_args, **_kwargs: SimpleNamespace(
            mastery=SimpleNamespace(mastery=0.4, streak_correct=1, streak_wrong=0, next_review_at=None),
            mastery_delta=0.1,
            skill_id="skill-math",
            question_id="q-1",
            template_id=None,
            generated_variant_id=None,
        ),
    )

    monkeypatch.setattr(axion_mode, "is_axion_kill_switch_enabled", lambda: False)
    monkeypatch.setattr(axion_mode, "resolve_child_age", lambda *_args, **_kwargs: 11)
    monkeypatch.setattr(axion_mode, "filter_candidate_content_ids_by_age", lambda *_args, **_kwargs: [content_b])
    monkeypatch.setattr(axion_mode, "filter_candidates_by_safety_tags", lambda *_args, **_kwargs: [content_b])
    monkeypatch.setattr(axion_mode, "filter_repeated_candidates", lambda *_args, **_kwargs: [content_b])
    monkeypatch.setattr(axion_mode, "_safe_default_candidates", lambda *_args, **_kwargs: ([9999], "age_safe"))
    monkeypatch.setattr(axion_mode, "resolve_nba_variant_for_experiment", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(
        axion_mode,
        "_resolve_plan",
        lambda _db, tenant_id: Plan(
            name="PRO",
            llm_daily_budget=0,
            llm_monthly_budget=0,
            nba_enabled=True,
            advanced_personalization_enabled=False,
        ),
    )
    monkeypatch.setattr(axion_mode, "is_nba_enabled", lambda _db, *, child_id: True)

    before = axion_mode.resolve_nba_mode(
        db,
        tenant_id=tenant.id,
        child_id=child_id,
        user_id=user.id,
        context="child_tab",
        child_age=11,
        candidate_content_ids=[content_b],
    )
    assert before.selected_content_id == 9999  # fallback, B still blocked

    for idx in range(8):
        payload = LearningAnswerRequest(
            questionId=f"q-{idx}",
            result=QuestionResult.CORRECT,
            timeMs=1100,
            correlationId=f"56d4b215-74e9-4fce-b21e-6eb9bb6f95e{idx}",
        )
        learning_route.submit_learning_answer(
            payload=payload,
            db=db,
            tenant=tenant,
            user=user,
            __=SimpleNamespace(),
        )

    after = axion_mode.resolve_nba_mode(
        db,
        tenant_id=tenant.id,
        child_id=child_id,
        user_id=user.id,
        context="child_tab",
        child_age=11,
        candidate_content_ids=[content_b],
    )
    assert after.selected_content_id == content_b


def test_mastery_metrics_increment_on_real_submission(monkeypatch) -> None:
    original_backend = axion_metrics._METRICS_BACKEND
    axion_metrics._METRICS_BACKEND = axion_metrics._InMemoryAxionMetrics()
    try:
        db = _FakeDB()
        tenant = SimpleNamespace(id=10)
        user = SimpleNamespace(id=30)
        child_id = 99
        db.subject_mastery_rows[(tenant.id, child_id, "math")] = SimpleNamespace(
            tenant_id=tenant.id,
            child_id=child_id,
            subject="math",
            mastery_score=0.3,
            updated_at=None,
        )

        monkeypatch.setattr(learning_route, "resolve_child_for_user", lambda *_args, **_kwargs: child_id)
        monkeypatch.setattr(learning_route, "_resolve_subject_name_for_skill", lambda *_args, **_kwargs: "math")
        monkeypatch.setattr(learning_route, "maybe_enrich_wrong_answer_explanation", lambda *_args, **_kwargs: None)
        monkeypatch.setattr(
            learning_route,
            "track_question_answer",
            lambda *_args, **_kwargs: SimpleNamespace(
                mastery=SimpleNamespace(mastery=0.4, streak_correct=1, streak_wrong=0, next_review_at=None),
                mastery_delta=0.1,
                skill_id="skill-math",
                question_id="q-1",
                template_id=None,
                generated_variant_id=None,
            ),
        )

        payload = LearningAnswerRequest(
            questionId="q-1",
            result=QuestionResult.CORRECT,
            timeMs=1000,
            correlationId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        )
        learning_route.submit_learning_answer(
            payload=payload,
            db=db,
            tenant=tenant,
            user=user,
            __=SimpleNamespace(),
        )

        health = axion_metrics.get_axion_mastery_metrics_health()
        assert health["ready"] is True
        assert int(health["mastery_updates_total"]) == 1
        assert int(health["mastery_updates_by_subject"]["math"]) == 1
        assert int(health["prereq_unlock_total"]) >= 0
        histogram = health["mastery_score_histogram"]
        assert "math" in histogram
        assert sum(int(v) for v in histogram["math"].values()) == 1
    finally:
        axion_metrics._METRICS_BACKEND = original_backend

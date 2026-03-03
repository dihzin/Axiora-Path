from __future__ import annotations

from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import deps
from app.api.routes import axion as axion_route
from app.services.axion_retention import AxionRetentionFilters, compute_retention_metrics, get_axion_retention_metrics


class _FakeResult:
    def __init__(self, rows: list[dict[str, object]], scalar_value: int | None = None) -> None:
        self._rows = rows
        self._scalar_value = scalar_value

    def mappings(self) -> "_FakeResult":
        return self

    def all(self) -> list[dict[str, object]]:
        return self._rows

    def scalar_one_or_none(self) -> int | None:
        return self._scalar_value


class _FakeDB:
    def __init__(self, rows: list[dict[str, object]], contamination_count: int = 0) -> None:
        self._rows = rows
        self._contamination_count = contamination_count
        self._execute_calls = 0
        self._scalar_calls = 0
        self.added: list[object] = []
        self.sql_texts: list[str] = []

    def execute(self, *_args: object, **_kwargs: object) -> _FakeResult:
        self._execute_calls += 1
        if _args:
            self.sql_texts.append(str(_args[0]))
        if self._execute_calls == 1:
            return _FakeResult(self._rows)
        return _FakeResult([], scalar_value=self._contamination_count)

    def scalar(self, *_args: object, **_kwargs: object) -> str:
        self._scalar_calls += 1
        return "ACTIVE"

    def add(self, item: object) -> None:
        self.added.append(item)


class _RetentionQueryResult:
    def __init__(self, row: dict[str, object] | None) -> None:
        self._row = row

    def mappings(self) -> "_RetentionQueryResult":
        return self

    def first(self) -> dict[str, object] | None:
        return self._row


class _RetentionFakeDB:
    def __init__(self, row: dict[str, object]) -> None:
        self.row = row
        self.execute_calls = 0
        self.sql_texts: list[str] = []

    def execute(self, *args: object, **_kwargs: object) -> _RetentionQueryResult:
        self.execute_calls += 1
        if args:
            self.sql_texts.append(str(args[0]))
        return _RetentionQueryResult(self.row)


def test_retention_d1_computation() -> None:
    db = _FakeDB(
        [
            {
                "variant": "CONTROL",
                "cohort_users": 10,
                "retained_d1_users": 3,
                "retained_d7_users": 4,
            },
            {
                "variant": "VARIANT_A",
                "cohort_users": 10,
                "retained_d1_users": 5,
                "retained_d7_users": 6,
            },
        ]
    )

    metrics = compute_retention_metrics(db, experiment_key="nba_retention_v1")

    assert metrics["cohort_users"] == 20
    assert metrics["retained_d1_users"] == 8
    assert metrics["d1_rate"] == 40.0
    by_variant = {row["variant"]: row for row in metrics["variants"]}
    assert by_variant["CONTROL"]["d1_rate"] == 30.0
    assert by_variant["VARIANT_A"]["d1_rate"] == 50.0


def test_retention_d7_computation() -> None:
    db = _FakeDB(
        [
            {
                "variant": "CONTROL",
                "cohort_users": 20,
                "retained_d1_users": 6,
                "retained_d7_users": 8,
            },
            {
                "variant": "VARIANT_B",
                "cohort_users": 10,
                "retained_d1_users": 4,
                "retained_d7_users": 6,
            },
        ]
    )

    metrics = compute_retention_metrics(db, experiment_key="nba_retention_v1")

    assert metrics["cohort_users"] == 30
    assert metrics["retained_d7_users"] == 14
    assert metrics["d7_rate"] == 46.67
    by_variant = {row["variant"]: row for row in metrics["variants"]}
    assert by_variant["CONTROL"]["d7_rate"] == 40.0
    assert by_variant["VARIANT_B"]["d7_rate"] == 60.0


def test_retention_dedup_first_exposure_variant() -> None:
    db = _FakeDB(
        [
            {
                "variant": "CONTROL",
                "cohort_users": 2,
                "retained_d1_users": 1,
                "retained_d7_users": 1,
            }
        ]
    )

    metrics = compute_retention_metrics(db, experiment_key="nba_retention_v1")

    assert metrics["cohort_users"] == 2
    assert metrics["variants"][0]["variant"] == "CONTROL"
    joined_sql = "\n".join(db.sql_texts)
    assert "ROW_NUMBER() OVER" in joined_sql
    assert "PARTITION BY er.user_id" in joined_sql
    assert "WHERE ranked.rn = 1" in joined_sql


def test_contamination_metric_emitted() -> None:
    db = _FakeDB(
        [
            {
                "variant": "CONTROL",
                "cohort_users": 1,
                "retained_d1_users": 1,
                "retained_d7_users": 1,
            }
        ],
        contamination_count=3,
    )

    metrics = compute_retention_metrics(
        db,
        experiment_key="nba_retention_v1",
        tenant_id=9,
    )

    assert metrics["contamination_multi_variant_users_count"] == 3
    assert len(db.added) == 1
    event = db.added[0]
    assert getattr(event, "type") == "experiment_contamination_multi_variant_users_count"
    assert getattr(event, "payload")["count"] == 3


def test_no_double_counting_global_aggregate() -> None:
    db = _FakeDB(
        [
            {
                "variant": "CONTROL",
                "cohort_users": 2,
                "retained_d1_users": 1,
                "retained_d7_users": 1,
            },
            {
                "variant": "VARIANT_A",
                "cohort_users": 1,
                "retained_d1_users": 1,
                "retained_d7_users": 1,
            },
        ],
        contamination_count=1,
    )

    metrics = compute_retention_metrics(db, experiment_key="nba_retention_v1")

    assert metrics["cohort_users"] == 3
    assert metrics["retained_d1_users"] == 2
    assert metrics["retained_d7_users"] == 2


def test_compute_retention_metrics_query_count_best_effort() -> None:
    # Best-effort anti-N+1 check: independent of row volume, query count should stay constant.
    db = _FakeDB(
        [
            {"variant": "CONTROL", "cohort_users": 5000, "retained_d1_users": 2100, "retained_d7_users": 2800},
            {"variant": "VARIANT_A", "cohort_users": 5000, "retained_d1_users": 2400, "retained_d7_users": 3100},
        ],
        contamination_count=25,
    )

    compute_retention_metrics(db, experiment_key="nba_retention_v1", tenant_id=1)

    assert db._scalar_calls == 1
    assert db._execute_calls == 2


def test_get_axion_retention_metrics_no_n_plus_one() -> None:
    db = _RetentionFakeDB(
        {
            "exposures_total": 120,
            "unique_exposures_per_day": 90,
            "cohort_users": 100,
            "retained_d1_users": 40,
            "retained_d7_users": 25,
            "retained_d30_users": 10,
            "total_sessions_30d": 220.0,
            "cta_click_users": 60,
            "session_started_users": 35,
            "cta_session_started_converted_users": 20,
            "cta_session_converted_users": 18,
        }
    )

    metrics = get_axion_retention_metrics(
        db,
        filters=AxionRetentionFilters(
            tenant_id=1,
            action_type=None,
            context=None,
            persona=None,
            experiment_key="nba_retention_v1",
            variant=None,
            nba_reason=None,
            destination=None,
            dedupe_exposure_per_day=True,
            lookback_days=30,
        ),
    )

    assert metrics["cohort_users"] == 100
    assert db.execute_calls == 1
    joined_sql = "\n".join(db.sql_texts)
    assert "EXISTS (" not in joined_sql


def test_admin_retention_endpoint_returns_segmented_metrics(monkeypatch) -> None:
    app = FastAPI()
    app.include_router(axion_route.router)

    app.dependency_overrides[deps.get_db] = lambda: SimpleNamespace()
    app.dependency_overrides[deps.get_current_tenant] = lambda: SimpleNamespace(id=1)
    app.dependency_overrides[deps.get_current_tenant_optional] = lambda: SimpleNamespace(id=1)
    app.dependency_overrides[deps.get_current_user] = lambda: SimpleNamespace(id=1, email="admin@example.com")
    app.dependency_overrides[deps.get_current_membership] = lambda: SimpleNamespace(role=SimpleNamespace(value="TEACHER"))

    monkeypatch.setattr(axion_route, "_is_platform_admin", lambda _user: True)
    monkeypatch.setattr(
        axion_route,
        "compute_retention_metrics",
        lambda *_args, **_kwargs: {
            "experiment_key": "nba_retention_v1",
            "experiment_status": "ACTIVE",
            "cohort_users": 30,
            "retained_d1_users": 10,
            "retained_d7_users": 14,
            "d1_rate": 33.33,
            "d7_rate": 46.67,
            "variants": [
                {
                    "variant": "CONTROL",
                    "cohort_users": 20,
                    "retained_d1_users": 6,
                    "retained_d7_users": 8,
                    "d1_rate": 30.0,
                    "d7_rate": 40.0,
                }
            ],
        },
    )

    client = TestClient(app)
    response = client.get("/admin/experiments/nba_retention_v1/retention")
    assert response.status_code == 200
    payload = response.json()
    assert payload["experimentKey"] == "nba_retention_v1"
    assert payload["experimentStatus"] == "ACTIVE"
    assert payload["d1Rate"] == 33.33
    assert payload["d7Rate"] == 46.67
    assert payload["variants"][0]["variant"] == "CONTROL"

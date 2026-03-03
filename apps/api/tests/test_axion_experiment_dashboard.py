from __future__ import annotations

from types import SimpleNamespace
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from app.api import deps
from app.api.routes import axion as axion_route
from app.services import axion_shadow_policy
from app.services import axion_shadow_reward


class _ScalarRows:
    def __init__(self, values: list[object]) -> None:
        self._values = values

    def all(self) -> list[object]:
        return self._values


class _FakeDB:
    def scalars(self, *_args: object, **_kwargs: object) -> _ScalarRows:
        return _ScalarRows(["CONTROL", "VARIANT_A", "VARIANT_B"])


class _FakeExecutiveDB:
    def scalars(self, *_args: object, **_kwargs: object) -> _ScalarRows:
        return _ScalarRows(["exp_alpha", "exp_beta"])


class _FakeSlaRows:
    def __init__(self, row: dict[str, object]) -> None:
        self._row = row

    def mappings(self) -> "_FakeSlaRows":
        return self

    def first(self) -> dict[str, object]:
        return self._row


class _FakeSlaDB:
    def __init__(
        self,
        *,
        last_heartbeat: object,
        last_exposure: object,
        last_significance_check: object,
        started_at: object,
    ) -> None:
        self.last_heartbeat = last_heartbeat
        self.last_exposure = last_exposure
        self.last_significance_check = last_significance_check
        self.started_at = started_at

    def execute(self, stmt: object, *_args: object, **_kwargs: object) -> _FakeSlaRows:
        sql = str(stmt)
        if "axion_health_runner_heartbeat" in sql:
            return _FakeSlaRows({"last_heartbeat": self.last_heartbeat})
        if "axion_brief_exposed" in sql:
            return _FakeSlaRows({"last_exposure": self.last_exposure})
        if "experiment_stat_sig_reached" in sql:
            return _FakeSlaRows({"last_significance_check": self.last_significance_check})
        return _FakeSlaRows({"started_at": self.started_at})


class _FakeShadowRewardDB:
    def __init__(self) -> None:
        self.added: list[object] = []
        self.commits = 0

    def add(self, item: object) -> None:
        self.added.append(item)

    def commit(self) -> None:
        self.commits += 1


class _FakeShadowRewardContractDB(_FakeShadowRewardDB):
    def __init__(self) -> None:
        super().__init__()
        self.contract = SimpleNamespace(
            version=3,
            weights_json={"w1": 0.1, "w2": 0.2, "w3": 0.3, "w4": 0.05, "w5": 0.0},
            active=True,
        )

    def scalar(self, *_args: object, **_kwargs: object):
        return self.contract


class _FakeShadowPolicyRows:
    def __init__(self, row: dict[str, object] | None) -> None:
        self._row = row

    def mappings(self) -> "_FakeShadowPolicyRows":
        return self

    def first(self) -> dict[str, object] | None:
        return self._row


class _FakeShadowPolicyDB:
    def __init__(self) -> None:
        self.added: list[object] = []
        self.commits = 0

    def execute(self, stmt: object, *_args: object, **_kwargs: object) -> _FakeShadowPolicyRows:
        sql = str(stmt)
        if "FROM axion_feature_snapshot" in sql:
            return _FakeShadowPolicyRows({"sample_count": 120, "nba_enabled_ratio": 0.8})
        if "experiment_shadow_reward_computed" in sql:
            return _FakeShadowPolicyRows({"score": 31.5})
        return _FakeShadowPolicyRows(None)

    def scalar(self, *_args: object, **_kwargs: object):
        return None

    def add(self, item: object) -> None:
        self.added.append(item)

    def commit(self) -> None:
        self.commits += 1


class _FakeFeatureStoreRows:
    def __init__(self, row: dict[str, object]) -> None:
        self._row = row

    def mappings(self) -> "_FakeFeatureStoreRows":
        return self

    def first(self) -> dict[str, object]:
        return self._row


class _FakeFeatureStoreDB:
    def __init__(self, row: dict[str, object]) -> None:
        self._row = row

    def execute(self, *_args: object, **_kwargs: object) -> _FakeFeatureStoreRows:
        return _FakeFeatureStoreRows(self._row)


def test_nba_dashboard_endpoint_returns_200_and_expected_shape(monkeypatch) -> None:
    app = FastAPI()
    app.include_router(axion_route.router)

    fake_db = _FakeDB()
    app.dependency_overrides[deps.get_db] = lambda: fake_db
    app.dependency_overrides[deps.get_current_tenant] = lambda: SimpleNamespace(id=1)
    app.dependency_overrides[deps.get_current_tenant_optional] = lambda: SimpleNamespace(id=1)
    app.dependency_overrides[deps.get_current_user] = lambda: SimpleNamespace(id=1, email="tester@example.com")
    app.dependency_overrides[deps.get_current_membership] = lambda: SimpleNamespace(role=SimpleNamespace(value="CHILD"))

    def _fake_metrics(_db: object, *, filters: object) -> dict[str, float | int]:
        variant = getattr(filters, "variant", None)
        if variant == "CONTROL":
            return {
                "exposures_total": 80,
                "unique_exposures_per_day": 50,
                "cohort_users": 70,
                "retained_d1_users": 20,
                "retained_d7_users": 10,
                "retained_d30_users": 0,
                "d1_rate": 28.57,
                "d7_rate": 14.29,
                "d30_rate": 0.0,
                "session_frequency": 1.2,
                "cta_click_users": 30,
                "session_started_users": 15,
                "cta_session_started_converted_users": 12,
                "cta_to_session_started_conversion": 40.0,
                "cta_session_converted_users": 9,
                "cta_to_session_conversion": 30.0,
            }
        if variant == "VARIANT_A":
            return {
                "exposures_total": 10,
                "unique_exposures_per_day": 8,
                "cohort_users": 9,
                "retained_d1_users": 4,
                "retained_d7_users": 2,
                "retained_d30_users": 0,
                "d1_rate": 44.44,
                "d7_rate": 22.22,
                "d30_rate": 0.0,
                "session_frequency": 1.8,
                "cta_click_users": 5,
                "session_started_users": 4,
                "cta_session_started_converted_users": 3,
                "cta_to_session_started_conversion": 60.0,
                "cta_session_converted_users": 2,
                "cta_to_session_conversion": 40.0,
            }
        if variant == "VARIANT_B":
            return {
                "exposures_total": 10,
                "unique_exposures_per_day": 7,
                "cohort_users": 9,
                "retained_d1_users": 3,
                "retained_d7_users": 1,
                "retained_d30_users": 0,
                "d1_rate": 33.33,
                "d7_rate": 11.11,
                "d30_rate": 0.0,
                "session_frequency": 1.5,
                "cta_click_users": 4,
                "session_started_users": 3,
                "cta_session_started_converted_users": 2,
                "cta_to_session_started_conversion": 50.0,
                "cta_session_converted_users": 2,
                "cta_to_session_conversion": 50.0,
            }
        return {
            "exposures_total": 100,
            "unique_exposures_per_day": 65,
            "cohort_users": 88,
            "retained_d1_users": 27,
            "retained_d7_users": 13,
            "retained_d30_users": 0,
            "d1_rate": 30.68,
            "d7_rate": 14.77,
            "d30_rate": 0.0,
            "session_frequency": 1.3,
            "cta_click_users": 39,
            "session_started_users": 22,
            "cta_session_started_converted_users": 17,
            "cta_to_session_started_conversion": 43.59,
            "cta_session_converted_users": 13,
            "cta_to_session_conversion": 33.33,
        }

    monkeypatch.setattr(axion_route, "get_axion_retention_metrics", _fake_metrics)

    client = TestClient(app)
    response = client.get(
        "/api/axion/experiment/nba_retention_v1/dashboard",
        params={"dateFrom": "2026-02-01", "dateTo": "2026-02-20", "destination": "learning"},
    )
    assert response.status_code == 200
    payload = response.json()

    assert "exposuresTotal" in payload
    assert "uniqueExposuresPerDay" in payload
    assert "ctaClicked" in payload
    assert "sessionStarted" in payload
    assert "ctaToSessionStartedPct" in payload
    assert "d1RatePct" in payload
    assert "d7RatePct" in payload
    assert "avgSessionFrequency30d" in payload
    assert isinstance(payload.get("variants"), list)
    assert len(payload["variants"]) == 3

    first = payload["variants"][0]
    assert "variant" in first
    assert "exposures" in first
    assert "ctaToStartedPct" in first
    assert "d1RatePct" in first
    assert "sessionFrequency" in first
    assert "rawPValue" in first
    assert "adjustedPValue" in first
    assert "liftPctPoints" in first
    assert "significant" in first
    assert "correctionMethod" in first


def test_multiple_comparisons_adjustment_applied(monkeypatch) -> None:
    app = FastAPI()
    app.include_router(axion_route.router)

    fake_db = _FakeDB()
    app.dependency_overrides[deps.get_db] = lambda: fake_db
    app.dependency_overrides[deps.get_current_tenant] = lambda: SimpleNamespace(id=1)
    app.dependency_overrides[deps.get_current_tenant_optional] = lambda: SimpleNamespace(id=1)
    app.dependency_overrides[deps.get_current_user] = lambda: SimpleNamespace(id=1, email="tester@example.com")
    app.dependency_overrides[deps.get_current_membership] = lambda: SimpleNamespace(role=SimpleNamespace(value="CHILD"))

    def _fake_metrics(_db: object, *, filters: object) -> dict[str, float | int]:
        variant = getattr(filters, "variant", None)
        if variant == "CONTROL":
            return {
                "exposures_total": 100,
                "unique_exposures_per_day": 80,
                "cohort_users": 90,
                "retained_d1_users": 30,
                "retained_d7_users": 20,
                "retained_d30_users": 0,
                "d1_rate": 33.33,
                "d7_rate": 22.22,
                "d30_rate": 0.0,
                "session_frequency": 1.4,
                "cta_click_users": 100,
                "session_started_users": 40,
                "cta_session_started_converted_users": 40,
                "cta_to_session_started_conversion": 40.0,
                "cta_session_converted_users": 25,
                "cta_to_session_conversion": 25.0,
            }
        if variant == "VARIANT_A":
            return {
                "exposures_total": 50,
                "unique_exposures_per_day": 40,
                "cohort_users": 45,
                "retained_d1_users": 18,
                "retained_d7_users": 12,
                "retained_d30_users": 0,
                "d1_rate": 40.0,
                "d7_rate": 26.67,
                "d30_rate": 0.0,
                "session_frequency": 1.7,
                "cta_click_users": 100,
                "session_started_users": 50,
                "cta_session_started_converted_users": 50,
                "cta_to_session_started_conversion": 50.0,
                "cta_session_converted_users": 30,
                "cta_to_session_conversion": 30.0,
            }
        if variant == "VARIANT_B":
            return {
                "exposures_total": 50,
                "unique_exposures_per_day": 35,
                "cohort_users": 45,
                "retained_d1_users": 14,
                "retained_d7_users": 10,
                "retained_d30_users": 0,
                "d1_rate": 31.11,
                "d7_rate": 22.22,
                "d30_rate": 0.0,
                "session_frequency": 1.3,
                "cta_click_users": 100,
                "session_started_users": 30,
                "cta_session_started_converted_users": 30,
                "cta_to_session_started_conversion": 30.0,
                "cta_session_converted_users": 19,
                "cta_to_session_conversion": 19.0,
            }
        return {
            "exposures_total": 200,
            "unique_exposures_per_day": 130,
            "cohort_users": 180,
            "retained_d1_users": 62,
            "retained_d7_users": 42,
            "retained_d30_users": 0,
            "d1_rate": 34.44,
            "d7_rate": 23.33,
            "d30_rate": 0.0,
            "session_frequency": 1.45,
            "cta_click_users": 300,
            "session_started_users": 120,
            "cta_session_started_converted_users": 120,
            "cta_to_session_started_conversion": 40.0,
            "cta_session_converted_users": 74,
            "cta_to_session_conversion": 24.67,
        }

    monkeypatch.setattr(axion_route, "get_axion_retention_metrics", _fake_metrics)

    client = TestClient(app)
    response = client.get("/api/axion/experiment/nba_retention_v1/dashboard")
    assert response.status_code == 200
    payload = response.json()
    variants = {row["variant"]: row for row in payload["variants"]}

    control = variants["CONTROL"]
    assert control["rawPValue"] is None
    assert control["adjustedPValue"] is None
    assert control["correctionMethod"] == "bonferroni"

    for variant_name in ("VARIANT_A", "VARIANT_B"):
        item = variants[variant_name]
        assert item["rawPValue"] is not None
        assert item["adjustedPValue"] is not None
        assert item["adjustedPValue"] >= item["rawPValue"]
        assert abs(item["adjustedPValue"] - min(1.0, item["rawPValue"] * 2)) < 1e-9
        assert item["correctionMethod"] == "bonferroni"


def test_admin_page_blocks_non_admin(monkeypatch) -> None:
    app = FastAPI()
    app.include_router(axion_route.router)

    fake_db = _FakeDB()
    app.dependency_overrides[deps.get_db] = lambda: fake_db
    app.dependency_overrides[deps.get_current_tenant] = lambda: SimpleNamespace(id=1)
    app.dependency_overrides[deps.get_current_tenant_optional] = lambda: SimpleNamespace(id=1)
    app.dependency_overrides[deps.get_current_user] = lambda: SimpleNamespace(id=1, email="viewer@example.com")
    app.dependency_overrides[deps.get_current_membership] = lambda: SimpleNamespace(role=SimpleNamespace(value="TEACHER"))

    monkeypatch.setattr(axion_route, "_is_platform_admin", lambda _user: False)
    client = TestClient(app)
    response = client.get("/admin/experiments/nba_retention_v1/dashboard")
    assert response.status_code == 403


def test_dashboard_uses_only_admin_endpoints() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    page_source = (repo_root / "apps" / "web" / "app" / "platform-admin" / "experiments" / "page.tsx").read_text(encoding="utf-8")
    client_source = (repo_root / "apps" / "web" / "lib" / "api" / "client.ts").read_text(encoding="utf-8")

    assert "getNbaExperimentDashboard" not in page_source
    assert "getAxionRetentionMetrics" not in page_source
    assert "getAdminExperimentDashboard" in page_source
    assert "getAdminExperimentRetentionMetrics" in page_source
    assert "/api/axion/" not in page_source

    assert '"/admin/experiments/access"' in client_source
    assert "/admin/experiments/${encodeURIComponent(experimentKey)}/dashboard" in client_source
    assert "/admin/experiments/${encodeURIComponent(experimentKey)}/retention_metrics" in client_source


def test_frontend_does_not_compute_p_value() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    page_source = (repo_root / "apps" / "web" / "app" / "platform-admin" / "experiments" / "page.tsx").read_text(encoding="utf-8")

    assert "function twoProportionPValue" not in page_source
    assert "function erf(" not in page_source
    assert "Math.sqrt(variance)" not in page_source


def test_executive_dashboard_aggregates_correctly(monkeypatch) -> None:
    app = FastAPI()
    app.include_router(axion_route.router)

    fake_db = _FakeExecutiveDB()
    app.dependency_overrides[deps.get_db] = lambda: fake_db
    app.dependency_overrides[deps.get_current_tenant_optional] = lambda: SimpleNamespace(id=1)
    def _admin_user(request: Request):
        request.state.auth_role = "PLATFORM_ADMIN"
        return SimpleNamespace(id=1, email="admin@example.com")

    app.dependency_overrides[deps.get_current_user] = _admin_user
    app.dependency_overrides[deps.get_current_membership] = lambda: SimpleNamespace(role=SimpleNamespace(value="PLATFORM_ADMIN"))
    monkeypatch.setattr(axion_route, "_is_platform_admin", lambda _user: True)

    def _fake_dashboard(*_args, **kwargs):
        key = kwargs.get("experiment_key")
        if key == "exp_alpha":
            variants = [
                axion_route.AxionExperimentDashboardVariantOut(
                    variant="CONTROL",
                    exposures=120,
                    ctaToStartedPct=40.0,
                    d1RatePct=30.0,
                    sessionFrequency=1.2,
                    rawPValue=None,
                    adjustedPValue=None,
                    liftPctPoints=0.0,
                    significant=False,
                    correctionMethod="bonferroni",
                ),
                axion_route.AxionExperimentDashboardVariantOut(
                    variant="VARIANT_A",
                    exposures=100,
                    ctaToStartedPct=50.0,
                    d1RatePct=35.0,
                    sessionFrequency=1.5,
                    rawPValue=0.01,
                    adjustedPValue=0.02,
                    liftPctPoints=10.0,
                    significant=True,
                    correctionMethod="bonferroni",
                ),
            ]
        else:
            variants = [
                axion_route.AxionExperimentDashboardVariantOut(
                    variant="CONTROL",
                    exposures=90,
                    ctaToStartedPct=35.0,
                    d1RatePct=20.0,
                    sessionFrequency=1.0,
                    rawPValue=None,
                    adjustedPValue=None,
                    liftPctPoints=0.0,
                    significant=False,
                    correctionMethod="bonferroni",
                ),
                axion_route.AxionExperimentDashboardVariantOut(
                    variant="VARIANT_B",
                    exposures=50,
                    ctaToStartedPct=33.0,
                    d1RatePct=18.0,
                    sessionFrequency=0.9,
                    rawPValue=0.20,
                    adjustedPValue=0.40,
                    liftPctPoints=-2.0,
                    significant=False,
                    correctionMethod="bonferroni",
                ),
            ]
        return axion_route.AxionExperimentDashboardResponse(
            exposuresTotal=0,
            uniqueExposuresPerDay=0,
            ctaClicked=0,
            sessionStarted=0,
            ctaToSessionStartedPct=0.0,
            d1RatePct=0.0,
            d7RatePct=0.0,
            avgSessionFrequency30d=0.0,
            variants=variants,
        )

    def _fake_retention(*_args, **kwargs):
        key = kwargs.get("experiment_key")
        if key == "exp_alpha":
            return {"experiment_status": "ACTIVE", "cohort_users": 100, "retained_d1_users": 40, "retained_d7_users": 20}
        return {"experiment_status": "AUTO_PAUSED", "cohort_users": 50, "retained_d1_users": 10, "retained_d7_users": 5}

    def _fake_rollout(*_args, **kwargs):
        key = kwargs.get("experiment_key")
        return SimpleNamespace(current_rollout=25 if key == "exp_alpha" else 50)

    def _fake_weekly(*_args, **_kwargs):
        return [
            {
                "week_start": axion_route.date(2026, 2, 2),
                "cohort_users": 20,
                "retained_d1_users": 8,
                "retained_d7_users": 4,
                "exposures_total": 50,
                "clicks_total": 20,
            },
            {
                "week_start": axion_route.date(2026, 2, 9),
                "cohort_users": 30,
                "retained_d1_users": 12,
                "retained_d7_users": 6,
                "exposures_total": 60,
                "clicks_total": 24,
            },
        ]

    monkeypatch.setattr(axion_route, "_build_experiment_dashboard_response", _fake_dashboard)
    monkeypatch.setattr(axion_route, "compute_retention_metrics", _fake_retention)
    monkeypatch.setattr(axion_route, "get_rollout_status", _fake_rollout)
    monkeypatch.setattr(axion_route, "_load_executive_weekly_points", _fake_weekly)

    client = TestClient(app)
    response = client.get("/admin/experiments/executive")
    assert response.status_code == 200
    payload = response.json()

    assert payload["activeExperiments"] == 1
    assert payload["pausedExperiments"] == 1
    assert abs(payload["weightedAverageLiftPp"] - 6.0) < 1e-9
    assert abs(payload["aggregatedD1RatePct"] - 33.3333) < 1e-4
    assert abs(payload["aggregatedD7RatePct"] - 16.6667) < 1e-4
    assert abs(payload["experimentalSuccessRatePct"] - 50.0) < 1e-9
    assert abs(payload["averageRolloutPct"] - 37.5) < 1e-9
    assert len(payload["experiments"]) == 2
    assert payload["experiments"][0]["indicator"] in {"green", "yellow", "red"}
    assert len(payload["weeklyRetention"]) == 2
    assert len(payload["weeklyCtr"]) == 2


def test_sla_warn_when_no_heartbeat(monkeypatch) -> None:
    now = axion_route.datetime.now(axion_route.UTC)
    fake_db = _FakeSlaDB(
        last_heartbeat=None,
        last_exposure=now - axion_route.timedelta(minutes=20),
        last_significance_check=now - axion_route.timedelta(days=1),
        started_at=now - axion_route.timedelta(days=15),
    )

    app = FastAPI()
    app.include_router(axion_route.router)
    app.dependency_overrides[deps.get_db] = lambda: fake_db
    app.dependency_overrides[deps.get_current_tenant_optional] = lambda: SimpleNamespace(id=1)
    def _admin_user(request: Request):
        request.state.auth_role = "PLATFORM_ADMIN"
        return SimpleNamespace(id=1, email="admin@example.com")

    app.dependency_overrides[deps.get_current_user] = _admin_user
    app.dependency_overrides[deps.get_current_membership] = lambda: SimpleNamespace(role=SimpleNamespace(value="PLATFORM_ADMIN"))
    monkeypatch.setattr(axion_route, "_is_platform_admin", lambda _user: True)

    client = TestClient(app)
    response = client.get("/admin/experiments/nba_retention_v1/sla_status")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "WARN"
    assert payload["lastHeartbeat"] is None


def test_sla_breach_when_no_exposure(monkeypatch) -> None:
    now = axion_route.datetime.now(axion_route.UTC)
    fake_db = _FakeSlaDB(
        last_heartbeat=now - axion_route.timedelta(minutes=10),
        last_exposure=now - axion_route.timedelta(days=5),
        last_significance_check=now - axion_route.timedelta(days=2),
        started_at=now - axion_route.timedelta(days=20),
    )

    app = FastAPI()
    app.include_router(axion_route.router)
    app.dependency_overrides[deps.get_db] = lambda: fake_db
    app.dependency_overrides[deps.get_current_tenant_optional] = lambda: SimpleNamespace(id=1)
    def _admin_user(request: Request):
        request.state.auth_role = "PLATFORM_ADMIN"
        return SimpleNamespace(id=1, email="admin@example.com")

    app.dependency_overrides[deps.get_current_user] = _admin_user
    app.dependency_overrides[deps.get_current_membership] = lambda: SimpleNamespace(role=SimpleNamespace(value="PLATFORM_ADMIN"))
    monkeypatch.setattr(axion_route, "_is_platform_admin", lambda _user: True)

    client = TestClient(app)
    response = client.get("/admin/experiments/nba_retention_v1/sla_status")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "BREACH"
    assert payload["exposureLagMinutes"] >= (5 * 24 * 60)


def test_shadow_reward_computation(monkeypatch) -> None:
    app = FastAPI()
    app.include_router(axion_route.router)

    fake_db = _FakeShadowRewardDB()
    app.dependency_overrides[deps.get_db] = lambda: fake_db
    app.dependency_overrides[deps.get_current_tenant_optional] = lambda: SimpleNamespace(id=1)
    def _admin_user(request: Request):
        request.state.auth_role = "PLATFORM_ADMIN"
        return SimpleNamespace(id=1, email="admin@example.com")

    app.dependency_overrides[deps.get_current_user] = _admin_user
    app.dependency_overrides[deps.get_current_membership] = lambda: SimpleNamespace(role=SimpleNamespace(value="PLATFORM_ADMIN"))
    monkeypatch.setattr(axion_route, "_is_platform_admin", lambda _user: True)

    monkeypatch.setattr(
        axion_shadow_reward,
        "get_axion_retention_metrics",
        lambda *_args, **_kwargs: {
            "cta_to_session_conversion": 40.0,
            "d1_rate": 30.0,
            "d7_rate": 20.0,
        },
    )

    client = TestClient(app)
    response = client.get("/admin/experiments/nba_retention_v1/shadow_reward")
    assert response.status_code == 200
    payload = response.json()

    assert payload["experimentKey"] == "nba_retention_v1"
    assert abs(payload["shadowRewardScore"] - 31.0) < 1e-9
    assert payload["timestamp"]
    assert fake_db.commits == 1
    assert any(getattr(item, "type", "") == "experiment_shadow_reward_computed" for item in fake_db.added)


def test_shadow_reward_uses_contract_weights(monkeypatch) -> None:
    fake_db = _FakeShadowRewardContractDB()
    monkeypatch.setattr(
        axion_shadow_reward,
        "get_axion_retention_metrics",
        lambda *_args, **_kwargs: {
            "cta_to_session_conversion": 50.0,
            "d1_rate": 40.0,
            "d7_rate": 30.0,
            "session_frequency": 5.0,
        },
    )
    result = axion_shadow_reward.compute_shadow_reward(
        fake_db,
        experiment_key="nba_retention_v1",
        tenant_id=1,
    )

    assert abs(float(result["shadow_reward_score"]) - 18.5) < 1e-9
    event = next(item for item in fake_db.added if getattr(item, "type", "") == "experiment_shadow_reward_computed")
    snapshot = getattr(event, "payload", {}).get("metric_snapshot", {})
    assert snapshot.get("reward_contract_version") == 3
    assert snapshot.get("weights", {}).get("w1") == 0.1


def test_shadow_policy_candidate_created(monkeypatch) -> None:
    fake_db = _FakeShadowPolicyDB()
    monkeypatch.setattr(
        axion_shadow_policy,
        "get_axion_retention_metrics",
        lambda *_args, **_kwargs: {
            "cohort_users": 200,
            "d7_rate": 25.0,
            "cta_to_session_started_conversion": 45.0,
        },
    )
    result = axion_shadow_policy.compute_shadow_policy(
        fake_db,
        experiment_key="nba_retention_v1",
        tenant_id=1,
    )

    assert result["experiment_key"] == "nba_retention_v1"
    assert result["policy_version"] == 1
    assert float(result["expected_lift"]) > 0.0
    assert float(result["confidence_score"]) > 0.0
    assert fake_db.commits == 1
    assert len(fake_db.added) == 1


def test_feature_store_status_warn(monkeypatch) -> None:
    app = FastAPI()
    app.include_router(axion_route.router)

    fake_db = _FakeFeatureStoreDB(
        {
            "total_rows": 1000,
            "growth_last_7_days": 150,
            "avg_snapshot_per_user": 4.25,
            "estimated_storage_mb": 12.5,
        }
    )
    app.dependency_overrides[deps.get_db] = lambda: fake_db
    app.dependency_overrides[deps.get_current_tenant_optional] = lambda: SimpleNamespace(id=1)
    def _admin_user(request: Request):
        request.state.auth_role = "PLATFORM_ADMIN"
        return SimpleNamespace(id=1, email="admin@example.com")

    app.dependency_overrides[deps.get_current_user] = _admin_user
    app.dependency_overrides[deps.get_current_membership] = lambda: SimpleNamespace(role=SimpleNamespace(value="PLATFORM_ADMIN"))
    monkeypatch.setattr(axion_route, "_is_platform_admin", lambda _user: True)
    monkeypatch.setattr(axion_route.settings, "axion_feature_store_warn_threshold", 100)

    client = TestClient(app)
    response = client.get("/admin/axion/feature_store_status")
    assert response.status_code == 200
    payload = response.json()
    assert payload["totalRows"] == 1000
    assert payload["growthLast7Days"] == 150
    assert abs(payload["avgSnapshotPerUser"] - 4.25) < 1e-9
    assert abs(payload["estimatedStorageMb"] - 12.5) < 1e-9
    assert payload["status"] == "WARN"

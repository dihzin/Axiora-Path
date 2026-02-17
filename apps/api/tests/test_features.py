from __future__ import annotations

from typing import Any

from app.services.features import is_feature_enabled


class _FakeDB:
    def __init__(self, scalar_results: list[Any]) -> None:
        self._scalar_results = scalar_results

    def scalar(self, _query: Any) -> Any:
        if not self._scalar_results:
            return None
        return self._scalar_results.pop(0)


def _flag(enabled: bool) -> Any:
    return type("FeatureFlagStub", (), {"enabled_globally": enabled})()


def test_feature_daily_missions_can_be_enabled_per_tenant() -> None:
    db = _FakeDB([_flag(True)])
    assert is_feature_enabled("feature_daily_missions", db, tenant_id=1) is True


def test_feature_daily_missions_defaults_false_for_new_tenant() -> None:
    db = _FakeDB([None, _flag(True)])
    assert is_feature_enabled("feature_daily_missions", db, tenant_id=999) is False


def test_other_feature_can_fallback_to_global_flag() -> None:
    db = _FakeDB([None, _flag(True)])
    assert is_feature_enabled("ai_coach_v2", db, tenant_id=999) is True

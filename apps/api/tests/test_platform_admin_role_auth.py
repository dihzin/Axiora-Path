from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException, Response

from app.api.routes import auth
from app.api.routes.axion import _resolve_admin_tenant_scope
from app.models import Membership, MembershipRole, Tenant, TenantType, User
from app.schemas.auth import LoginRequest


class _FakeDB:
    def __init__(self, scalar_values: list[object]) -> None:
        self._scalar_values = list(scalar_values)

    def scalar(self, *_args, **_kwargs):
        if not self._scalar_values:
            return None
        return self._scalar_values.pop(0)

    def commit(self) -> None:
        return


def test_platform_login_requires_platform_admin_role(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(auth, "verify_password", lambda *_args, **_kwargs: True)
    monkeypatch.setattr(auth, "_set_auth_cookies", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(auth.settings, "platform_admin_emails", "admin@local.com")

    user = User(id=10, email="admin@local.com", name="Admin", password_hash="hashed")
    tenant = Tenant(id=20, type=TenantType.SCHOOL, name="Platform", slug="platform-admin")
    membership = Membership(user_id=user.id, tenant_id=tenant.id, role=MembershipRole.TEACHER)
    db = _FakeDB([user, tenant, membership])

    with pytest.raises(HTTPException) as exc_info:
        auth.platform_login(
            LoginRequest(email="admin@local.com", password="Axion@123"),
            db,  # type: ignore[arg-type]
            Response(),
        )
    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "Platform admin role required for platform login"


def test_admin_scope_rejects_non_platform_admin_role() -> None:
    request = SimpleNamespace(state=SimpleNamespace(auth_role="TEACHER"))
    user = User(id=1, email="admin@local.com", name="Admin", password_hash="hashed")
    tenant = Tenant(id=7, type=TenantType.SCHOOL, name="Platform", slug="platform-admin")

    with pytest.raises(HTTPException) as exc_info:
        _resolve_admin_tenant_scope(
            request=request,  # type: ignore[arg-type]
            endpoint="/admin/experiments/access",
            user=user,
            tenant=tenant,
        )
    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "Platform admin role required"


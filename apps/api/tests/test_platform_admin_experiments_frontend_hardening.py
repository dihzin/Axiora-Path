from __future__ import annotations

from pathlib import Path


def _page_source() -> str:
    repo_root = Path(__file__).resolve().parents[3]
    return (repo_root / "apps" / "web" / "app" / "platform-admin" / "experiments" / "page.tsx").read_text(encoding="utf-8")


def test_blocks_when_response_tenant_mismatch() -> None:
    source = _page_source()
    assert "TENANT_SCOPE_MISMATCH" in source
    assert "metrics.filters?.tenantId !== expectedTenantId" in source
    assert "redirectToForbidden();" in source


def test_does_not_render_without_admin_claim() -> None:
    source = _page_source()
    assert "const access = await getAdminExperimentAccess();" in source
    assert "if (!access.ok || !Number.isInteger(access.tenantId) || access.tenantId <= 0)" in source
    assert "setAuthChecked(true);" in source

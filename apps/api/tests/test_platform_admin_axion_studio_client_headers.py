from __future__ import annotations

from pathlib import Path


def _client_source() -> str:
    repo_root = Path(__file__).resolve().parents[3]
    return (repo_root / "apps" / "web" / "lib" / "api" / "client.ts").read_text(encoding="utf-8")


def test_platform_admin_client_requests_include_tenant_header() -> None:
    source = _client_source()
    required_calls = [
        'return apiRequest<AxionStudioMe>("/api/platform-admin/axion/me", {',
        'return apiRequest<PlatformTenantSummary[]>(`/api/platform-admin/tenants${suffix}`, {',
        'return apiRequest<AxionStudioPolicy[]>(`/api/platform-admin/axion/policies${suffix}`, {',
        'return apiRequest<AxionStudioTemplate[]>(`/api/platform-admin/axion/templates${suffix}`, {',
        'return apiRequest<AxionStudioAudit[]>(`/api/platform-admin/axion/audit${suffix}`, {',
    ]
    for marker in required_calls:
        assert marker in source

    assert source.count("includeTenant: true") >= 20
    assert source.count("includeTenant: false") >= 4

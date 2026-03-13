from __future__ import annotations

from datetime import date
from pathlib import Path

from app.api.routes.axion_studio import _next_finance_due_date
from app.models import AxionFinanceRecurrence


def test_next_finance_due_date_handles_weekly_monthly_yearly_edges() -> None:
    assert _next_finance_due_date(date(2026, 3, 12), AxionFinanceRecurrence.WEEKLY) == date(2026, 3, 19)
    assert _next_finance_due_date(date(2026, 1, 31), AxionFinanceRecurrence.MONTHLY) == date(2026, 2, 28)
    assert _next_finance_due_date(date(2024, 2, 29), AxionFinanceRecurrence.YEARLY) == date(2025, 2, 28)
    assert _next_finance_due_date(date(2026, 3, 12), AxionFinanceRecurrence.NONE) is None


def test_finance_routes_are_exposed_under_platform_admin_scope() -> None:
    source = Path(__file__).resolve().parents[1] / "app" / "api" / "routes" / "axion_studio.py"
    text = source.read_text(encoding="utf-8")
    required = [
        '/api/platform-admin/axion/finance/balance',
        '/api/platform-admin/axion/finance/bills',
        '/api/platform-admin/axion/finance/bills/{bill_id}/pay',
        'Tenant.slug == "platform-admin"',
        "FINANCE_BILL_PAY",
    ]
    for marker in required:
        assert marker in text


def test_finance_client_requests_include_tenant_header() -> None:
    source = Path(__file__).resolve().parents[3] / "apps" / "web" / "lib" / "api" / "client.ts"
    text = source.read_text(encoding="utf-8")
    required_calls = [
        'return apiRequest<AxionFinanceBalance>("/api/platform-admin/axion/finance/balance", {',
        'return apiRequest<AxionFinanceBillsPage>(`/api/platform-admin/axion/finance/bills${suffix}`, {',
        'return apiRequest<AxionFinanceBill>("/api/platform-admin/axion/finance/bills", {',
        'return apiRequest<AxionFinanceBill>(`/api/platform-admin/axion/finance/bills/${billId}`, {',
        'return apiRequest<AxionFinancePayBillResponse>(`/api/platform-admin/axion/finance/bills/${billId}/pay`, {',
    ]
    for marker in required_calls:
        assert marker in text

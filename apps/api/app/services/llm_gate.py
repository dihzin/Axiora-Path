from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import LLMSettings, LLMUsageLog, LLMUsageStatus, LLMUseCase, Plan, Tenant


CONSUME_BUDGET_STATUSES: tuple[LLMUsageStatus, ...] = (
    LLMUsageStatus.HIT,
    LLMUsageStatus.MISS,
    LLMUsageStatus.FAILED,
    LLMUsageStatus.FALLBACK,
)

COUNT_LIMIT_STATUSES: tuple[LLMUsageStatus, ...] = CONSUME_BUDGET_STATUSES


@dataclass(slots=True)
class LLMGateDecision:
    allowed: bool
    reason: str
    settings: LLMSettings | None
    remaining_budget: int
    remaining_user_calls: int
    execution_mode: str
    plan_name: str
    remaining_monthly_budget: int


def _resolve_use_case(use_case: str | LLMUseCase) -> LLMUseCase:
    if isinstance(use_case, LLMUseCase):
        return use_case
    key = str(use_case or "").strip().upper()
    if key in LLMUseCase.__members__:
        return LLMUseCase[key]
    raise ValueError(f"Unsupported LLM use case: {use_case}")


def _day_window(now: datetime | None = None) -> tuple[datetime, datetime]:
    anchor = now or datetime.now(UTC)
    start = anchor.replace(hour=0, minute=0, second=0, microsecond=0)
    return start, start + timedelta(days=1)


def _month_window(now: datetime | None = None) -> tuple[datetime, datetime]:
    anchor = now or datetime.now(UTC)
    start = anchor.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if start.month == 12:
        end = start.replace(year=start.year + 1, month=1)
    else:
        end = start.replace(month=start.month + 1)
    return start, end


def get_or_create_llm_settings(db: Session, *, tenant_id: int) -> LLMSettings:
    row = db.scalar(select(LLMSettings).where(LLMSettings.tenant_id == tenant_id))
    if row is not None:
        return row
    row = LLMSettings(
        tenant_id=tenant_id,
        enabled=False,
        provider_key="noop",
        daily_token_budget=0,
        per_user_daily_limit=0,
        allowed_use_cases=[],
    )
    db.add(row)
    db.flush()
    return row


def _allowed_use_cases(settings: LLMSettings) -> set[str]:
    values = settings.allowed_use_cases if isinstance(settings.allowed_use_cases, list) else []
    return {str(item).strip().upper() for item in values if str(item).strip()}


def _resolve_plan(db: Session, *, tenant_id: int) -> Plan:
    tenant_plan_name = db.scalar(select(Tenant.plan_name).where(Tenant.id == tenant_id)) or "FREE"
    plan = db.scalar(select(Plan).where(Plan.name == str(tenant_plan_name)))
    if plan is not None:
        return plan
    fallback = db.scalar(select(Plan).where(Plan.name == "FREE"))
    if fallback is not None:
        return fallback
    # Fallback em memória para manter comportamento seguro caso migration não tenha rodado.
    return Plan(
        name="FREE",
        llm_daily_budget=0,
        llm_monthly_budget=0,
        nba_enabled=True,
        advanced_personalization_enabled=False,
    )


def _execution_mode_for_plan(plan_name: str) -> str:
    key = str(plan_name or "FREE").strip().upper()
    if key == "PREMIUM":
        return "llm"
    if key == "PRO":
        return "rule_cache"
    return "deterministic"


def can_call(
    db: Session,
    *,
    tenant_id: int,
    user_id: int,
    use_case: str | LLMUseCase,
) -> LLMGateDecision:
    resolved = _resolve_use_case(use_case)
    plan = _resolve_plan(db, tenant_id=tenant_id)
    mode = _execution_mode_for_plan(plan.name)
    settings = get_or_create_llm_settings(db, tenant_id=tenant_id)

    if mode != "llm":
        return LLMGateDecision(
            allowed=False,
            reason=f"plan_{mode}",
            settings=settings,
            remaining_budget=max(0, int(plan.llm_daily_budget)),
            remaining_user_calls=max(0, int(settings.per_user_daily_limit)),
            execution_mode=mode,
            plan_name=str(plan.name),
            remaining_monthly_budget=max(0, int(plan.llm_monthly_budget)),
        )

    if not bool(settings.enabled):
        return LLMGateDecision(
            allowed=False,
            reason="disabled",
            settings=settings,
            remaining_budget=max(0, int(settings.daily_token_budget)),
            remaining_user_calls=max(0, int(settings.per_user_daily_limit)),
            execution_mode=mode,
            plan_name=str(plan.name),
            remaining_monthly_budget=max(0, int(plan.llm_monthly_budget)),
        )

    allowed_cases = _allowed_use_cases(settings)
    if resolved.value not in allowed_cases:
        return LLMGateDecision(
            allowed=False,
            reason="use_case_not_allowed",
            settings=settings,
            remaining_budget=max(0, int(settings.daily_token_budget)),
            remaining_user_calls=max(0, int(settings.per_user_daily_limit)),
            execution_mode=mode,
            plan_name=str(plan.name),
            remaining_monthly_budget=max(0, int(plan.llm_monthly_budget)),
        )

    day_start, day_end = _day_window()
    month_start, month_end = _month_window()
    plan_daily_limit = max(0, int(plan.llm_daily_budget))
    plan_monthly_limit = max(0, int(plan.llm_monthly_budget))
    tenant_spent = int(
        db.scalar(
            select(func.coalesce(func.sum(LLMUsageLog.tokens_estimated), 0)).where(
                LLMUsageLog.tenant_id == tenant_id,
                LLMUsageLog.status.in_(CONSUME_BUDGET_STATUSES),
                LLMUsageLog.created_at >= day_start,
                LLMUsageLog.created_at < day_end,
            )
        )
        or 0
    )
    tenant_month_spent = int(
        db.scalar(
            select(func.coalesce(func.sum(LLMUsageLog.tokens_estimated), 0)).where(
                LLMUsageLog.tenant_id == tenant_id,
                LLMUsageLog.status.in_(CONSUME_BUDGET_STATUSES),
                LLMUsageLog.created_at >= month_start,
                LLMUsageLog.created_at < month_end,
            )
        )
        or 0
    )
    tenant_daily_cap = max(0, int(settings.daily_token_budget))
    effective_daily_cap = min(limit for limit in [plan_daily_limit, tenant_daily_cap] if limit > 0) if (plan_daily_limit > 0 or tenant_daily_cap > 0) else 0
    remaining_budget = max(0, effective_daily_cap - tenant_spent) if effective_daily_cap > 0 else 0
    remaining_monthly_budget = max(0, plan_monthly_limit - tenant_month_spent) if plan_monthly_limit > 0 else 0
    if plan_daily_limit <= 0:
        return LLMGateDecision(
            allowed=False,
            reason="plan_daily_budget_exceeded",
            settings=settings,
            remaining_budget=0,
            remaining_user_calls=max(0, int(settings.per_user_daily_limit)),
            execution_mode=mode,
            plan_name=str(plan.name),
            remaining_monthly_budget=remaining_monthly_budget,
        )
    if effective_daily_cap > 0 and remaining_budget <= 0:
        return LLMGateDecision(
            allowed=False,
            reason="tenant_budget_exceeded",
            settings=settings,
            remaining_budget=0,
            remaining_user_calls=max(0, int(settings.per_user_daily_limit)),
            execution_mode=mode,
            plan_name=str(plan.name),
            remaining_monthly_budget=remaining_monthly_budget,
        )
    if plan_monthly_limit > 0 and remaining_monthly_budget <= 0:
        return LLMGateDecision(
            allowed=False,
            reason="plan_monthly_budget_exceeded",
            settings=settings,
            remaining_budget=remaining_budget,
            remaining_user_calls=max(0, int(settings.per_user_daily_limit)),
            execution_mode=mode,
            plan_name=str(plan.name),
            remaining_monthly_budget=0,
        )

    user_calls = int(
        db.scalar(
            select(func.count(LLMUsageLog.id)).where(
                LLMUsageLog.tenant_id == tenant_id,
                LLMUsageLog.user_id == user_id,
                LLMUsageLog.status.in_(COUNT_LIMIT_STATUSES),
                LLMUsageLog.created_at >= day_start,
                LLMUsageLog.created_at < day_end,
            )
        )
        or 0
    )
    remaining_user_calls = max(0, int(settings.per_user_daily_limit) - user_calls)
    if int(settings.per_user_daily_limit) > 0 and remaining_user_calls <= 0:
        return LLMGateDecision(
            allowed=False,
            reason="user_daily_limit_exceeded",
            settings=settings,
            remaining_budget=remaining_budget,
            remaining_user_calls=0,
            execution_mode=mode,
            plan_name=str(plan.name),
            remaining_monthly_budget=remaining_monthly_budget,
        )

    return LLMGateDecision(
        allowed=True,
        reason="allowed",
        settings=settings,
        remaining_budget=remaining_budget,
        remaining_user_calls=remaining_user_calls,
        execution_mode=mode,
        plan_name=str(plan.name),
        remaining_monthly_budget=remaining_monthly_budget,
    )


def log_llm_usage(
    db: Session,
    *,
    tenant_id: int,
    user_id: int,
    use_case: str | LLMUseCase,
    prompt: str,
    cache_key: str | None,
    tokens_estimated: int,
    latency_ms: int,
    status: LLMUsageStatus,
) -> LLMUsageLog:
    resolved = _resolve_use_case(use_case)
    prompt_hash = sha256(prompt.encode("utf-8")).hexdigest()
    row = LLMUsageLog(
        tenant_id=tenant_id,
        user_id=user_id,
        use_case=resolved,
        prompt_hash=prompt_hash,
        cache_key=cache_key,
        tokens_estimated=max(0, int(tokens_estimated)),
        latency_ms=max(0, int(latency_ms)),
        status=status,
    )
    db.add(row)
    db.flush()
    return row


class LLMGate:
    def can_call(
        self,
        db: Session,
        *,
        tenant_id: int,
        user_id: int,
        use_case: str | LLMUseCase,
    ) -> LLMGateDecision:
        return can_call(db, tenant_id=tenant_id, user_id=user_id, use_case=use_case)

    def canCall(
        self,
        db: Session,
        *,
        tenantId: int,
        userId: int,
        useCase: str | LLMUseCase,
    ) -> LLMGateDecision:
        return self.can_call(db, tenant_id=tenantId, user_id=userId, use_case=useCase)


llmGate = LLMGate()

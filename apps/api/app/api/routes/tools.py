from __future__ import annotations

import json
import logging
from typing import Annotated

logger = logging.getLogger(__name__)

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from redis.asyncio import Redis

from app.api.deps import get_current_tenant, get_current_user
from app.models import Tenant, User
from app.schemas.tools import (
    ToolsBillingStatusResponse,
    ToolsCatalogItemOut,
    ToolsCatalogResponse,
    ToolsCheckoutSessionRequest,
    ToolsCheckoutSessionResponse,
    ToolsExerciseItemOut,
    ToolsGenerateExercisesRequest,
    ToolsGenerateExercisesResponse,
    ToolsGuestSessionRequest,
    ToolsGuestSessionResponse,
    ToolsIdentifyRequest,
    ToolsIdentifyResponse,
    ToolsLinkAccountRequest,
    ToolsLinkAccountResponse,
    ToolsPricingPackOut,
    ToolsPricingResponse,
)
from app.services.tools_billing_service import (
    PRICING_PACKS,
    BillingConfigError,
    BillingGatewayError,
    ToolsBillingService,
)
from app.services.tools_exercise_generator import (
    ExerciseGenerationInput,
    ToolsExerciseGeneratorService,
    build_axiora_pdf_html,
)
from app.services.tools_service import ToolsService, ToolsSessionNotFoundError, ToolsValidationError

router = APIRouter(prefix="/api/tools", tags=["tools"])
FREE_GENERATION_LIMIT = 3
UPGRADE_URL = "/tools/gerador-atividades?upgrade=credits_30"


def get_tools_service(request: Request) -> ToolsService:
    redis = getattr(request.app.state, "redis", None)
    if not isinstance(redis, Redis):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Tools service unavailable",
        )
    return ToolsService(redis)


def _generation_scope_key(request: Request, session_token: str | None) -> str:
    if session_token:
        return f"session:{session_token}"
    host = request.client.host if request.client is not None else "unknown"
    return f"ip:{host}"


def _build_paywall_detail(
    *,
    free_used: int,
    remaining_free: int,
    paid_credits_remaining: int,
) -> dict[str, int | str | bool]:
    return {
        "message": "Limite gratuito atingido. Libere mais gerações com um pacote de créditos.",
        "free_limit": FREE_GENERATION_LIMIT,
        "free_used": free_used,
        "remaining_free_generations": remaining_free,
        "paid_credits_remaining": paid_credits_remaining,
        "paywall_required": True,
        "upgrade_url": UPGRADE_URL,
    }


@router.get("/catalog", response_model=ToolsCatalogResponse)
async def get_catalog(
    service: Annotated[ToolsService, Depends(get_tools_service)],
) -> ToolsCatalogResponse:
    items = service.list_catalog()
    return ToolsCatalogResponse(
        items=[
            ToolsCatalogItemOut(
                slug=item.slug,
                name=item.name,
                summary=item.summary,
                price_label=item.price_label,
                status=item.status,
                entry_path=item.entry_path,
            )
            for item in items
        ],
    )


@router.get("/pricing", response_model=ToolsPricingResponse)
async def get_tools_pricing() -> ToolsPricingResponse:
    return ToolsPricingResponse(
        packs=[
            ToolsPricingPackOut(
                code=pack.code,
                credits=pack.credits,
                price_cents=pack.price_cents,
                price_label=pack.price_label,
                currency=pack.currency,
            )
            for pack in PRICING_PACKS.values()
        ],
    )


@router.post("/guest-session", response_model=ToolsGuestSessionResponse)
async def create_guest_session(
    payload: ToolsGuestSessionRequest,
    service: Annotated[ToolsService, Depends(get_tools_service)],
) -> ToolsGuestSessionResponse:
    session_token, expires_at = await service.create_guest_session(
        tool_slug=payload.tool_slug,
        source_path=payload.source_path,
        utm=payload.utm,
    )
    return ToolsGuestSessionResponse(
        session_token=session_token,
        mode="guest",
        expires_at=expires_at,
    )


@router.post("/identify", response_model=ToolsIdentifyResponse)
async def identify_tools_user(
    payload: ToolsIdentifyRequest,
    service: Annotated[ToolsService, Depends(get_tools_service)],
) -> ToolsIdentifyResponse:
    try:
        await service.identify_email(
            session_token=payload.session_token,
            email=payload.email,
            name=payload.name,
            consent_marketing=payload.consent_marketing,
        )
    except ToolsSessionNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ToolsValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    return ToolsIdentifyResponse(
        session_token=payload.session_token,
        mode="light_user",
        email=payload.email.strip().lower(),
    )


@router.post("/link-account", response_model=ToolsLinkAccountResponse)
async def link_tools_to_core_account(
    payload: ToolsLinkAccountRequest,
    service: Annotated[ToolsService, Depends(get_tools_service)],
    user: Annotated[User, Depends(get_current_user)],
    tenant: Annotated[Tenant, Depends(get_current_tenant)],
) -> ToolsLinkAccountResponse:
    try:
        await service.link_account(
            session_token=payload.session_token,
            user_id=user.id,
            tenant_id=tenant.id,
        )
    except ToolsSessionNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return ToolsLinkAccountResponse(
        session_token=payload.session_token,
        mode="linked",
        linked_user_id=user.id,
        linked_tenant_id=tenant.id,
    )


@router.post("/generate-exercises", response_model=ToolsGenerateExercisesResponse)
async def generate_exercises(
    payload: ToolsGenerateExercisesRequest,
    request: Request,
    service: Annotated[ToolsService, Depends(get_tools_service)],
) -> ToolsGenerateExercisesResponse:
    scope_key = _generation_scope_key(request, payload.session_token)
    free_used_before = await service.get_free_generation_usage(key_id=scope_key)
    paid_credits_before = await service.get_paid_generation_credits(key_id=scope_key)
    remaining_free_before = max(0, FREE_GENERATION_LIMIT - free_used_before)

    free_used = free_used_before
    remaining_free = remaining_free_before
    paid_credits_remaining = paid_credits_before
    if remaining_free_before > 0:
        free_used, remaining_free, _ = await service.increment_free_generation_usage(
            key_id=scope_key,
            free_limit=FREE_GENERATION_LIMIT,
        )
    elif paid_credits_before > 0:
        paid_credits_remaining = await service.consume_paid_generation_credit(key_id=scope_key)
    else:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=_build_paywall_detail(
                free_used=free_used_before,
                remaining_free=remaining_free_before,
                paid_credits_remaining=paid_credits_before,
            ),
        )

    generator = ToolsExerciseGeneratorService()
    generated, llm_mode = generator.generate(
        ExerciseGenerationInput(
            subject=payload.subject,
            topic=payload.topic,
            age=payload.age,
            difficulty=payload.difficulty,
            exercise_count=payload.exercise_count,
        )
    )

    raw_exercises = generated["exercises"]
    exercises = [
        ToolsExerciseItemOut(
            number=int(item["number"]),
            prompt=str(item["prompt"]),
            answer=str(item["answer"]),
        )
        for item in raw_exercises
    ]
    answer_key = [
        ToolsExerciseItemOut(
            number=item.number,
            prompt=item.prompt,
            answer=item.answer,
        )
        for item in exercises
    ]
    pdf_html = build_axiora_pdf_html(
        title=generated["title"],
        instructions=generated["instructions"],
        exercises=[item.model_dump() for item in exercises],
        answer_key=[item.model_dump() for item in answer_key],
    )
    return ToolsGenerateExercisesResponse(
        title=generated["title"],
        instructions=generated["instructions"],
        exercises=exercises,
        answer_key=answer_key,
        pdf_html=pdf_html,
        free_limit=FREE_GENERATION_LIMIT,
        free_used=free_used,
        remaining_free_generations=remaining_free,
        paywall_required=False,
        upgrade_url=UPGRADE_URL,
        llm_mode=llm_mode,
        paid_credits_remaining=paid_credits_remaining,
    )


@router.post("/billing/checkout-session", response_model=ToolsCheckoutSessionResponse)
async def create_tools_checkout_session(
    payload: ToolsCheckoutSessionRequest,
    request: Request,
) -> ToolsCheckoutSessionResponse:
    scope_key = _generation_scope_key(request, payload.session_token)
    billing = ToolsBillingService()
    try:
        checkout = billing.create_checkout_session(
            plan_code=payload.plan_code,
            session_scope_key=scope_key,
            customer_email=payload.customer_email,
        )
    except BillingConfigError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except BillingGatewayError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    return ToolsCheckoutSessionResponse(
        checkout_url=checkout.url,
        checkout_session_id=checkout.id,
    )


@router.post("/billing/stripe-webhook")
async def handle_tools_stripe_webhook(
    request: Request,
    service: Annotated[ToolsService, Depends(get_tools_service)],
    stripe_signature: Annotated[str | None, Header(alias="Stripe-Signature")] = None,
) -> dict[str, bool]:
    raw_payload = await request.body()
    billing = ToolsBillingService()
    if not billing.webhook_secret:
        logger.error("tools.webhook: STRIPE_WEBHOOK_SECRET not configured — rejecting event")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Webhook endpoint not configured",
        )
    if not billing.verify_webhook_signature(payload=raw_payload, signature_header=stripe_signature):
        logger.warning("tools.webhook: invalid signature — possible replay or misconfiguration")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid webhook signature",
        )
    try:
        parsed = json.loads(raw_payload.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid webhook payload",
        ) from exc
    if not isinstance(parsed, dict):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid webhook payload",
        )

    grant = billing.parse_checkout_completed_event(parsed)
    if grant is None:
        logger.info("tools.webhook: event type=%s — no action taken", parsed.get("type", "unknown"))
        return {"ok": True}
    scope_key, credits = grant
    total = await service.grant_paid_generation_credits(key_id=scope_key, credits=credits)
    logger.info("tools.webhook: granted %d credits to scope=%s (total=%d)", credits, scope_key, total)
    return {"ok": True}


@router.get("/billing/status", response_model=ToolsBillingStatusResponse)
async def get_tools_billing_status(
    request: Request,
    service: Annotated[ToolsService, Depends(get_tools_service)],
    session_token: str | None = None,
) -> ToolsBillingStatusResponse:
    scope_key = _generation_scope_key(request, session_token)
    free_used = await service.get_free_generation_usage(key_id=scope_key)
    paid_credits = await service.get_paid_generation_credits(key_id=scope_key)
    remaining_free = max(0, FREE_GENERATION_LIMIT - free_used)
    return ToolsBillingStatusResponse(
        free_limit=FREE_GENERATION_LIMIT,
        free_used=free_used,
        remaining_free_generations=remaining_free,
        paid_credits_remaining=paid_credits,
    )

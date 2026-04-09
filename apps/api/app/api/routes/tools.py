from __future__ import annotations

import hashlib
import json
import logging
from typing import Annotated

logger = logging.getLogger(__name__)

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from redis.asyncio import Redis
from sqlalchemy import select

from app.api.deps import DBSession, get_current_tenant, get_current_user
from app.core.security import decode_token
from app.models import AnonymousUsage, Tenant, ToolsCheckoutSession, User, UserCredits
from app.schemas.tools import (
    AnonIdentifyRequest,
    AnonIdentifyResponse,
    AnonIdentityOut,
    AnonUsageStatusResponse,
    ToolsAnonStatusResponse,
    ToolsAnonUseRequest,
    ToolsCheckoutCreateRequest,
    ToolsCheckoutCreateResponse,
    ToolsCheckoutStatusResponse,
    ToolsGenerateRequest,
    ToolsGenerateResponse,
    ToolsBillingStatusResponse,
    ToolsCatalogItemOut,
    ToolsCatalogResponse,
    ToolsCheckoutSessionRequest,
    ToolsCheckoutSessionResponse,
    ToolsCreditsResponse,
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
from app.services.anon_tools_service import (
    EXERCISE_TOOL_SLUG,
    FREE_GENERATION_LIMIT as ANON_FREE_LIMIT,
    AnonToolsService,
    compute_usage_state,
    paywall_required,
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
_ANON_RATE_LIMIT = 20          # gerações por hora por anonymous_id
_ANON_RATE_WINDOW = 3600       # janela em segundos (1 hora)
TEMP_UNLIMITED_GENERATION_CREDITS = 9_999_999
TEMP_UNLIMITED_GENERATION_MODE = True


def _temp_unlimited_auth_credits() -> ToolsCreditsResponse:
    return ToolsCreditsResponse(credits=TEMP_UNLIMITED_GENERATION_CREDITS)


def _temp_unlimited_anon_tools_status(*, anonymous_id: str) -> ToolsAnonStatusResponse:
    return ToolsAnonStatusResponse(
        anonymous_id=anonymous_id,
        free_limit=TEMP_UNLIMITED_GENERATION_CREDITS,
        free_used=0,
        remaining_free_generations=TEMP_UNLIMITED_GENERATION_CREDITS,
        paid_credits_remaining=0,
    )


def _temp_unlimited_anon_identity(*, anonymous_id: str) -> AnonIdentityOut:
    return AnonIdentityOut(
        anonymous_id=anonymous_id,
        free_generations_used=0,
        free_generations_remaining=TEMP_UNLIMITED_GENERATION_CREDITS,
        paid_generations_available=0,
        can_generate=True,
    )


def _temp_unlimited_anon_usage_status() -> AnonUsageStatusResponse:
    return AnonUsageStatusResponse(
        free_generations_used=0,
        free_generations_remaining=TEMP_UNLIMITED_GENERATION_CREDITS,
        paid_generations_available=0,
        can_generate=True,
        paywall_required=False,
    )


async def _check_anon_id_rate_limit(redis: Redis | None, anon_id: str) -> bool:
    """Rate limit por anonymous_id: max 20 gerações/hora.

    Complementa o rate limit por IP — mantém a barreira mesmo quando o IP
    muda (VPN rotativa, mobile entre redes).
    Retorna True se permitido, False se bloqueado.
    Falha silenciosa: sem Redis → permite (API não fica indisponível).
    """
    if TEMP_UNLIMITED_GENERATION_MODE:
        return True
    if redis is None or not anon_id:
        return True
    key = f"rate:anon_gen:{anon_id}"
    try:
        value = await redis.incr(key)
        if value == 1:
            await redis.expire(key, _ANON_RATE_WINDOW)
        return int(value) <= _ANON_RATE_LIMIT
    except Exception:
        return True


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


def _resolve_optional_user(request: Request, db: DBSession) -> User | None:
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        return None
    scheme, _, token = auth_header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    try:
        payload = decode_token(token)
    except Exception:
        return None
    if payload.get("type") != "access":
        return None
    sub = payload.get("sub")
    if not isinstance(sub, str) or not sub.isdigit():
        return None
    user = db.get(User, int(sub))
    return user


def _get_or_create_user_credits(db: DBSession, *, user_id: int) -> UserCredits:
    row = db.scalar(select(UserCredits).where(UserCredits.user_id == user_id))
    if row is not None:
        return row
    row = UserCredits(user_id=user_id, credits=0)
    db.add(row)
    db.flush()
    return row


def _consume_user_credit_or_raise(db: DBSession, *, user_id: int) -> int:
    if TEMP_UNLIMITED_GENERATION_MODE:
        return TEMP_UNLIMITED_GENERATION_CREDITS
    row = _get_or_create_user_credits(db, user_id=user_id)
    if int(row.credits) <= 0:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={"message": "Sem créditos disponíveis", "credits": 0},
        )
    row.credits = int(row.credits) - 1
    db.add(row)
    db.commit()
    return int(row.credits)


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


def _assert_checkout_status_access(
    *,
    session: ToolsCheckoutSession,
    request: Request,
    db: DBSession,
    anonymous_id: str | None,
) -> None:
    if session.user_id is not None:
        auth_user = _resolve_optional_user(request, db)
        if auth_user is None or int(auth_user.id) != int(session.user_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Checkout session not found")
        return
    if session.anon_id is not None:
        if anonymous_id != session.anon_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Checkout session not found")
        return
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Checkout session not found")


def _resolve_checkout_scope_and_credits(
    *,
    db: DBSession,
    stripe_session_id: str | None,
    parsed_event: dict[str, object],
) -> tuple[str, int, str | None]:
    recorded_session = db.get(ToolsCheckoutSession, stripe_session_id) if stripe_session_id else None
    if recorded_session is not None:
        pack = PRICING_PACKS.get(recorded_session.plan_code)
        if pack is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unknown checkout plan")
        scope_key = (
            f"user:{recorded_session.user_id}"
            if recorded_session.user_id is not None
            else f"anon:{recorded_session.anon_id}"
            if recorded_session.anon_id is not None
            else None
        )
        if not scope_key:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Checkout session owner is missing")
        return scope_key, int(pack.credits), recorded_session.plan_code

    billing = ToolsBillingService()
    legacy_grant = billing.parse_checkout_completed_event(parsed_event)
    if legacy_grant is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing checkout reconciliation data")
    scope_key, credits = legacy_grant
    return scope_key, int(credits), None


def _validate_checkout_payment_details(
    *,
    plan_code: str | None,
    parsed_event: dict[str, object],
) -> None:
    if parsed_event.get("type") != "checkout.session.completed":
        return
    data = parsed_event.get("data")
    if not isinstance(data, dict):
        return
    obj = data.get("object")
    if not isinstance(obj, dict):
        return

    payment_status = str(obj.get("payment_status") or "").strip().lower()
    if payment_status and payment_status != "paid":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Checkout payment is not finalized")

    if not plan_code:
        return
    pack = PRICING_PACKS.get(plan_code)
    if pack is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unknown checkout plan")

    amount_total = obj.get("amount_total")
    if isinstance(amount_total, (int, float)) and int(amount_total) != int(pack.price_cents):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Checkout amount does not match server pricing")

    currency = obj.get("currency")
    if isinstance(currency, str) and currency.strip().upper() != pack.currency.upper():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Checkout currency does not match server pricing")


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
    db: DBSession,
) -> ToolsGenerateExercisesResponse:
    auth_user = _resolve_optional_user(request, db)
    if auth_user is not None:
        paid_credits_remaining = _consume_user_credit_or_raise(db, user_id=auth_user.id)
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
            free_limit=0,
            free_used=0,
            remaining_free_generations=0,
            paywall_required=False,
            upgrade_url=UPGRADE_URL,
            llm_mode=llm_mode,
            paid_credits_remaining=paid_credits_remaining,
        )

    # ── Rastreamento anônimo: DB (anonymous_id) ou Redis (session_token/IP) ──
    if TEMP_UNLIMITED_GENERATION_MODE:
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
            free_limit=TEMP_UNLIMITED_GENERATION_CREDITS,
            free_used=0,
            remaining_free_generations=TEMP_UNLIMITED_GENERATION_CREDITS,
            paywall_required=False,
            upgrade_url=UPGRADE_URL,
            llm_mode=llm_mode,
            paid_credits_remaining=0,
        )

    if payload.anonymous_id:
        # Caminho principal — identidade persistente no PostgreSQL
        anon_svc = AnonToolsService()
        ip = request.client.host if request.client else None
        anon_svc.get_or_create_identity(db, anonymous_id=payload.anonymous_id, ip=ip)
        state_before = anon_svc.get_usage_state(db, anon_id=payload.anonymous_id)
        if not state_before.can_generate:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail=_build_paywall_detail(
                    free_used=state_before.free_used,
                    remaining_free=0,
                    paid_credits_remaining=0,
                ),
            )
        try:
            state = anon_svc.consume_generation(db, anon_id=payload.anonymous_id)
        except ValueError:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail=_build_paywall_detail(
                    free_used=state_before.free_used,
                    remaining_free=0,
                    paid_credits_remaining=0,
                ),
            )
        free_used = state.free_used
        remaining_free = state.remaining_free
        paid_credits_remaining = state.paid_credits
    else:
        # Caminho legado — Redis via session_token ou IP (backward compat)
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

    # Commit da geração anônima DB somente após geração bem-sucedida
    if payload.anonymous_id:
        db.commit()

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
    db: DBSession,
) -> ToolsCheckoutSessionResponse:
    # anonymous_id tem prioridade — gera scope persistente no DB
    if payload.anonymous_id:
        scope_key = f"anon:{payload.anonymous_id}"
    else:
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
    # Persiste a sessão para rastreamento — não bloqueia se falhar
    try:
        anon_svc = AnonToolsService()
        anon_svc.record_checkout_session(
            db,
            stripe_session_id=checkout.id,
            anon_id=payload.anonymous_id,
            user_id=None,
            plan_code=payload.plan_code,
        )
        db.commit()
    except Exception:
        logger.warning("checkout-session: falha ao salvar tools_checkout_session", exc_info=True)
    return ToolsCheckoutSessionResponse(
        checkout_url=checkout.url,
        checkout_session_id=checkout.id,
    )


# ── Checkout canônico v2 ──────────────────────────────────────────────────────

# Mapeamento package_type → plan_code (único ponto de verdade)
_PACKAGE_TYPE_MAP: dict[str, str] = {"pack_30": "credits_30"}


@router.post("/checkout/create", response_model=ToolsCheckoutCreateResponse)
async def create_tools_checkout_v2(
    payload: ToolsCheckoutCreateRequest,
    request: Request,
    db: DBSession,
) -> ToolsCheckoutCreateResponse:
    """Endpoint canônico de checkout para identidades anônimas.

    - Aceita anonymous_id + fingerprint_id + package_type
    - Garante que a identidade existe antes de criar a sessão Stripe
    - Inclui anonymous_id diretamente em metadata (além de session_scope_key
      para compat com o webhook legado)
    - Persiste a sessão com status 'created'
    """
    plan_code = _PACKAGE_TYPE_MAP.get(payload.package_type)
    if not plan_code:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unknown package_type: {payload.package_type}",
        )

    pack = PRICING_PACKS.get(plan_code)
    if pack is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unknown plan")

    # Garante que a identidade existe e atualiza metadados de visita
    anon_svc = AnonToolsService()
    ip = request.client.host if request.client else None
    anon_svc.get_or_create_identity(
        db,
        anonymous_id=payload.anonymous_id,
        ip=ip,
        fingerprint=payload.fingerprint_id,
    )

    billing = ToolsBillingService()
    try:
        checkout = billing.create_checkout_session(
            plan_code=plan_code,
            session_scope_key=f"anon:{payload.anonymous_id}",  # compat com webhook legado
            customer_email=None,
            extra_metadata={
                "anonymous_id": payload.anonymous_id,
                "fingerprint_id": payload.fingerprint_id or "",
                "package_type": payload.package_type,
                "credits_to_add": str(pack.credits),
            },
        )
    except BillingConfigError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except BillingGatewayError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    # Persiste sessão — não bloqueia se falhar
    try:
        anon_svc.record_checkout_session(
            db,
            stripe_session_id=checkout.id,
            anon_id=payload.anonymous_id,
            user_id=None,
            plan_code=plan_code,
            status="created",
        )
        db.commit()
    except Exception:
        logger.warning("checkout/create: falha ao salvar session stripe_id=%s", checkout.id, exc_info=True)

    logger.info(
        "checkout/create: session=%s anon_id=%s package=%s",
        checkout.id, payload.anonymous_id, payload.package_type,
    )
    return ToolsCheckoutCreateResponse(
        checkout_url=checkout.url,
        checkout_session_id=checkout.id,
    )


@router.get("/checkout/status", response_model=ToolsCheckoutStatusResponse)
async def get_checkout_status(
    session_id: str,
    request: Request,
    db: DBSession,
    anonymous_id: str | None = None,
) -> ToolsCheckoutStatusResponse:
    """Consulta o status de uma Checkout Session após retorno do Stripe.

    Usado pelo frontend no retorno da URL de sucesso para verificar se o
    pagamento foi confirmado e quantos créditos estão disponíveis.
    """
    session = db.get(ToolsCheckoutSession, session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Checkout session not found")
    _assert_checkout_status_access(session=session, request=request, db=db, anonymous_id=anonymous_id)

    pack = PRICING_PACKS.get(session.plan_code)
    credits_for_plan = pack.credits if pack else 0

    # Saldo atual da identidade anônima
    paid_available = 0
    if session.anon_id:
        usage = db.scalar(
            select(AnonymousUsage).where(
                AnonymousUsage.anon_id == session.anon_id,
                AnonymousUsage.tool_slug == EXERCISE_TOOL_SLUG,
            )
        )
        if usage:
            paid_available = int(usage.paid_credits)

    # Normaliza status: 'paid' e 'completed' são equivalentes
    is_paid = session.status in ("paid", "completed")
    return ToolsCheckoutStatusResponse(
        ok=True,
        payment_status="paid" if is_paid else session.status,
        credits_added=credits_for_plan if is_paid else 0,
        paid_generations_available=paid_available,
    )


@router.get("/credits", response_model=ToolsCreditsResponse)
async def get_tools_credits(
    db: DBSession,
    user: Annotated[User, Depends(get_current_user)],
) -> ToolsCreditsResponse:
    if TEMP_UNLIMITED_GENERATION_MODE:
        return _temp_unlimited_auth_credits()
    row = _get_or_create_user_credits(db, user_id=user.id)
    db.commit()
    return ToolsCreditsResponse(credits=int(row.credits))


@router.post("/use-credit", response_model=ToolsCreditsResponse)
async def use_tools_credit(
    db: DBSession,
    user: Annotated[User, Depends(get_current_user)],
) -> ToolsCreditsResponse:
    if TEMP_UNLIMITED_GENERATION_MODE:
        return _temp_unlimited_auth_credits()
    remaining = _consume_user_credit_or_raise(db, user_id=user.id)
    return ToolsCreditsResponse(credits=remaining)


@router.post("/checkout", response_model=ToolsCheckoutSessionResponse)
async def create_tools_checkout(
    payload: ToolsCheckoutSessionRequest,
    db: DBSession,
    user: Annotated[User, Depends(get_current_user)],
) -> ToolsCheckoutSessionResponse:
    billing = ToolsBillingService()
    try:
        checkout = billing.create_checkout_session(
            plan_code=payload.plan_code,
            session_scope_key=f"user:{user.id}",
            customer_email=payload.customer_email or user.email,
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
    try:
        anon_svc = AnonToolsService()
        anon_svc.record_checkout_session(
            db,
            stripe_session_id=checkout.id,
            anon_id=None,
            user_id=user.id,
            plan_code=payload.plan_code,
            status="created",
        )
        db.commit()
    except Exception:
        logger.warning("checkout: failed to persist authenticated checkout session", exc_info=True)
    return ToolsCheckoutSessionResponse(
        checkout_url=checkout.url,
        checkout_session_id=checkout.id,
    )


@router.post("/billing/stripe-webhook")
async def handle_tools_stripe_webhook(
    request: Request,
    service: Annotated[ToolsService, Depends(get_tools_service)],
    db: DBSession,
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

    if parsed.get("type") != "checkout.session.completed":
        logger.info("tools.webhook: event type=%s - no action taken", parsed.get("type", "unknown"))
        return {"ok": True}
    stripe_session_id = parsed.get("data", {}).get("object", {}).get("id")
    if stripe_session_id is not None and not isinstance(stripe_session_id, str):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid checkout session id",
        )
    scope_key, credits, plan_code = _resolve_checkout_scope_and_credits(
        db=db,
        stripe_session_id=stripe_session_id,
        parsed_event=parsed,
    )
    _validate_checkout_payment_details(plan_code=plan_code, parsed_event=parsed)

    # ── Usuário autenticado ───────────────────────────────────────────────────
    if scope_key.startswith("user:"):
        _, _, user_id_token = scope_key.partition(":")
        if user_id_token.isdigit():
            row = _get_or_create_user_credits(db, user_id=int(user_id_token))
            row.credits = int(row.credits) + int(credits)
            db.add(row)
            db.commit()
            logger.info("tools.webhook: granted %d credits to user_id=%s (total=%d)", credits, user_id_token, int(row.credits))
        return {"ok": True}

    # ── Identidade anônima persistente (DB) ──────────────────────────────────
    if scope_key.startswith("anon:"):
        _, _, anon_id = scope_key.partition(":")
        stripe_session_id = parsed.get("data", {}).get("object", {}).get("id")
        anon_svc = AnonToolsService()

        # Idempotência: evita duplo crédito em retries do webhook
        if stripe_session_id and anon_svc.is_checkout_already_processed(db, stripe_session_id=stripe_session_id):
            logger.info("tools.webhook: session %s already processed — skipping", stripe_session_id)
            return {"ok": True}

        anon_svc.get_or_create_identity(db, anonymous_id=anon_id, ip=None)
        total = anon_svc.grant_paid_credits(db, anon_id=anon_id, credits=credits, ref_id=stripe_session_id)
        if stripe_session_id:
            anon_svc.complete_checkout_session(db, stripe_session_id=stripe_session_id)
        db.commit()
        logger.info("tools.webhook: granted %d credits to anon_id=%s (total=%d)", credits, anon_id, total)
        return {"ok": True}

    # ── Legado: Redis (session_token ou IP) ──────────────────────────────────
    total = await service.grant_paid_generation_credits(key_id=scope_key, credits=credits)
    logger.info("tools.webhook: granted %d credits to scope=%s (total=%d) [redis]", credits, scope_key, total)
    return {"ok": True}


@router.get("/billing/status", response_model=ToolsBillingStatusResponse)
async def get_tools_billing_status(
    request: Request,
    service: Annotated[ToolsService, Depends(get_tools_service)],
    session_token: str | None = None,
) -> ToolsBillingStatusResponse:
    if TEMP_UNLIMITED_GENERATION_MODE:
        return ToolsBillingStatusResponse(
            free_limit=TEMP_UNLIMITED_GENERATION_CREDITS,
            free_used=0,
            remaining_free_generations=TEMP_UNLIMITED_GENERATION_CREDITS,
            paid_credits_remaining=0,
        )
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


@router.post("/anon-use", response_model=ToolsAnonStatusResponse)
async def anon_use_generation(
    payload: ToolsAnonUseRequest,
    request: Request,
    db: DBSession,
) -> ToolsAnonStatusResponse:
    """Consome 1 geração do saldo anônimo (gratuita ou paga).

    Deve ser chamado APÓS a geração local bem-sucedida no frontend.
    Retorna 402 se não houver saldo disponível (paywall).
    """
    if TEMP_UNLIMITED_GENERATION_MODE:
        return _temp_unlimited_anon_tools_status(anonymous_id=payload.anonymous_id)

    # Rate limit por anonymous_id — complementa o rate limit por IP do middleware
    redis = getattr(request.app.state, "redis", None)
    if not await _check_anon_id_rate_limit(redis, payload.anonymous_id):
        logger.warning(
            "tools.anon-use: anon-rate-blocked anon_id=%s ip=%s",
            payload.anonymous_id, request.client.host if request.client else None,
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"code": "RATE_LIMIT", "message": "Too many requests. Try again later."},
        )

    anon_svc = AnonToolsService()
    ip = request.client.host if request.client else None
    user_agent = request.headers.get("User-Agent")
    identity_row = anon_svc.get_or_create_identity(
        db, anonymous_id=payload.anonymous_id, ip=ip, user_agent=user_agent
    )

    # get_usage_state aplica cross-check por fingerprint internamente
    state_before = anon_svc.get_usage_state(
        db,
        anon_id=payload.anonymous_id,
        fingerprint=identity_row.fingerprint,
        tool_slug=payload.tool_slug,
    )

    # Fallback: IP + UserAgent — cobre transição de fingerprint e casos em que o
    # fingerprint ainda não foi gravado. IP+UA são idênticos entre incognito e janela
    # normal no mesmo computador, independentemente de localStorage ou cookies.
    if state_before.can_generate and identity_row.ip and identity_row.user_agent:
        ip_ua_total = anon_svc.get_ip_ua_free_total(
            db,
            ip=identity_row.ip,
            user_agent=identity_row.user_agent,
            tool_slug=payload.tool_slug,
        )
        if ip_ua_total >= ANON_FREE_LIMIT:
            logger.warning(
                "tools.anon-use: ip-ua-blocked anon_id=%s ip=%s ua_hash=%s total=%d",
                payload.anonymous_id, ip, hash(identity_row.user_agent), ip_ua_total,
            )
            state_before = compute_usage_state(ANON_FREE_LIMIT, state_before.paid_credits)

    try:
        state = anon_svc.consume_generation(db, anon_id=payload.anonymous_id, tool_slug=payload.tool_slug)
    except ValueError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=_build_paywall_blocked(state_before.free_used, state_before.paid_credits),
        )
    db.commit()
    return ToolsAnonStatusResponse(
        anonymous_id=payload.anonymous_id,
        free_limit=ANON_FREE_LIMIT,
        free_used=state.free_used,
        remaining_free_generations=state.remaining_free,
        paid_credits_remaining=state.paid_credits,
    )


@router.get("/anon-status", response_model=ToolsAnonStatusResponse)
async def get_anon_tools_status(
    request: Request,
    db: DBSession,
    anonymous_id: str,
) -> ToolsAnonStatusResponse:
    """Retorna o estado de uso de um visitante anônimo via anonymous_id.

    Cria a identidade se ainda não existir (primeira visita).
    """
    if TEMP_UNLIMITED_GENERATION_MODE:
        return _temp_unlimited_anon_tools_status(anonymous_id=anonymous_id)

    anon_svc = AnonToolsService()
    ip = request.client.host if request.client else None
    anon_svc.get_or_create_identity(db, anonymous_id=anonymous_id, ip=ip)
    state = anon_svc.get_usage_state(db, anon_id=anonymous_id)
    db.commit()
    return ToolsAnonStatusResponse(
        anonymous_id=anonymous_id,
        free_limit=ANON_FREE_LIMIT,
        free_used=state.free_used,
        remaining_free_generations=state.remaining_free,
        paid_credits_remaining=state.paid_credits,
    )


# ── Endpoints de identidade anônima (spec v2) ─────────────────────────────────
# Esses endpoints são o contrato público consumido pelo frontend.
# Os endpoints /anon-status e /anon-use acima são internos/legados.


def _build_identity_out(anonymous_id: str, state_free_used: int, state_paid: int) -> AnonIdentityOut:
    """Constrói AnonIdentityOut a partir de contadores brutos — evita recalcular."""
    state = compute_usage_state(state_free_used, state_paid)
    return AnonIdentityOut(
        anonymous_id=anonymous_id,
        free_generations_used=state.free_used,
        free_generations_remaining=state.remaining_free,
        paid_generations_available=state.paid_credits,
        can_generate=state.can_generate,
    )


@router.post("/anonymous/identify", response_model=AnonIdentifyResponse)
async def anonymous_identify(
    payload: AnonIdentifyRequest,
    request: Request,
    db: DBSession,
) -> AnonIdentifyResponse:
    """Registra ou atualiza uma identidade anônima e retorna o status consolidado.

    Deve ser chamado na montagem do componente gerador, antes de qualquer
    interação. Garante que a identidade e a usage row existam — idempotente.

    Tratamento de conflito: se dois requests chegam simultaneamente com o
    mesmo anonymous_id (duas abas), o segundo INSERT sofre IntegrityError
    que é absorvido pelo service → retorna a identidade existente sem erro.
    """
    if TEMP_UNLIMITED_GENERATION_MODE:
        return AnonIdentifyResponse(
            ok=True,
            identity=_temp_unlimited_anon_identity(anonymous_id=payload.anonymous_id),
        )

    ip = request.client.host if request.client else None
    user_agent = payload.user_agent or request.headers.get("User-Agent")

    anon_svc = AnonToolsService()
    identity_row = anon_svc.get_or_create_identity(
        db,
        anonymous_id=payload.anonymous_id,
        ip=ip,
        fingerprint=payload.fingerprint_id,
        user_agent=user_agent,
    )
    # Garante a usage row — cria se ainda não existe.
    # Fingerprint cross-check integrado ao get_usage_state.
    state = anon_svc.get_usage_state(
        db,
        anon_id=payload.anonymous_id,
        fingerprint=payload.fingerprint_id,
    )
    # Fallback IP+UA: funciona mesmo antes do fingerprint ser atualizado no banco
    if state.can_generate and identity_row.ip and identity_row.user_agent:
        ip_ua_total = anon_svc.get_ip_ua_free_total(
            db, ip=identity_row.ip, user_agent=identity_row.user_agent
        )
        if ip_ua_total >= ANON_FREE_LIMIT:
            state = compute_usage_state(ANON_FREE_LIMIT, state.paid_credits)
    db.commit()

    return AnonIdentifyResponse(
        ok=True,
        identity=_build_identity_out(payload.anonymous_id, state.free_used, state.paid_credits),
    )


@router.get("/usage-status", response_model=AnonUsageStatusResponse)
async def get_usage_status(
    request: Request,
    db: DBSession,
    anonymous_id: str,
    fingerprint_id: str | None = None,
) -> AnonUsageStatusResponse:
    """Consulta o status atual de uso de uma identidade anônima.

    Atualiza last_seen_at e IP na passagem. Aceita fingerprint_id como
    dado auxiliar — útil para enriquecer o registro na primeira consulta.

    Retorna paywall_required=True quando free_used >= 3 e paid_credits == 0.
    """
    if TEMP_UNLIMITED_GENERATION_MODE:
        return _temp_unlimited_anon_usage_status()

    ip = request.client.host if request.client else None

    anon_svc = AnonToolsService()
    # Atualiza IP e fingerprint se disponíveis (sem sobrescrever dados existentes)
    anon_svc.get_or_create_identity(
        db,
        anonymous_id=anonymous_id,
        ip=ip,
        fingerprint=fingerprint_id,
    )
    state = anon_svc.get_usage_state(db, anon_id=anonymous_id, fingerprint=fingerprint_id)
    db.commit()

    return AnonUsageStatusResponse(
        free_generations_used=state.free_used,
        free_generations_remaining=state.remaining_free,
        paid_generations_available=state.paid_credits,
        can_generate=state.can_generate,
        paywall_required=paywall_required(state),
    )


# ── Endpoint canônico de geração ──────────────────────────────────────────────


def _make_request_hash(anonymous_id: str | None, subject: str, topic: str, age: int, difficulty: str) -> str:
    """Hash SHA-256 truncado dos parâmetros de geração.

    16 chars hex (~64 bits) — suficiente para rastreio e detecção de duplicatas
    no analytics sem custo de armazenamento relevante.
    """
    raw = f"{anonymous_id or 'anon'}:{subject}:{topic}:{age}:{difficulty}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def _build_paywall_blocked(free_used: int, paid: int) -> dict:
    """Payload de 402 no shape canônico da spec."""
    return {
        "ok": False,
        "code": "PAYWALL_REQUIRED",
        "message": "Você já usou suas 3 gerações grátis. Compre um pacote para continuar.",
        "free_generations_remaining": max(0, FREE_GENERATION_LIMIT - free_used),
        "paid_generations_available": paid,
    }


def _run_generation(payload: ToolsGenerateRequest) -> tuple[dict, str]:
    """Executa a geração pedagógica — isolada para reutilização entre paths."""
    generator = ToolsExerciseGeneratorService()
    return generator.generate(
        ExerciseGenerationInput(
            subject=payload.subject,
            topic=payload.topic,
            age=payload.age,
            difficulty=payload.difficulty,
            exercise_count=payload.exercise_count,
        )
    )


def _build_preview_data(generated: dict) -> dict:
    """Serializa o resultado da geração no shape de preview_data."""
    raw = generated["exercises"]
    exercises = [
        {"number": int(e["number"]), "prompt": str(e["prompt"]), "answer": str(e["answer"])}
        for e in raw
    ]
    pdf_html = build_axiora_pdf_html(
        title=generated["title"],
        instructions=generated["instructions"],
        exercises=exercises,
        answer_key=exercises,
    )
    return {
        "title": generated["title"],
        "instructions": generated["instructions"],
        "exercises": exercises,
        "answer_key": exercises,
        "pdf_html": pdf_html,
    }


@router.post("/generate", response_model=ToolsGenerateResponse)
async def generate(
    payload: ToolsGenerateRequest,
    request: Request,
    service: Annotated[ToolsService, Depends(get_tools_service)],
    db: DBSession,
) -> ToolsGenerateResponse:
    """Endpoint canônico de geração com autorização e consumo de crédito integrados.

    Fluxo de autorização (em ordem de prioridade):
      1. Usuário autenticado (Bearer token) — consome UserCredits.credits
      2. Identidade anônima DB (anonymous_id) — consome free/paid via AnonToolsService
      3. Legado Redis (session_token / IP) — backward compat

    O consumo é reservado ANTES da geração e comitado APÓS sucesso. Se o LLM
    falhar, o crédito é devolvido via rollback — sem cobrar geração que não ocorreu.
    """
    req_hash = _make_request_hash(
        payload.anonymous_id, payload.subject, payload.topic, payload.age, payload.difficulty
    )
    ip = request.client.host if request.client else None
    user_agent = request.headers.get("User-Agent")

    if TEMP_UNLIMITED_GENERATION_MODE:
        generated, llm_mode = _run_generation(payload)
        preview = _build_preview_data(generated)
        preview["llm_mode"] = llm_mode

        if _resolve_optional_user(request, db) is not None:
            return ToolsGenerateResponse(
                consumption_type="auth",
                free_generations_remaining=0,
                paid_generations_available=TEMP_UNLIMITED_GENERATION_CREDITS,
                preview_data=preview,
            )

        return ToolsGenerateResponse(
            consumption_type="free",
            free_generations_remaining=TEMP_UNLIMITED_GENERATION_CREDITS,
            paid_generations_available=0,
            preview_data=preview,
        )

    # ── 1. Usuário autenticado ────────────────────────────────────────────────
    auth_user = _resolve_optional_user(request, db)
    if auth_user is not None:
        # Consome antes de gerar — garante que o crédito existe
        paid_remaining = _consume_user_credit_or_raise(db, user_id=auth_user.id)
        generated, llm_mode = _run_generation(payload)
        logger.info(
            "tools.generate: auth user_id=%s ip=%s hash=%s llm_mode=%s",
            auth_user.id, ip, req_hash, llm_mode,
        )
        preview = _build_preview_data(generated)
        preview["llm_mode"] = llm_mode
        return ToolsGenerateResponse(
            consumption_type="auth",
            free_generations_remaining=0,
            paid_generations_available=paid_remaining,
            preview_data=preview,
        )

    # ── 2. Identidade anônima DB ─────────────────────────────────────────────
    if payload.anonymous_id:
        # Rate limit por anonymous_id (complementa o rate limit por IP)
        redis = getattr(request.app.state, "redis", None)
        if not await _check_anon_id_rate_limit(redis, payload.anonymous_id):
            logger.warning(
                "tools.generate: anon-rate-blocked anon_id=%s ip=%s",
                payload.anonymous_id, ip,
            )
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={"code": "RATE_LIMIT", "message": "Too many requests. Try again later."},
            )

        anon_svc = AnonToolsService()
        identity_row = anon_svc.get_or_create_identity(
            db,
            anonymous_id=payload.anonymous_id,
            ip=ip,
            user_agent=user_agent,
        )
        # get_usage_state já aplica cross-check de fingerprint internamente
        state_before = anon_svc.get_usage_state(
            db,
            anon_id=payload.anonymous_id,
            fingerprint=identity_row.fingerprint,
        )

        if not state_before.can_generate:
            logger.warning(
                "tools.generate: blocked anon_id=%s ip=%s free_used=%d paid=%d hash=%s",
                payload.anonymous_id, ip, state_before.free_used, state_before.paid_credits, req_hash,
            )
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail=_build_paywall_blocked(state_before.free_used, state_before.paid_credits),
            )

        # Reserva o crédito — ainda não comitado
        try:
            state = anon_svc.consume_generation(
                db,
                anon_id=payload.anonymous_id,
                request_hash=req_hash,
            )
        except ValueError:
            # Race: outro request consumiu o último crédito entre o check e o consume
            db.rollback()
            logger.warning(
                "tools.generate: race-blocked anon_id=%s ip=%s hash=%s",
                payload.anonymous_id, ip, req_hash,
            )
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail=_build_paywall_blocked(state_before.free_used, state_before.paid_credits),
            )

        # Geração pedagógica — se falhar, o rollback devolve o crédito
        try:
            generated, llm_mode = _run_generation(payload)
        except Exception:
            db.rollback()
            raise

        db.commit()  # Confirma consumo apenas após geração bem-sucedida
        logger.info(
            "tools.generate: ok anon_id=%s ip=%s hash=%s type=%s free_left=%d paid_left=%d llm_mode=%s",
            payload.anonymous_id, ip, req_hash, state.generation_type,
            state.remaining_free, state.paid_credits, llm_mode,
        )
        preview = _build_preview_data(generated)
        preview["llm_mode"] = llm_mode
        return ToolsGenerateResponse(
            consumption_type=state.generation_type,
            free_generations_remaining=state.remaining_free,
            paid_generations_available=state.paid_credits,
            preview_data=preview,
        )

    # ── 3. Legado Redis (session_token / IP) ─────────────────────────────────
    scope_key = _generation_scope_key(request, payload.session_token)
    free_used_before = await service.get_free_generation_usage(key_id=scope_key)
    paid_before = await service.get_paid_generation_credits(key_id=scope_key)
    remaining_before = max(0, FREE_GENERATION_LIMIT - free_used_before)

    if remaining_before <= 0 and paid_before <= 0:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=_build_paywall_blocked(free_used_before, paid_before),
        )

    generated, llm_mode = _run_generation(payload)

    # Consome após geração (Redis não tem transação, mas é idempotente no fallback)
    if remaining_before > 0:
        free_used, remaining_free, _ = await service.increment_free_generation_usage(
            key_id=scope_key, free_limit=FREE_GENERATION_LIMIT
        )
        consumption_type, paid_remaining = "free", paid_before
    else:
        paid_remaining = await service.consume_paid_generation_credit(key_id=scope_key)
        remaining_free, consumption_type = 0, "paid"

    preview = _build_preview_data(generated)
    preview["llm_mode"] = llm_mode
    return ToolsGenerateResponse(
        consumption_type=consumption_type,
        free_generations_remaining=remaining_free,
        paid_generations_available=paid_remaining,
        preview_data=preview,
    )

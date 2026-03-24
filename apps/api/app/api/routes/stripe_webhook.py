"""Webhook Stripe canônico — POST /api/stripe/webhook

Responsabilidades:
  1. Validar assinatura HMAC-SHA256 do payload (Stripe-Signature header)
  2. Processar checkout.session.completed com idempotência garantida
  3. Conceder créditos à identidade anônima
  4. Persistir detalhes do pagamento (paid_at, amount, currency, payment_intent)

Separado de /api/tools/billing/stripe-webhook para:
  - Path limpo sem acoplamento ao prefixo /tools
  - Leitura direta de anonymous_id no metadata (sem parsear session_scope_key)
  - Manter compat retroativa com o webhook legado sem modificar seu comportamento
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, Request, status

from app.api.deps import DBSession
from app.services.anon_tools_service import AnonToolsService
from app.services.tools_billing_service import ToolsBillingService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/stripe", tags=["stripe-webhook"])


@router.post("/webhook")
async def handle_stripe_webhook(
    request: Request,
    db: DBSession,
    stripe_signature: Annotated[str | None, Header(alias="Stripe-Signature")] = None,
) -> dict[str, bool]:
    """Recebe e processa eventos do Stripe.

    Evento tratado: checkout.session.completed
    Outros eventos são recebidos e ignorados com 200 OK (Stripe exige resposta 2xx).
    """
    raw_payload = await request.body()
    billing = ToolsBillingService()

    # ── Segurança: rejeita se webhook não configurado ─────────────────────────
    if not billing.webhook_secret:
        logger.error("stripe.webhook: STRIPE_WEBHOOK_SECRET não configurado — rejeitando")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Webhook endpoint not configured",
        )

    # ── Valida assinatura HMAC ────────────────────────────────────────────────
    if not billing.verify_webhook_signature(payload=raw_payload, signature_header=stripe_signature):
        logger.warning("stripe.webhook: assinatura inválida — possível replay ou má configuração")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid webhook signature",
        )

    # ── Parse do payload ──────────────────────────────────────────────────────
    try:
        event = json.loads(raw_payload.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid webhook payload",
        ) from exc

    if not isinstance(event, dict):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid webhook payload")

    event_type = event.get("type", "unknown")
    logger.info("stripe.webhook: received event_type=%s", event_type)

    # ── Apenas checkout.session.completed é processado ───────────────────────
    grant = billing.parse_checkout_completed_event_v2(event)
    if grant is None:
        # Evento não reconhecido ou sem ação — retorna 200 para o Stripe não retentar
        return {"ok": True}

    anonymous_id, credits = grant
    if not anonymous_id:
        logger.warning("stripe.webhook: checkout.session.completed sem anonymous_id válido — ignorando")
        return {"ok": True}

    # ── Extrai stripe session id para reconciliação ───────────────────────────
    stripe_session_id: str | None = event.get("data", {}).get("object", {}).get("id")

    # ── Idempotência: sessão já processada não gera novo crédito ─────────────
    anon_svc = AnonToolsService()
    if stripe_session_id and anon_svc.is_checkout_already_processed(db, stripe_session_id=stripe_session_id):
        logger.info(
            "stripe.webhook: session %s já processada — ignorando retry", stripe_session_id
        )
        return {"ok": True}

    # ── Extrai detalhes do pagamento ──────────────────────────────────────────
    payment_info = billing.extract_payment_info(event)

    # ── Garante existência da identidade (pode não existir se localStorage foi limpo) ─
    ip = request.client.host if request.client else None
    anon_svc.get_or_create_identity(db, anonymous_id=anonymous_id, ip=ip)

    # ── Concede créditos e registra no ledger ─────────────────────────────────
    total = anon_svc.grant_paid_credits(
        db,
        anon_id=anonymous_id,
        credits=credits,
        ref_id=stripe_session_id,
    )

    # ── Marca sessão como paga com detalhes completos ────────────────────────
    if stripe_session_id:
        anon_svc.complete_checkout_session(
            db,
            stripe_session_id=stripe_session_id,
            paid_at=datetime.now(timezone.utc),
            amount_paid_cents=payment_info.amount_paid_cents,
            currency=payment_info.currency,
            payment_intent_id=payment_info.payment_intent_id,
        )

    db.commit()

    logger.info(
        "stripe.webhook: +%d créditos → anon_id=%s session=%s total=%d amount=%s %s pi=%s",
        credits, anonymous_id, stripe_session_id, total,
        payment_info.amount_paid_cents, payment_info.currency, payment_info.payment_intent_id,
    )
    return {"ok": True}

"""Anonymous Tools Service — controle de uso baseado em PostgreSQL.

Substitui o rastreamento Redis (scope_key session:/ip:) por identidades
persistentes. Cada visitante tem um anonymous_id (UUID v4) gerado pelo
frontend e armazenado no localStorage. Isso permite:
  - rastrear uso gratuito de forma durável (sem TTL)
  - vincular créditos pagos à identidade mesmo após recarregar a página
  - fazer reconciliação de pagamentos via credit_ledger
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import (
    AnonymousIdentity,
    AnonymousUsage,
    CreditLedger,
    GenerationEvent,
    ToolsCheckoutSession,
)

logger = logging.getLogger(__name__)

EXERCISE_TOOL_SLUG = "exercise-generator"
FREE_GENERATION_LIMIT = 3


# ── Estado de uso ─────────────────────────────────────────────────────────────

@dataclass
class AnonUsageState:
    free_used: int
    paid_credits: int
    remaining_free: int
    can_generate: bool
    generation_type: str  # 'free' | 'paid' | 'blocked'


def compute_usage_state(free_used: int, paid_credits: int) -> AnonUsageState:
    """Helper puro — calcula estado a partir de contadores brutos.

    Centraliza a lógica de remaining/can_generate para evitar divergência
    entre service e rotas.
    """
    remaining = max(0, FREE_GENERATION_LIMIT - free_used)
    if remaining > 0:
        can_gen, gen_type = True, "free"
    elif paid_credits > 0:
        can_gen, gen_type = True, "paid"
    else:
        can_gen, gen_type = False, "blocked"
    return AnonUsageState(
        free_used=free_used,
        paid_credits=paid_credits,
        remaining_free=remaining,
        can_generate=can_gen,
        generation_type=gen_type,
    )


def paywall_required(state: AnonUsageState) -> bool:
    """True quando o usuário precisa comprar créditos para continuar."""
    return not state.can_generate


# ── Service ──────────────────────────────────────────────────────────────────

class AnonToolsService:
    """Casos de uso do sistema de identidade anônima para Axiora Tools."""

    # ── Identidade ────────────────────────────────────────────────────────────

    def get_or_create_identity(
        self,
        db: Session,
        *,
        anonymous_id: str,
        ip: str | None = None,
        fingerprint: str | None = None,
        user_agent: str | None = None,
        ab_variants: dict | None = None,
    ) -> AnonymousIdentity:
        """Retorna a identidade existente ou cria uma nova.

        Robustez contra race condition: se dois requests chegam ao mesmo tempo
        com o mesmo anonymous_id (ex: duas abas abrindo), o segundo INSERT vai
        falhar com IntegrityError (PK duplicada). Nesse caso, fazemos rollback
        do savepoint e retornamos o registro já existente — sem duplicar.
        """
        identity = db.get(AnonymousIdentity, anonymous_id)
        if identity is None:
            identity = AnonymousIdentity(
                id=anonymous_id,
                ip=ip,
                fingerprint=fingerprint,
                user_agent=user_agent,
                ab_variants=ab_variants or {},
            )
            try:
                db.add(identity)
                db.flush()
            except IntegrityError:
                # Race: outra requisição criou o registro entre o GET e o INSERT
                db.rollback()
                identity = db.get(AnonymousIdentity, anonymous_id)
                if identity is None:
                    # Não deveria chegar aqui, mas evita NoneType error
                    raise
        else:
            # Atualiza metadados na visita recorrente
            identity.last_seen_at = datetime.now(timezone.utc)
            if ip:
                identity.ip = ip  # IP pode mudar (mobile/VPN) — sempre atualiza
            if fingerprint:
                identity.fingerprint = fingerprint  # Sempre atualiza — garante hash atual
            if user_agent and not identity.user_agent:
                identity.user_agent = user_agent  # Idem
            if ab_variants:
                # Merge sem sobrescrever variantes já atribuídas
                identity.ab_variants = {**ab_variants, **identity.ab_variants}
        return identity  # type: ignore[return-value]

    def get_ip_ua_free_total(
        self,
        db: Session,
        *,
        ip: str,
        user_agent: str,
        tool_slug: str = EXERCISE_TOOL_SLUG,
    ) -> int:
        """Soma gerações gratuitas usadas por todas as identidades com mesmo IP+UserAgent.

        Fallback quando o fingerprint ainda não está gravado ou difere entre sessões
        durante transição de algoritmo. IP+UA são idênticos entre incognito e janela
        normal no mesmo computador/rede.
        Retorna 0 se ip ou user_agent forem vazios (degradação graciosa).
        """
        if not ip or not user_agent:
            return 0
        result = db.execute(
            select(func.coalesce(func.sum(AnonymousUsage.free_used), 0))
            .join(AnonymousIdentity, AnonymousIdentity.id == AnonymousUsage.anon_id)
            .where(
                AnonymousIdentity.ip == ip,
                AnonymousIdentity.user_agent == user_agent,
                AnonymousUsage.tool_slug == tool_slug,
            )
        )
        return int(result.scalar() or 0)

    def get_fingerprint_free_total(
        self,
        db: Session,
        *,
        fingerprint: str,
        tool_slug: str = EXERCISE_TOOL_SLUG,
    ) -> int:
        """Soma total de gerações gratuitas usadas por todas as identidades
        com o mesmo fingerprint.

        Usado para detectar quando um usuário recriou o anonymous_id (limpou
        localStorage) mas mantém o mesmo dispositivo/browser.
        Retorna 0 se fingerprint for vazio (degradação graciosa).
        A query requer o índice ix_anon_identities_fingerprint para ser eficiente.
        """
        if not fingerprint:
            return 0
        result = db.execute(
            select(func.coalesce(func.sum(AnonymousUsage.free_used), 0))
            .join(AnonymousIdentity, AnonymousIdentity.id == AnonymousUsage.anon_id)
            .where(
                AnonymousIdentity.fingerprint == fingerprint,
                AnonymousUsage.tool_slug == tool_slug,
            )
        )
        return int(result.scalar() or 0)

    # ── Uso ──────────────────────────────────────────────────────────────────

    def _get_or_create_usage(
        self,
        db: Session,
        *,
        anon_id: str,
        tool_slug: str = EXERCISE_TOOL_SLUG,
    ) -> AnonymousUsage:
        """Retorna ou cria o contador de uso para (anon_id, tool_slug)."""
        usage = db.scalar(
            select(AnonymousUsage).where(
                AnonymousUsage.anon_id == anon_id,
                AnonymousUsage.tool_slug == tool_slug,
            )
        )
        if usage is None:
            usage = AnonymousUsage(anon_id=anon_id, tool_slug=tool_slug)
            try:
                db.add(usage)
                db.flush()
            except IntegrityError:
                # Race condition no UNIQUE (anon_id, tool_slug)
                db.rollback()
                usage = db.scalar(
                    select(AnonymousUsage).where(
                        AnonymousUsage.anon_id == anon_id,
                        AnonymousUsage.tool_slug == tool_slug,
                    )
                )
                if usage is None:
                    raise
        return usage  # type: ignore[return-value]

    def get_usage_state(
        self,
        db: Session,
        *,
        anon_id: str,
        fingerprint: str | None = None,
        tool_slug: str = EXERCISE_TOOL_SLUG,
    ) -> AnonUsageState:
        """Retorna o estado atual do uso sem modificar nada.

        Se `fingerprint` for fornecido, aplica cross-check entre identidades:
        se outras sessões/dispositivos com o mesmo fingerprint já esgotaram o
        limite gratuito, retorna estado bloqueado — independente do free_used
        da identidade atual. Isso impede bypass via incognito/localStorage limpo.
        """
        usage = self._get_or_create_usage(db, anon_id=anon_id, tool_slug=tool_slug)
        state = compute_usage_state(int(usage.free_used), int(usage.paid_credits))

        # Cross-check de fingerprint: detecta reuso de cota em outra sessão/aba anônima
        if fingerprint and state.remaining_free > 0:
            fp_total = self.get_fingerprint_free_total(db, fingerprint=fingerprint, tool_slug=tool_slug)
            if fp_total >= FREE_GENERATION_LIMIT:
                logger.info(
                    "anon.get_usage_state: fingerprint-exhausted anon_id=%s fp=%s fp_total=%d",
                    anon_id, fingerprint, fp_total,
                )
                # Mantém créditos pagos intactos — apenas gerações gratuitas bloqueadas
                return compute_usage_state(FREE_GENERATION_LIMIT, int(usage.paid_credits))

        return state

    def consume_generation(
        self,
        db: Session,
        *,
        anon_id: str,
        tool_slug: str = EXERCISE_TOOL_SLUG,
        request_hash: str | None = None,
    ) -> AnonUsageState:
        """Consome 1 geração (gratuita ou paga) e registra o evento de auditoria.

        Raises ValueError("blocked") se não houver cota disponível.
        O caller converte para HTTP 402 com detalhe de paywall.

        request_hash — SHA256 truncado dos parâmetros da requisição, usado para
        rastreio e detecção de duplicatas no analytics.
        """
        usage = self._get_or_create_usage(db, anon_id=anon_id, tool_slug=tool_slug)
        state = compute_usage_state(int(usage.free_used), int(usage.paid_credits))

        if state.remaining_free > 0:
            usage.free_used = state.free_used + 1
            event_type = "free"
        elif state.paid_credits > 0:
            usage.paid_credits = state.paid_credits - 1
            db.add(CreditLedger(anon_id=anon_id, amount=-1, reason="generation"))
            event_type = "paid"
        else:
            # Registra tentativa bloqueada para análise de funil (sem consumo)
            db.add(GenerationEvent(
                anon_id=anon_id,
                tool_slug=tool_slug,
                event_type="blocked",
                request_hash=request_hash,
            ))
            db.flush()
            raise ValueError("blocked")

        now = datetime.now(timezone.utc)
        usage.updated_at = now
        usage.last_generation_at = now
        usage.total_generations_used = int(usage.total_generations_used or 0) + 1
        db.add(GenerationEvent(
            anon_id=anon_id,
            tool_slug=tool_slug,
            event_type=event_type,
            request_hash=request_hash,
        ))
        db.flush()
        return compute_usage_state(int(usage.free_used), int(usage.paid_credits))

    # ── Créditos pagos ───────────────────────────────────────────────────────

    def grant_paid_credits(
        self,
        db: Session,
        *,
        anon_id: str,
        credits: int,
        ref_id: str | None = None,
        tool_slug: str = EXERCISE_TOOL_SLUG,
    ) -> int:
        """Adiciona créditos pagos à identidade e registra no ledger.

        Retorna o novo total de créditos pagos.
        """
        usage = self._get_or_create_usage(db, anon_id=anon_id, tool_slug=tool_slug)
        usage.paid_credits = int(usage.paid_credits) + int(credits)
        usage.updated_at = datetime.now(timezone.utc)
        db.add(CreditLedger(anon_id=anon_id, amount=credits, reason="stripe_purchase", ref_id=ref_id))
        db.flush()
        logger.info("anon.grant_credits: anon_id=%s credits=%d ref=%s total=%d", anon_id, credits, ref_id, usage.paid_credits)
        return int(usage.paid_credits)

    # ── Checkout sessions ────────────────────────────────────────────────────

    # ── Checkout sessions ────────────────────────────────────────────────────

    def record_checkout_session(
        self,
        db: Session,
        *,
        stripe_session_id: str,
        anon_id: str | None,
        user_id: int | None,
        plan_code: str,
        status: str = "pending",
    ) -> None:
        """Salva a sessão de checkout para rastreamento e reconciliação.

        status: 'created' para o endpoint v2, 'pending' para o legado.
        """
        db.add(ToolsCheckoutSession(
            id=stripe_session_id,
            anon_id=anon_id,
            user_id=user_id,
            plan_code=plan_code,
            status=status,
        ))
        db.flush()

    def is_checkout_already_processed(self, db: Session, *, stripe_session_id: str) -> bool:
        """Verifica se a sessão já foi processada — chave de idempotência.

        Retorna True se status for 'paid' ou 'completed', prevenindo duplo crédito
        em caso de retry do webhook Stripe.
        """
        session = db.get(ToolsCheckoutSession, stripe_session_id)
        if session is None:
            return False
        return session.status in ("paid", "completed")

    def complete_checkout_session(
        self,
        db: Session,
        *,
        stripe_session_id: str,
        paid_at: datetime | None = None,
        amount_paid_cents: int | None = None,
        currency: str | None = None,
        payment_intent_id: str | None = None,
    ) -> None:
        """Marca a sessão como paga após confirmação do webhook.

        Salva detalhes do pagamento para reconciliação e auditoria.
        Usa status 'paid' (canônico v2) — o webhook legado pode seguir usando
        'completed'; ambos são tratados como finalizados em is_checkout_already_processed().
        """
        values: dict = {"status": "paid"}
        if paid_at is not None:
            values["paid_at"] = paid_at
        if amount_paid_cents is not None:
            values["amount_paid_cents"] = amount_paid_cents
        if currency is not None:
            values["currency"] = currency
        if payment_intent_id is not None:
            values["payment_intent_id"] = payment_intent_id
        db.execute(
            update(ToolsCheckoutSession)
            .where(ToolsCheckoutSession.id == stripe_session_id)
            .values(**values)
        )

from __future__ import annotations

import hashlib
import hmac
import json
import time
from dataclasses import dataclass, field
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from app.core.config import settings

CHECKOUT_URL = "https://api.stripe.com/v1/checkout/sessions"


@dataclass(frozen=True)
class PricingPackInfo:
    code: str
    credits: int
    price_cents: int
    price_label: str
    currency: str


PRICING_PACKS: dict[str, PricingPackInfo] = {
    "credits_30": PricingPackInfo(
        code="credits_30",
        credits=30,
        price_cents=2900,
        price_label="R$ 29 por 30 gerações",
        currency="BRL",
    ),
}

# Derived from PRICING_PACKS — single source of truth for credit amounts
PAYMENT_PACKS: dict[str, int] = {code: pack.credits for code, pack in PRICING_PACKS.items()}


class BillingConfigError(Exception):
    pass


class BillingGatewayError(Exception):
    pass


@dataclass(frozen=True)
class CheckoutSessionResult:
    id: str
    url: str


@dataclass(frozen=True)
class PaymentInfo:
    """Detalhes extraídos do evento checkout.session.completed."""
    amount_paid_cents: int | None
    currency: str | None  # ISO 4217 em maiúsculas, ex: "BRL"
    payment_intent_id: str | None


@dataclass(frozen=True)
class CheckoutSessionStatus:
    id: str
    payment_status: str
    amount_total_cents: int | None
    currency: str | None
    payment_intent_id: str | None


class ToolsBillingService:
    def __init__(self) -> None:
        self.secret_key = (settings.stripe_secret_key or "").strip()
        self.webhook_secret = (settings.stripe_webhook_secret or "").strip()
        self.success_url = (settings.tools_checkout_success_url or "").strip()
        self.cancel_url = (settings.tools_checkout_cancel_url or "").strip()
        self.price_credits_30 = (settings.stripe_price_tools_credits_30 or "").strip()

    def ensure_checkout_config(self) -> None:
        if not self.secret_key:
            raise BillingConfigError("Stripe is not configured")
        if not self.success_url or not self.cancel_url:
            raise BillingConfigError("Checkout URLs are not configured")
        if not self.price_credits_30:
            raise BillingConfigError("Price for credits_30 is not configured")

    def create_checkout_session(
        self,
        *,
        plan_code: str,
        session_scope_key: str,
        customer_email: str | None,
        extra_metadata: dict[str, str] | None = None,
        success_url: str | None = None,
        cancel_url: str | None = None,
    ) -> CheckoutSessionResult:
        """Cria uma Checkout Session no Stripe.

        extra_metadata — campos adicionais incluídos em metadata[]; permite
        que novos endpoints embarcuem anonymous_id, fingerprint_id, etc. sem
        quebrar o contrato do webhook legado (que lê session_scope_key).
        """
        self.ensure_checkout_config()
        if plan_code != "credits_30":
            raise BillingConfigError("Unsupported plan code")
        resolved_success_url = (success_url or self.success_url).strip()
        resolved_cancel_url = (cancel_url or self.cancel_url).strip()
        if not resolved_success_url or not resolved_cancel_url:
            raise BillingConfigError("Checkout URLs are not configured")

        form_fields: list[tuple[str, str]] = [
            ("mode", "payment"),
            ("success_url", resolved_success_url),
            ("cancel_url", resolved_cancel_url),
            ("line_items[0][price]", self.price_credits_30),
            ("line_items[0][quantity]", "1"),
            ("allow_promotion_codes", "true"),
            ("metadata[plan_code]", plan_code),
            ("metadata[session_scope_key]", session_scope_key),
        ]
        # Metadados extras (anonymous_id, fingerprint_id, package_type, etc.)
        if extra_metadata:
            for key, value in extra_metadata.items():
                form_fields.append((f"metadata[{key}]", value))
        if customer_email:
            form_fields.append(("customer_email", customer_email.strip().lower()))

        payload = urlencode(form_fields).encode("utf-8")
        request = Request(
            CHECKOUT_URL,
            data=payload,
            headers={
                "Authorization": f"Bearer {self.secret_key}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            method="POST",
        )

        try:
            with urlopen(request, timeout=20.0) as response:
                raw = response.read().decode("utf-8", errors="replace")
        except HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            raise BillingGatewayError(self._format_gateway_error(exc.code, body)) from exc
        except (URLError, TimeoutError) as exc:
            raise BillingGatewayError("Failed to create checkout session: network error") from exc

        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise BillingGatewayError("Invalid checkout response") from exc
        if not isinstance(parsed, dict):
            raise BillingGatewayError("Invalid checkout response")

        session_id = parsed.get("id")
        session_url = parsed.get("url")
        if not isinstance(session_id, str) or not isinstance(session_url, str):
            raise BillingGatewayError("Checkout response missing id/url")
        return CheckoutSessionResult(id=session_id, url=session_url)

    def get_checkout_session_status(self, session_id: str) -> CheckoutSessionStatus:
        self.ensure_checkout_config()
        request = Request(
            f"{CHECKOUT_URL}/{session_id}",
            headers={"Authorization": f"Bearer {self.secret_key}"},
            method="GET",
        )
        try:
            with urlopen(request, timeout=20.0) as response:
                raw = response.read().decode("utf-8", errors="replace")
        except HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            raise BillingGatewayError(self._format_gateway_error(exc.code, body)) from exc
        except (URLError, TimeoutError) as exc:
            raise BillingGatewayError("Failed to fetch checkout session: network error") from exc

        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise BillingGatewayError("Invalid checkout status response") from exc
        if not isinstance(parsed, dict):
            raise BillingGatewayError("Invalid checkout status response")

        resolved_id = parsed.get("id")
        payment_status = parsed.get("payment_status")
        amount_total = parsed.get("amount_total")
        currency = parsed.get("currency")
        payment_intent = parsed.get("payment_intent")
        if not isinstance(resolved_id, str) or not isinstance(payment_status, str):
            raise BillingGatewayError("Checkout status response missing required fields")

        return CheckoutSessionStatus(
            id=resolved_id,
            payment_status=payment_status.strip().lower(),
            amount_total_cents=int(amount_total) if isinstance(amount_total, (int, float)) else None,
            currency=str(currency).upper() if isinstance(currency, str) else None,
            payment_intent_id=str(payment_intent) if isinstance(payment_intent, str) else None,
        )

    @staticmethod
    def _format_gateway_error(status_code: int, body: str) -> str:
        message = f"Failed to create checkout session (Stripe HTTP {status_code})"
        try:
            parsed = json.loads(body)
        except json.JSONDecodeError:
            return message
        if not isinstance(parsed, dict):
            return message
        error = parsed.get("error")
        if not isinstance(error, dict):
            return message
        detail = error.get("message")
        code = error.get("code")
        if isinstance(code, str) and isinstance(detail, str):
            return f"{message}: {code} - {detail}"
        if isinstance(detail, str):
            return f"{message}: {detail}"
        return message

    def verify_webhook_signature(self, *, payload: bytes, signature_header: str | None) -> bool:
        if not self.webhook_secret or not signature_header:
            return False
        timestamp: str | None = None
        signature_v1: str | None = None
        for part in signature_header.split(","):
            token = part.strip()
            if token.startswith("t="):
                timestamp = token[2:]
            elif token.startswith("v1="):
                signature_v1 = token[3:]
        if not timestamp or not signature_v1:
            return False
        try:
            timestamp_int = int(timestamp)
        except ValueError:
            return False
        if abs(int(time.time()) - timestamp_int) > 300:
            return False
        signed_payload = f"{timestamp}.{payload.decode('utf-8', errors='replace')}".encode()
        digest = hmac.new(
            self.webhook_secret.encode("utf-8"),
            signed_payload,
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(digest, signature_v1)

    def parse_checkout_completed_event(
        self,
        event_payload: dict[str, Any],
    ) -> tuple[str, int] | None:
        """Extrai (scope_key, credits) de um evento checkout.session.completed.

        Suporta dois formatos de metadata:
          - Legado: session_scope_key + plan_code
          - Novo: anonymous_id + package_type (inclui session_scope_key para compat)
        Em ambos os casos retorna (scope_key, credits) para o webhook legado.
        """
        if event_payload.get("type") != "checkout.session.completed":
            return None
        data = event_payload.get("data")
        if not isinstance(data, dict):
            return None
        obj = data.get("object")
        if not isinstance(obj, dict):
            return None
        metadata = obj.get("metadata")
        if not isinstance(metadata, dict):
            return None
        scope_key = metadata.get("session_scope_key")
        plan_code = metadata.get("plan_code")
        if not isinstance(scope_key, str) or not isinstance(plan_code, str):
            return None
        credits = PAYMENT_PACKS.get(plan_code)
        if credits is None:
            return None
        return scope_key, credits

    def parse_checkout_completed_event_v2(
        self,
        event_payload: dict[str, Any],
    ) -> tuple[str | None, int] | None:
        """Versão v2: extrai (anonymous_id | None, credits) para o novo webhook.

        Tenta ler anonymous_id diretamente de metadata. Se ausente, faz fallback
        parseando session_scope_key (formato legado anon:{id}).

        Retorna None se o evento não for checkout.session.completed ou se os
        metadados estiverem ausentes/malformados.
        """
        if event_payload.get("type") != "checkout.session.completed":
            return None
        data = event_payload.get("data")
        if not isinstance(data, dict):
            return None
        obj = data.get("object")
        if not isinstance(obj, dict):
            return None
        metadata = obj.get("metadata")
        if not isinstance(metadata, dict):
            return None

        # ── Formato novo: anonymous_id direto ────────────────────────────────
        anonymous_id = metadata.get("anonymous_id")
        package_type = metadata.get("package_type")
        credits_str = metadata.get("credits_to_add")
        if isinstance(anonymous_id, str) and isinstance(package_type, str):
            if isinstance(credits_str, str) and credits_str.isdigit():
                return anonymous_id, int(credits_str)
            # Fallback: resolve pelo package_type → plan_code → PAYMENT_PACKS
            pack_map = {"pack_30": "credits_30"}
            plan_code = pack_map.get(package_type, package_type)
            credits = PAYMENT_PACKS.get(plan_code)
            if credits is not None:
                return anonymous_id, credits

        # ── Formato legado: session_scope_key = anon:{id} ────────────────────
        scope_key = metadata.get("session_scope_key")
        plan_code = metadata.get("plan_code")
        if isinstance(scope_key, str) and isinstance(plan_code, str) and scope_key.startswith("anon:"):
            credits = PAYMENT_PACKS.get(plan_code)
            if credits is not None:
                anon_id_from_scope = scope_key.partition(":")[2]
                return anon_id_from_scope, credits

        return None

    def extract_payment_info(self, event_payload: dict[str, Any]) -> PaymentInfo:
        """Extrai informações de pagamento do objeto Stripe para persistência."""
        obj = event_payload.get("data", {}).get("object", {})
        if not isinstance(obj, dict):
            return PaymentInfo(None, None, None)
        amount = obj.get("amount_total")
        currency = obj.get("currency")
        payment_intent = obj.get("payment_intent")
        return PaymentInfo(
            amount_paid_cents=int(amount) if isinstance(amount, (int, float)) else None,
            currency=str(currency).upper() if isinstance(currency, str) else None,
            payment_intent_id=str(payment_intent) if isinstance(payment_intent, str) else None,
        )

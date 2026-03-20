from __future__ import annotations

import hashlib
import hmac
import json
import time
from dataclasses import dataclass
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
    ) -> CheckoutSessionResult:
        self.ensure_checkout_config()
        if plan_code != "credits_30":
            raise BillingConfigError("Unsupported plan code")

        form_fields: list[tuple[str, str]] = [
            ("mode", "payment"),
            ("success_url", self.success_url),
            ("cancel_url", self.cancel_url),
            ("line_items[0][price]", self.price_credits_30),
            ("line_items[0][quantity]", "1"),
            ("allow_promotion_codes", "true"),
            ("metadata[plan_code]", plan_code),
            ("metadata[session_scope_key]", session_scope_key),
        ]
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
        except (HTTPError, URLError, TimeoutError) as exc:
            raise BillingGatewayError("Failed to create checkout session") from exc

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

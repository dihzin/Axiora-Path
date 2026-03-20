from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from secrets import token_urlsafe
from typing import Any

from redis.asyncio import Redis

EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@dataclass(frozen=True)
class ToolsCatalogItem:
    slug: str
    name: str
    summary: str
    price_label: str
    status: str
    entry_path: str


CATALOG: tuple[ToolsCatalogItem, ...] = (
    ToolsCatalogItem(
        slug="gerador-atividades",
        name="Gerador de Atividades",
        summary="Cria atividades personalizadas por idade e habilidade em menos de 2 minutos.",
        price_label="R$ 29 por 30 gerações",
        status="ACTIVE",
        entry_path="/tools/gerador-atividades",
    ),
    ToolsCatalogItem(
        slug="planner-familiar",
        name="Planner Familiar Inteligente",
        summary="Transforma objetivos semanais em rotinas simples para pais e filhos.",
        price_label="Em breve",
        status="COMING_SOON",
        entry_path="/tools/planner-familiar",
    ),
    ToolsCatalogItem(
        slug="checkup-aprendizagem",
        name="Checkup de Aprendizagem",
        summary=(
            "Entrega diagnóstico rápido com próximos passos acionáveis para "
            "evolução da criança."
        ),
        price_label="Em breve",
        status="COMING_SOON",
        entry_path="/tools/checkup-aprendizagem",
    ),
)


class ToolsSessionNotFoundError(Exception):
    pass


class ToolsValidationError(Exception):
    pass


class ToolsService:
    def __init__(self, redis: Redis) -> None:
        self.redis = redis
        self.ttl_seconds = int(timedelta(days=7).total_seconds())

    def list_catalog(self) -> list[ToolsCatalogItem]:
        return list(CATALOG)

    async def create_guest_session(
        self,
        *,
        tool_slug: str | None,
        source_path: str,
        utm: dict[str, str] | None,
    ) -> tuple[str, datetime]:
        session_token = token_urlsafe(24)
        now = datetime.now(UTC)
        expires_at = now + timedelta(seconds=self.ttl_seconds)
        payload = {
            "mode": "guest",
            "tool_slug": tool_slug,
            "source_path": source_path,
            "utm": utm or {},
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
            "expires_at": expires_at.isoformat(),
        }
        await self.redis.setex(
            self._session_key(session_token),
            self.ttl_seconds,
            json.dumps(payload),
        )
        return session_token, expires_at

    async def identify_email(
        self,
        *,
        session_token: str,
        email: str,
        name: str | None,
        consent_marketing: bool,
    ) -> None:
        normalized_email = email.strip().lower()
        if not EMAIL_PATTERN.match(normalized_email):
            raise ToolsValidationError("Invalid email format")

        payload = await self._load_session_payload(session_token)
        payload["mode"] = "light_user"
        payload["email"] = normalized_email
        payload["name"] = name.strip() if name is not None else None
        payload["consent_marketing"] = consent_marketing
        payload["updated_at"] = datetime.now(UTC).isoformat()
        await self._save_session_payload(session_token, payload)

    async def link_account(
        self,
        *,
        session_token: str,
        user_id: int,
        tenant_id: int,
    ) -> None:
        payload = await self._load_session_payload(session_token)
        payload["mode"] = "linked"
        payload["linked_user_id"] = user_id
        payload["linked_tenant_id"] = tenant_id
        payload["updated_at"] = datetime.now(UTC).isoformat()
        await self._save_session_payload(session_token, payload)

    async def _load_session_payload(self, session_token: str) -> dict[str, Any]:
        raw_payload = await self.redis.get(self._session_key(session_token))
        if raw_payload is None:
            raise ToolsSessionNotFoundError("Tools session not found")
        try:
            payload = json.loads(raw_payload)
        except json.JSONDecodeError as exc:
            raise ToolsValidationError("Invalid tools session payload") from exc
        if not isinstance(payload, dict):
            raise ToolsValidationError("Invalid tools session payload")
        return payload

    async def _save_session_payload(self, session_token: str, payload: dict[str, Any]) -> None:
        key = self._session_key(session_token)
        ttl = await self.redis.ttl(key)
        ttl_seconds = ttl if ttl > 0 else self.ttl_seconds
        await self.redis.setex(key, ttl_seconds, json.dumps(payload))

    def _session_key(self, session_token: str) -> str:
        return f"tools:session:{session_token}"

    async def increment_free_generation_usage(
        self,
        *,
        key_id: str,
        free_limit: int,
    ) -> tuple[int, int, bool]:
        key = f"tools:usage:exercise-generator:{key_id}"
        current = await self.redis.incr(key)
        if current == 1:
            await self.redis.expire(key, int(timedelta(days=30).total_seconds()))
        used = max(0, int(current))
        remaining = max(0, int(free_limit) - used)
        return used, remaining, used > int(free_limit)

    async def get_free_generation_usage(self, *, key_id: str) -> int:
        key = f"tools:usage:exercise-generator:{key_id}"
        raw = await self.redis.get(key)
        if raw is None:
            return 0
        try:
            return max(0, int(raw))
        except (TypeError, ValueError):
            return 0

    async def get_paid_generation_credits(self, *, key_id: str) -> int:
        key = f"tools:credits:exercise-generator:{key_id}"
        raw = await self.redis.get(key)
        if raw is None:
            return 0
        try:
            return max(0, int(raw))
        except (TypeError, ValueError):
            return 0

    async def grant_paid_generation_credits(self, *, key_id: str, credits: int) -> int:
        safe_credits = max(0, int(credits))
        key = f"tools:credits:exercise-generator:{key_id}"
        if safe_credits == 0:
            return await self.get_paid_generation_credits(key_id=key_id)
        total = await self.redis.incrby(key, safe_credits)
        await self.redis.expire(key, int(timedelta(days=365).total_seconds()))
        return max(0, int(total))

    async def consume_paid_generation_credit(self, *, key_id: str) -> int:
        key = f"tools:credits:exercise-generator:{key_id}"
        available = await self.get_paid_generation_credits(key_id=key_id)
        if available <= 0:
            return 0
        remaining = await self.redis.decr(key)
        return max(0, int(remaining))

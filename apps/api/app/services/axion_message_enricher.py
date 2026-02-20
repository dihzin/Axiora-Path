from __future__ import annotations

from datetime import UTC, datetime, timedelta
from hashlib import sha256
from time import perf_counter
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import ChildProfile, LLMCache, LLMUsageStatus, LLMUseCase, SubjectAgeGroup
from app.services.aprender import age_group_from_birth_year
from app.services.axion_persona import resolve_user_persona
from app.services.llm_gate import llmGate, log_llm_usage
from app.services.llm_provider import get_llm_provider

MAX_MESSAGE_CHARS = 220
CACHE_TTL_HOURS = 24

_DISALLOWED_PATTERNS = (
    "http://",
    "https://",
    "www.",
    "@",
    "advogado",
    "juridico",
    "processo judicial",
    "medico",
    "diagnostico",
    "receita medica",
)

_COMPLEX_WORDS_6_8 = {
    "probabilidade",
    "otimizacao",
    "jurisprudencia",
    "epistemologia",
    "compliance",
    "interdisciplinaridade",
}


def _cleanup_cache(db: Session) -> None:
    now = datetime.now(UTC)
    db.execute(delete(LLMCache).where(LLMCache.expires_at <= now))


def _resolve_age_group(db: Session, *, tenant_id: int) -> SubjectAgeGroup:
    child = db.scalar(
        select(ChildProfile)
        .where(
            ChildProfile.tenant_id == tenant_id,
            ChildProfile.deleted_at.is_(None),
        )
        .order_by(ChildProfile.id.asc())
    )
    if child is None:
        return SubjectAgeGroup.AGE_9_12
    return age_group_from_birth_year(birth_year=child.birth_year, now_year=datetime.now(UTC).year)


def _age_group_label(age_group: SubjectAgeGroup) -> str:
    return {
        SubjectAgeGroup.AGE_6_8: "6-8",
        SubjectAgeGroup.AGE_9_12: "9-12",
        SubjectAgeGroup.AGE_13_15: "13-15",
    }.get(age_group, "9-12")


def _build_cache_key(
    *,
    tenant_id: int,
    user_id: int,
    context: str,
    tone: str,
    age_group: SubjectAgeGroup,
    persona: str,
    draft: str,
) -> str:
    raw = f"{tenant_id}|{user_id}|{context}|{tone}|{_age_group_label(age_group)}|{persona}|{draft}"
    digest = sha256(raw.encode("utf-8")).hexdigest()
    return f"axion:rewrite:v1:{digest}"


def _contains_disallowed(text: str) -> bool:
    lowered = text.lower()
    if any(item in lowered for item in _DISALLOWED_PATTERNS):
        return True
    if any(ch.isdigit() for ch in lowered) and ("cpf" in lowered or "telefone" in lowered):
        return True
    return False


def _safe_vocabulary(text: str, age_group: SubjectAgeGroup) -> bool:
    words = [item.strip(".,!?;:()[]{}\"'").lower() for item in text.split() if item.strip()]
    if not words:
        return False
    if age_group == SubjectAgeGroup.AGE_6_8:
        if len(words) > 40:
            return False
        if any(len(word) > 14 for word in words):
            return False
        if any(word in _COMPLEX_WORDS_6_8 for word in words):
            return False
    elif age_group == SubjectAgeGroup.AGE_9_12:
        if len(words) > 45:
            return False
    return True


def _valid_rewrite(text: str, *, age_group: SubjectAgeGroup) -> bool:
    if not text or not text.strip():
        return False
    if len(text) > MAX_MESSAGE_CHARS:
        return False
    if _contains_disallowed(text):
        return False
    if not _safe_vocabulary(text, age_group):
        return False
    return True


def enrich_axion_message(
    db: Session,
    *,
    tenant_id: int,
    user_id: int,
    context: str,
    tone: str,
    draft_message: str,
    state: Any,
    facts: dict[str, Any],
) -> str:
    gate = llmGate.canCall(
        db,
        tenantId=tenant_id,
        userId=user_id,
        useCase=LLMUseCase.REWRITE_MESSAGE,
    )
    age_group = _resolve_age_group(db, tenant_id=tenant_id)
    persona = resolve_user_persona(db, user_id=user_id, state=state, auto_switch=False).persona.name
    cache_key = _build_cache_key(
        tenant_id=tenant_id,
        user_id=user_id,
        context=context,
        tone=tone,
        age_group=age_group,
        persona=persona,
        draft=draft_message,
    )

    prompt_input = {
        "draftMessage": draft_message,
        "constraints": {
            "ageGroup": _age_group_label(age_group),
            "persona": persona,
            "maxChars": MAX_MESSAGE_CHARS,
            "tone": tone,
            "forbidden": [
                "links",
                "personal_data",
                "medical_advice",
                "legal_advice",
            ],
        },
        "facts": facts,
        "context": context,
    }
    prompt_repr = str(prompt_input)
    estimated_tokens = max(1, len(prompt_repr) // 4)

    if not gate.allowed:
        log_llm_usage(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            use_case=LLMUseCase.REWRITE_MESSAGE,
            prompt=prompt_repr,
            cache_key=cache_key,
            tokens_estimated=0,
            latency_ms=0,
            status=LLMUsageStatus.BLOCKED,
        )
        return draft_message

    _cleanup_cache(db)
    cached = db.scalar(
        select(LLMCache).where(
            LLMCache.cache_key == cache_key,
            LLMCache.expires_at > datetime.now(UTC),
        )
    )
    if cached is not None and isinstance(cached.payload, dict):
        cached_message = str(cached.payload.get("message", "")).strip()
        if _valid_rewrite(cached_message, age_group=age_group):
            log_llm_usage(
                db,
                tenant_id=tenant_id,
                user_id=user_id,
                use_case=LLMUseCase.REWRITE_MESSAGE,
                prompt=prompt_repr,
                cache_key=cache_key,
                tokens_estimated=0,
                latency_ms=0,
                status=LLMUsageStatus.HIT,
            )
            return cached_message

    provider = get_llm_provider(gate.settings.provider_key if gate.settings is not None else "noop")
    start = perf_counter()
    try:
        rewritten = provider.rewriteMessage(prompt_input)
        latency_ms = int((perf_counter() - start) * 1000)
    except Exception:
        log_llm_usage(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            use_case=LLMUseCase.REWRITE_MESSAGE,
            prompt=prompt_repr,
            cache_key=cache_key,
            tokens_estimated=estimated_tokens,
            latency_ms=int((perf_counter() - start) * 1000),
            status=LLMUsageStatus.FAILED,
        )
        return draft_message

    rewritten_text = str(rewritten or "").strip()
    if not rewritten_text:
        log_llm_usage(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            use_case=LLMUseCase.REWRITE_MESSAGE,
            prompt=prompt_repr,
            cache_key=cache_key,
            tokens_estimated=estimated_tokens,
            latency_ms=latency_ms,
            status=LLMUsageStatus.MISS,
        )
        return draft_message

    if not _valid_rewrite(rewritten_text, age_group=age_group):
        log_llm_usage(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            use_case=LLMUseCase.REWRITE_MESSAGE,
            prompt=prompt_repr,
            cache_key=cache_key,
            tokens_estimated=max(estimated_tokens, len(rewritten_text) // 4),
            latency_ms=latency_ms,
            status=LLMUsageStatus.FALLBACK,
        )
        return draft_message

    expires_at = datetime.now(UTC) + timedelta(hours=CACHE_TTL_HOURS)
    if cached is None:
        db.add(
            LLMCache(
                cache_key=cache_key,
                payload={"message": rewritten_text, "source": "llm_rewrite"},
                expires_at=expires_at,
            )
        )
    else:
        cached.payload = {"message": rewritten_text, "source": "llm_rewrite"}
        cached.expires_at = expires_at

    log_llm_usage(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        use_case=LLMUseCase.REWRITE_MESSAGE,
        prompt=prompt_repr,
        cache_key=cache_key,
        tokens_estimated=max(estimated_tokens, len(rewritten_text) // 4),
        latency_ms=latency_ms,
        status=LLMUsageStatus.HIT,
    )
    return rewritten_text


from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from time import perf_counter
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import (
    ChildProfile,
    GeneratedVariant,
    LLMCache,
    LLMUsageStatus,
    LLMUseCase,
    Question,
    QuestionTemplate,
    QuestionVariant,
    Skill,
    SubjectAgeGroup,
)
from app.services.aprender import age_group_from_birth_year
from app.services.llm_gate import llmGate, log_llm_usage
from app.services.llm_provider import get_llm_provider

MAX_REMEDIATION_CHARS = 240
_SHAME_WORDS = {
    "burro",
    "burrinha",
    "burrinho",
    "preguicoso",
    "preguicosa",
    "voce nao consegue",
    "voce sempre erra",
    "errado de novo",
    "fracasso",
}
_DISALLOWED = {
    "http://",
    "https://",
    "www.",
    "advogado",
    "juridico",
    "processo judicial",
    "medico",
    "diagnostico",
    "receita medica",
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


def _sanitize_text(value: Any, *, max_len: int = 180) -> str:
    text = str(value or "")
    text = re.sub(r"https?://\S+", "", text, flags=re.IGNORECASE)
    text = re.sub(r"www\.\S+", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:max_len]


def _extract_correct_answer(metadata: dict[str, Any]) -> str | None:
    keys = ("correctAnswer", "answer", "correct", "correctValue", "correctOption")
    for key in keys:
        if key in metadata:
            value = metadata.get(key)
            if isinstance(value, (str, int, float)):
                return str(value)
            if isinstance(value, list) and value:
                return ", ".join(str(item) for item in value[:3])
    choices = metadata.get("choices")
    if isinstance(choices, list):
        for choice in choices:
            if not isinstance(choice, dict):
                continue
            is_correct = bool(choice.get("isCorrect"))
            if is_correct:
                return str(choice.get("label") or choice.get("text") or choice.get("value") or choice.get("id") or "")
        answer_key = metadata.get("answer")
        for choice in choices:
            if not isinstance(choice, dict):
                continue
            if answer_key is not None and str(choice.get("id")) == str(answer_key):
                return str(choice.get("label") or choice.get("text") or choice.get("value") or choice.get("id") or "")
    return None


def _extract_wrong_answer(metadata: dict[str, Any], *, correct_answer: str | None, provided_wrong: str | None) -> str | None:
    if provided_wrong and str(provided_wrong).strip():
        return str(provided_wrong).strip()
    choices = metadata.get("choices")
    if isinstance(choices, list):
        for choice in choices:
            if not isinstance(choice, dict):
                continue
            candidate = str(choice.get("label") or choice.get("text") or choice.get("value") or choice.get("id") or "").strip()
            if not candidate:
                continue
            if correct_answer is None or candidate != correct_answer:
                return candidate
    return None


def _resolve_question_context(
    db: Session,
    *,
    question_id: str | None,
    template_id: str | None,
    generated_variant_id: str | None,
    variant_id: str | None,
) -> dict[str, Any]:
    prompt = ""
    explanation = None
    metadata: dict[str, Any] = {}
    skill_id: str | None = None
    signature = ""

    if question_id is not None:
        question = db.get(Question, question_id)
        if question is None:
            raise ValueError("Question not found for remediation")
        prompt = question.prompt
        explanation = question.explanation
        metadata = dict(question.metadata_json or {})
        skill_id = str(question.skill_id)
        signature = f"q:{question.id}"
        if variant_id is not None:
            variant = db.get(QuestionVariant, variant_id)
            if variant is not None:
                payload = variant.variant_data or {}
                prompt = str(payload.get("prompt", prompt))
                explanation = payload.get("explanation", explanation)
                metadata = dict(payload.get("metadata", metadata))
                signature = str(payload.get("signature") or f"qv:{variant.id}")

    elif template_id is not None and generated_variant_id is not None:
        template = db.get(QuestionTemplate, template_id)
        generated = db.get(GeneratedVariant, generated_variant_id)
        if template is None or generated is None or str(generated.template_id) != str(template.id):
            raise ValueError("Template variant not found for remediation")
        payload = generated.variant_data or {}
        prompt = str(payload.get("prompt", ""))
        explanation = payload.get("explanation") if isinstance(payload.get("explanation"), str) else template.explanation_template
        metadata = dict(payload.get("metadata", {}))
        skill_id = str(template.skill_id)
        signature = str(payload.get("signature") or "")
        if not signature:
            signature = sha256(str(payload.get("variables", {})).encode("utf-8")).hexdigest()[:16]
    else:
        raise ValueError("questionId or (templateId + generatedVariantId) is required for remediation")

    skill_name = "habilidade"
    if skill_id is not None:
        skill = db.get(Skill, skill_id)
        if skill is not None and skill.name:
            skill_name = str(skill.name)

    correct_answer = _extract_correct_answer(metadata)
    return {
        "prompt": _sanitize_text(prompt, max_len=180),
        "explanation": _sanitize_text(explanation or "", max_len=240) if explanation else None,
        "metadata": metadata,
        "skillName": _sanitize_text(skill_name, max_len=60),
        "signature": signature,
        "correctAnswer": _sanitize_text(correct_answer, max_len=60) if correct_answer else None,
    }


def _cache_key(
    *,
    user_id: int,
    question_id: str | None,
    template_id: str | None,
    variant_signature: str,
    day_bucket: str,
) -> str:
    source = question_id or template_id or "unknown"
    digest = sha256(f"{user_id}|{source}|{variant_signature}|{day_bucket}".encode("utf-8")).hexdigest()
    return f"axion:mistake:v1:{digest}"


def _valid_remediation(text: str, *, age_group: SubjectAgeGroup) -> bool:
    if not text or not text.strip():
        return False
    if len(text) > MAX_REMEDIATION_CHARS:
        return False
    lowered = text.lower()
    if any(item in lowered for item in _SHAME_WORDS):
        return False
    if any(item in lowered for item in _DISALLOWED):
        return False
    sentences = [item.strip() for item in re.split(r"[.!?]+", text) if item.strip()]
    if not (1 <= len(sentences) <= 2):
        return False
    if age_group == SubjectAgeGroup.AGE_6_8 and len(text.split()) > 34:
        return False
    return True


def maybe_enrich_wrong_answer_explanation(
    db: Session,
    *,
    tenant_id: int,
    user_id: int,
    question_id: str | None,
    template_id: str | None,
    generated_variant_id: str | None,
    variant_id: str | None,
    wrong_answer: str | None = None,
) -> str | None:
    context = _resolve_question_context(
        db,
        question_id=question_id,
        template_id=template_id,
        generated_variant_id=generated_variant_id,
        variant_id=variant_id,
    )
    fallback = context.get("explanation")
    age_group = _resolve_age_group(db, tenant_id=tenant_id)
    day_bucket = datetime.now(UTC).strftime("%Y-%m-%d")
    cache_key = _cache_key(
        user_id=user_id,
        question_id=question_id,
        template_id=template_id,
        variant_signature=str(context.get("signature", "")),
        day_bucket=day_bucket,
    )

    prompt_input = {
        "questionPrompt": context.get("prompt"),
        "wrongAnswer": _sanitize_text(
            _extract_wrong_answer(
                context.get("metadata", {}),
                correct_answer=context.get("correctAnswer"),
                provided_wrong=wrong_answer,
            )
            or "nao informado",
            max_len=60,
        ),
        "correctAnswer": _sanitize_text(context.get("correctAnswer") or "nao informado", max_len=60),
        "skillName": context.get("skillName"),
        "ageGroup": _age_group_label(age_group),
        "constraints": {
            "sentences": "1-2",
            "friendly": True,
            "playful": True,
            "noShameLanguage": True,
            "maxChars": MAX_REMEDIATION_CHARS,
        },
    }
    prompt_repr = str(prompt_input)
    estimated_tokens = max(1, len(prompt_repr) // 4)

    gate = llmGate.canCall(
        db,
        tenantId=tenant_id,
        userId=user_id,
        useCase=LLMUseCase.EXPLAIN_MISTAKE,
    )
    if not gate.allowed:
        log_llm_usage(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            use_case=LLMUseCase.EXPLAIN_MISTAKE,
            prompt=prompt_repr,
            cache_key=cache_key,
            tokens_estimated=0,
            latency_ms=0,
            status=LLMUsageStatus.BLOCKED,
        )
        return fallback

    _cleanup_cache(db)
    cached = db.scalar(
        select(LLMCache).where(
            LLMCache.cache_key == cache_key,
            LLMCache.expires_at > datetime.now(UTC),
        )
    )
    if cached is not None and isinstance(cached.payload, dict):
        text = str(cached.payload.get("text", "")).strip()
        if _valid_remediation(text, age_group=age_group):
            log_llm_usage(
                db,
                tenant_id=tenant_id,
                user_id=user_id,
                use_case=LLMUseCase.EXPLAIN_MISTAKE,
                prompt=prompt_repr,
                cache_key=cache_key,
                tokens_estimated=0,
                latency_ms=0,
                status=LLMUsageStatus.HIT,
            )
            return text

    provider = get_llm_provider(gate.settings.provider_key if gate.settings is not None else "noop")
    start = perf_counter()
    try:
        enriched = provider.explainMistake(prompt_input)
        latency_ms = int((perf_counter() - start) * 1000)
    except Exception:
        log_llm_usage(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            use_case=LLMUseCase.EXPLAIN_MISTAKE,
            prompt=prompt_repr,
            cache_key=cache_key,
            tokens_estimated=estimated_tokens,
            latency_ms=int((perf_counter() - start) * 1000),
            status=LLMUsageStatus.FAILED,
        )
        return fallback

    enriched_text = _sanitize_text(enriched, max_len=MAX_REMEDIATION_CHARS) if enriched else ""
    if not enriched_text:
        log_llm_usage(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            use_case=LLMUseCase.EXPLAIN_MISTAKE,
            prompt=prompt_repr,
            cache_key=cache_key,
            tokens_estimated=estimated_tokens,
            latency_ms=latency_ms,
            status=LLMUsageStatus.MISS,
        )
        return fallback

    if not _valid_remediation(enriched_text, age_group=age_group):
        log_llm_usage(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            use_case=LLMUseCase.EXPLAIN_MISTAKE,
            prompt=prompt_repr,
            cache_key=cache_key,
            tokens_estimated=max(estimated_tokens, len(enriched_text) // 4),
            latency_ms=latency_ms,
            status=LLMUsageStatus.FALLBACK,
        )
        return fallback

    expires_at = datetime.now(UTC) + timedelta(hours=24)
    if cached is None:
        db.add(
            LLMCache(
                cache_key=cache_key,
                payload={"text": enriched_text},
                expires_at=expires_at,
            )
        )
    else:
        cached.payload = {"text": enriched_text}
        cached.expires_at = expires_at

    log_llm_usage(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        use_case=LLMUseCase.EXPLAIN_MISTAKE,
        prompt=prompt_repr,
        cache_key=cache_key,
        tokens_estimated=max(estimated_tokens, len(enriched_text) // 4),
        latency_ms=latency_ms,
        status=LLMUsageStatus.HIT,
    )
    return enriched_text


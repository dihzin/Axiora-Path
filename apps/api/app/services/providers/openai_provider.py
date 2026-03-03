from __future__ import annotations

from dataclasses import dataclass
import json
import re
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


@dataclass(slots=True)
class OpenAIProvider:
    api_key: str
    model: str
    key: str = "openai"
    timeout_seconds: float = 3.0
    retry_attempts: int = 1
    _last_usage_tokens: int | None = None

    def rewriteMessage(self, input: dict[str, Any]) -> str | None:
        payload = self._sanitize_obj(input, depth=0)
        content = self._chat_text(
            system_prompt=(
                "Você reescreve mensagens para crianças preservando o sentido original. "
                "Não inclua links, PII, conselhos médicos ou jurídicos. "
                "Resposta curta, segura e direta."
            ),
            user_payload=payload,
            temperature=0.2,
        )
        return self._sanitize_output_text(content)

    def explainMistake(self, input: dict[str, Any]) -> str | None:
        payload = self._sanitize_obj(input, depth=0)
        content = self._chat_text(
            system_prompt=(
                "Você explica erros de forma pedagógica para crianças, com linguagem simples. "
                "Não inclua links, PII, conselhos médicos ou jurídicos."
            ),
            user_payload=payload,
            temperature=0.2,
        )
        return self._sanitize_output_text(content)

    def generateVariants(self, input: dict[str, Any]) -> list[dict[str, Any]] | None:
        payload = self._sanitize_obj(input, depth=0)
        content = self._chat_text(
            system_prompt=(
                "Gere apenas JSON válido com uma lista de objetos de variantes. "
                "Não use markdown, não use texto fora do JSON."
            ),
            user_payload=payload,
            temperature=0.4,
        )
        if not content:
            return None
        return self._parse_json_list(content)

    def parentInsight(self, input: dict[str, Any]) -> str | None:
        payload = self._sanitize_obj(input, depth=0)
        content = self._chat_text(
            system_prompt=(
                "Você produz insights claros para responsáveis com foco em ações práticas. "
                "Não inclua links, PII, conselhos médicos ou jurídicos."
            ),
            user_payload=payload,
            temperature=0.2,
        )
        return self._sanitize_output_text(content)

    def getLastUsageTokens(self) -> int | None:
        return self._last_usage_tokens

    def _chat_text(self, *, system_prompt: str, user_payload: dict[str, Any], temperature: float) -> str | None:
        self._last_usage_tokens = None
        body = {
            "model": self.model,
            "stream": False,
            "temperature": max(0.0, min(1.0, float(temperature))),
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": json.dumps(user_payload, ensure_ascii=True)},
            ],
        }
        raw = self._request_json(body)
        if raw is None or not isinstance(raw, dict):
            return None
        usage = raw.get("usage")
        if isinstance(usage, dict):
            tokens = usage.get("total_tokens")
            if isinstance(tokens, int):
                self._last_usage_tokens = max(0, tokens)
        choices = raw.get("choices")
        if not isinstance(choices, list) or not choices:
            return None
        first = choices[0]
        if not isinstance(first, dict):
            return None
        message = first.get("message")
        if not isinstance(message, dict):
            return None
        content = message.get("content")
        if isinstance(content, str):
            return content
        return None

    def _request_json(self, body: dict[str, Any]) -> dict[str, Any] | None:
        encoded = json.dumps(body, ensure_ascii=True).encode("utf-8")
        request = Request(
            "https://api.openai.com/v1/chat/completions",
            data=encoded,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        attempts = 1 + max(0, int(self.retry_attempts))
        for idx in range(attempts):
            try:
                with urlopen(request, timeout=max(0.1, float(self.timeout_seconds))) as response:
                    raw = response.read().decode("utf-8", errors="replace")
                    parsed = json.loads(raw)
                    return parsed if isinstance(parsed, dict) else None
            except TimeoutError:
                if idx >= attempts - 1:
                    return None
            except HTTPError:
                return None
            except URLError:
                if idx >= attempts - 1:
                    return None
            except (json.JSONDecodeError, ValueError):
                return None
        return None

    def _sanitize_obj(self, value: Any, *, depth: int) -> dict[str, Any]:
        if depth > 6:
            return {}
        if isinstance(value, dict):
            out: dict[str, Any] = {}
            for raw_key, raw_val in value.items():
                key = str(raw_key)[:80]
                if isinstance(raw_val, str):
                    out[key] = self._sanitize_input_text(raw_val)
                elif isinstance(raw_val, (int, float, bool)) or raw_val is None:
                    out[key] = raw_val
                elif isinstance(raw_val, list):
                    out[key] = [
                        self._sanitize_input_text(item)
                        if isinstance(item, str)
                        else (self._sanitize_obj(item, depth=depth + 1) if isinstance(item, dict) else item)
                        for item in raw_val[:25]
                    ]
                elif isinstance(raw_val, dict):
                    out[key] = self._sanitize_obj(raw_val, depth=depth + 1)
                else:
                    out[key] = self._sanitize_input_text(str(raw_val))
            return out
        return {}

    def _sanitize_input_text(self, text: str) -> str:
        cleaned = re.sub(r"[\x00-\x08\x0B\x0C\x0E-\x1F]", " ", text)
        cleaned = re.sub(r"https?://\S+|www\.\S+", "[link]", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\b[\w\.-]+@[\w\.-]+\.\w+\b", "[email]", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        return cleaned[:3500]

    def _sanitize_output_text(self, text: str | None) -> str | None:
        if text is None:
            return None
        cleaned = self._sanitize_input_text(text)
        if not cleaned:
            return None
        return cleaned

    def _parse_json_list(self, content: str) -> list[dict[str, Any]] | None:
        cleaned = content.strip()
        if not cleaned:
            return None
        match = re.search(r"\[[\s\S]*\]", cleaned)
        candidate = match.group(0) if match else cleaned
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError:
            return None
        if not isinstance(parsed, list):
            return None
        out: list[dict[str, Any]] = []
        for item in parsed[:20]:
            if isinstance(item, dict):
                out.append(item)
        return out or None

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.core.config import settings

EXERCISE_SCHEMA_HINT = {
    "title": "string",
    "instructions": "string",
    "exercises": [{"number": 1, "prompt": "string", "answer": "string"}],
}

SYSTEM_PROMPT = (
    "You are a Brazilian elementary and middle school teacher creating printable exercise lists. "
    "The exercises must precisely match the student's age and difficulty level provided. "
    "For ages 5-8: use very simple sentences, concrete examples, and short words. "
    "For ages 9-12: use objective phrasing and practical everyday contexts (school, family, sports). "
    "For ages 13-18: use more formal language and abstract reasoning where appropriate. "
    "Always return valid JSON only — no markdown, no code fences, no commentary outside the JSON. "
    "Language: Brazilian Portuguese (pt-BR). "
    "Each exercise must have exactly one objectively correct answer in the answer key."
)


class ExerciseGenerationError(Exception):
    pass


@dataclass(frozen=True)
class ExerciseGenerationInput:
    subject: str
    topic: str
    age: int
    difficulty: str
    exercise_count: int


class ToolsExerciseGeneratorService:
    def __init__(self) -> None:
        self.model = settings.llm_model or "gpt-4o-mini"
        self.api_key = settings.llm_api_key or settings.openai_api_key

    def prompt_payload(self, data: ExerciseGenerationInput) -> dict[str, Any]:
        difficulty_guide = {
            "Facil": "single-step problems, direct questions, no multi-part reasoning",
            "Medio": "two-step problems, some inference required",
            "Dificil": "multi-step problems, abstract reasoning, application of concepts",
        }
        return {
            "task": "generate_printable_exercise_list",
            "locale": "pt-BR",
            "audience_age": data.age,
            "subject": data.subject,
            "topic": data.topic,
            "difficulty": data.difficulty,
            "exercise_count": data.exercise_count,
            "output_contract": EXERCISE_SCHEMA_HINT,
            "quality_rules": [
                f"Target age is {data.age} years old — calibrate vocabulary and sentence complexity precisely for this age.",
                f"Difficulty is '{data.difficulty}': {difficulty_guide.get(data.difficulty, 'adjust complexity to match the stated difficulty')}.",
                "Do NOT use the same exercise format consecutively (mix fill-in-the-blank, calculation, true/false, short answer).",
                "Each answer must be specific and gradeable without ambiguity — avoid open-ended answers.",
                "Use Brazilian school curriculum contexts (BNCC-aligned when possible).",
                "The 'instructions' field must be 1-2 sentences telling the student what to do, written directly to them.",
            ],
        }

    def generate(self, data: ExerciseGenerationInput) -> tuple[dict[str, Any], str]:
        if not self.api_key:
            return self._fallback(data), "fallback"
        generated = self._generate_with_openai(data)
        if generated is None:
            return self._fallback(data), "fallback"
        return generated, "llm"

    def _generate_with_openai(self, data: ExerciseGenerationInput) -> dict[str, Any] | None:
        body = {
            "model": self.model,
            "stream": False,
            "temperature": 0.3,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": json.dumps(self.prompt_payload(data), ensure_ascii=True),
                },
            ],
        }
        request = Request(
            "https://api.openai.com/v1/chat/completions",
            data=json.dumps(body, ensure_ascii=True).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urlopen(request, timeout=20.0) as response:
                raw = response.read().decode("utf-8", errors="replace")
        except (HTTPError, URLError, TimeoutError):
            return None

        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            return None
        if not isinstance(payload, dict):
            return None
        content = self._extract_content(payload)
        if content is None:
            return None
        parsed = self._parse_contract(content)
        if parsed is None:
            return None
        return parsed

    def _extract_content(self, payload: dict[str, Any]) -> str | None:
        choices = payload.get("choices")
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

    def _parse_contract(self, content: str) -> dict[str, Any] | None:
        json_candidate = content.strip()
        if not json_candidate:
            return None
        match = re.search(r"\{[\s\S]*\}", json_candidate)
        if match:
            json_candidate = match.group(0)
        try:
            parsed = json.loads(json_candidate)
        except json.JSONDecodeError:
            return None
        if not isinstance(parsed, dict):
            return None
        return self._normalize_contract(parsed)

    def _normalize_contract(self, parsed: dict[str, Any]) -> dict[str, Any] | None:
        title = str(parsed.get("title", "")).strip()
        instructions = str(parsed.get("instructions", "")).strip()
        raw_exercises = parsed.get("exercises")
        if not title or not instructions or not isinstance(raw_exercises, list):
            return None

        exercises: list[dict[str, Any]] = []
        for idx, item in enumerate(raw_exercises, start=1):
            if not isinstance(item, dict):
                continue
            prompt = str(item.get("prompt", "")).strip()
            answer = str(item.get("answer", "")).strip()
            if not prompt or not answer:
                continue
            exercises.append(
                {
                    "number": idx,
                    "prompt": prompt[:280],
                    "answer": answer[:160],
                }
            )
        if len(exercises) < 3:
            return None
        return {
            "title": title[:140],
            "instructions": instructions[:280],
            "exercises": exercises,
        }

    def _fallback(self, data: ExerciseGenerationInput) -> dict[str, Any]:
        exercises = []
        for idx in range(1, data.exercise_count + 1):
            exercises.append(
                {
                    "number": idx,
                    "prompt": (
                        f"({idx}) {data.subject} - {data.topic}: resolva um exercicio "
                        f"de nivel {data.difficulty.lower()} adequado para {data.age} anos."
                    ),
                    "answer": f"Resposta esperada {idx} (modelo).",
                }
            )
        return {
            "title": f"Lista de Exercicios - {data.subject} ({data.topic})",
            "instructions": (
                f"Aluno: resolva os itens com atencao. Faixa etaria: {data.age} anos. "
                f"Dificuldade: {data.difficulty}."
            ),
            "exercises": exercises,
        }


def build_axiora_pdf_html(
    *,
    title: str,
    instructions: str,
    exercises: list[dict[str, Any]],
    answer_key: list[dict[str, Any]],
) -> str:
    exercise_items = "".join(
        f'<div class="ex-item">'
        f'<span class="ex-num">{item["number"]}.</span>'
        f'<span class="ex-body">{sanitize_html(str(item["prompt"]))}</span>'
        f'</div>'
        for item in exercises
    )
    answer_items = "".join(
        f'<div class="ans-item">'
        f'<span class="ans-num">{item["number"]}.</span>'
        f'<span class="ans-body">{sanitize_html(str(item["answer"]))}</span>'
        f'</div>'
        for item in answer_key
    )
    safe_title = sanitize_html(title)
    safe_instructions = sanitize_html(instructions)
    return f"""<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{safe_title}</title>
  <style>
    @page {{ size: A4 portrait; margin: 18mm 20mm; }}
    *, *::before, *::after {{
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }}
    body {{
      font-family: 'Courier New', Courier, monospace;
      font-size: 13px;
      color: #111;
      background: #fff;
      line-height: 1.65;
    }}

    /* ── BRAND BAR ─────────────────────────────────── */
    .brand-bar {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }}
    .brand-name {{
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 2.5px;
      text-transform: uppercase;
      color: #ee8748;
    }}
    .brand-tagline {{
      font-size: 9.5px;
      color: #999;
      letter-spacing: 0.4px;
    }}

    /* ── DOCUMENT TITLE ────────────────────────────── */
    .doc-title {{
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 20px;
      font-weight: 700;
      text-align: center;
      color: #111;
      letter-spacing: 0.2px;
      margin-bottom: 6px;
    }}
    .rule-double {{ height: 2px; background: #111; margin: 6px 0 2px; }}
    .rule-single {{ height: 1px; background: #111; margin: 2px 0 12px; }}
    .rule-gray   {{ height: 1px; background: #bbb; margin: 8px 0 14px; }}

    /* ── STUDENT FIELDS ────────────────────────────── */
    .fields-row {{
      display: flex;
      align-items: baseline;
      font-size: 12px;
      margin-bottom: 4px;
      gap: 0;
    }}
    .field-label {{ white-space: nowrap; flex-shrink: 0; }}
    .field-line {{
      flex: 1;
      border-bottom: 1px solid #555;
      min-width: 60px;
      display: inline-block;
      vertical-align: bottom;
    }}
    .field-fixed {{ white-space: nowrap; flex-shrink: 0; margin-left: 28px; }}
    .field-underline {{
      display: inline-block;
      border-bottom: 1px solid #555;
      vertical-align: bottom;
    }}

    /* ── INSTRUCTIONS ──────────────────────────────── */
    .instructions {{
      font-size: 12px;
      font-style: italic;
      color: #444;
      margin-bottom: 14px;
      padding: 7px 0;
      border-top: 1px solid #ddd;
      border-bottom: 1px solid #ddd;
    }}

    /* ── SECTION HEADER ────────────────────────────── */
    .sec-head {{
      font-family: 'Courier New', Courier, monospace;
      font-size: 10.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: #111;
      margin-bottom: 12px;
      padding-bottom: 4px;
      border-bottom: 1px solid #ccc;
    }}

    /* ── EXERCISE ITEMS ────────────────────────────── */
    .ex-item {{
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin-bottom: 16px;
      break-inside: avoid;
      page-break-inside: avoid;
    }}
    .ex-num {{
      flex-shrink: 0;
      min-width: 24px;
      font-weight: 700;
      color: #111;
    }}
    .ex-body {{
      flex: 1;
      min-width: 0;
    }}

    /* ── ANSWER KEY ────────────────────────────────── */
    .answer-block {{
      margin-top: 22px;
      padding: 14px 18px;
      border: 1.5px dashed #aaa;
      background: #f9f8f6;
      break-inside: avoid;
      page-break-inside: avoid;
    }}
    .ans-sec-head {{
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: #666;
      margin-bottom: 10px;
    }}
    .ans-item {{
      display: flex;
      align-items: flex-start;
      gap: 8px;
      font-size: 12px;
      color: #333;
      margin-bottom: 5px;
    }}
    .ans-num {{
      flex-shrink: 0;
      min-width: 20px;
      font-weight: 700;
      color: #666;
    }}
    .ans-body {{ flex: 1; }}

    /* ── FOOTER ────────────────────────────────────── */
    .page-footer {{
      margin-top: 22px;
      padding-top: 7px;
      border-top: 1px solid #ddd;
      display: flex;
      justify-content: space-between;
      font-size: 9.5px;
      color: #aaa;
      letter-spacing: 0.4px;
    }}

    @media print {{
      body {{ background: #fff; }}
    }}
  </style>
</head>
<body>

  <div class="brand-bar">
    <span class="brand-name">Axiora Tools</span>
    <span class="brand-tagline">Material para uso educacional</span>
  </div>

  <div class="doc-title">{safe_title}</div>
  <div class="rule-double"></div>
  <div class="rule-single"></div>

  <div class="fields-row">
    <span class="field-label">Nome:&nbsp;</span>
    <span class="field-line">&nbsp;</span>
    <span class="field-fixed">Data:&nbsp;<span class="field-underline" style="min-width:18px">&nbsp;</span>/<span class="field-underline" style="min-width:18px">&nbsp;</span>/<span class="field-underline" style="min-width:32px">&nbsp;</span></span>
  </div>
  <div class="fields-row" style="margin-top:4px;">
    <span class="field-label">Turma:&nbsp;</span>
    <span class="field-line" style="max-width:180px;">&nbsp;</span>
    <span style="flex:1;"></span>
    <span class="field-fixed">Nota:&nbsp;<span class="field-underline" style="min-width:56px">&nbsp;</span></span>
  </div>
  <div class="rule-gray"></div>

  <div class="instructions">{safe_instructions}</div>

  <div class="sec-head">Exercícios</div>
  {exercise_items}

  <div class="answer-block">
    <div class="ans-sec-head">Gabarito</div>
    {answer_items}
  </div>

  <div class="page-footer">
    <span>Axiora Tools &middot; axiora.com.br</span>
    <span>Reprodução livre para fins pedagógicos</span>
  </div>

</body>
</html>"""


def sanitize_html(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )

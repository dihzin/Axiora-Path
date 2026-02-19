from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Any

from sqlalchemy import text

from app.db.session import SessionLocal

SEED_TAG = "seed_hybrid_templates_v1"


@dataclass(frozen=True)
class SkillRow:
    id: str
    age_group: str
    subject_name: str


@dataclass(frozen=True)
class SeedPlan:
    subject_name: str
    age_groups: tuple[str, ...]
    total: int
    template_types: tuple[str, ...]


PLANS: tuple[SeedPlan, ...] = (
    SeedPlan(
        subject_name="Matemática",
        age_groups=("6-8", "9-12"),
        total=60,
        template_types=("MATH_ARITH", "MATH_WORDPROB"),
    ),
    SeedPlan(
        subject_name="Português",
        age_groups=("6-8", "9-12"),
        total=40,
        template_types=("PT_SENTENCE_ORDER", "PT_PUNCTUATION", "PT_SYLLABLES"),
    ),
    SeedPlan(
        subject_name="Inglês",
        age_groups=("9-12",),
        total=20,
        template_types=("EN_VOCAB",),
    ),
)


def _difficulty_for(*, age_group: str, index: int) -> str:
    if age_group == "6-8":
        return "EASY" if index % 4 != 0 else "MEDIUM"
    if age_group == "9-12":
        sequence = ("EASY", "MEDIUM", "MEDIUM", "HARD")
        return sequence[index % len(sequence)]
    return "HARD"


def _template_specs(template_type: str, age_group: str, index: int) -> tuple[str, str, dict[str, Any], dict[str, Any]]:
    if template_type == "MATH_ARITH":
        max_value = 20 if age_group == "6-8" else 60
        prompt = "Quanto é {{a}} {{op}} {{b}}?"
        explanation = "Voce combinou {{a}} e {{b}} com cuidado e encontrou {{answer}}."
        generator = {
            "a": {"min": 1, "max": max_value},
            "b": {"min": 1, "max": max_value},
            "op": {"values": ["+", "-"], "weights": [0.7, 0.3]},
            "noNegative": True,
        }
        renderer = {"choices": {"count": 4, "strategy": "nearby_numbers"}, "correctKey": "answer"}
        return prompt, explanation, generator, renderer

    if template_type == "MATH_WORDPROB":
        max_value = 15 if age_group == "6-8" else 35
        names = ["Lia", "Noa", "Bia", "Rafa", "Sofia", "Davi"]
        contexts = ["figurinhas", "livros", "adesivos", "cartas", "blocos"]
        prompt = "{{name}} tinha {{a}} {{context}} e ganhou {{b}}. Quantos tem agora?"
        explanation = "{{name}} somou {{a}} com {{b}} e chegou a {{answer}}."
        generator = {
            "a": {"min": 1, "max": max_value},
            "b": {"min": 1, "max": max_value},
            "name": {"values": names, "weights": [1, 1, 1, 1, 1, 1]},
            "context": {"values": contexts, "weights": [1, 1, 1, 1, 1]},
            "op": {"values": ["+"], "weights": [1]},
        }
        renderer = {"choices": {"count": 4, "strategy": "nearby_numbers"}, "correctKey": "answer"}
        return prompt, explanation, generator, renderer

    if template_type == "PT_SENTENCE_ORDER":
        prompt = "Organize as partes para formar uma frase correta sobre {{tema}}."
        explanation = "Muito bem! A frase organizada ficou clara e com sentido."
        generator = {
            "tema": {
                "values": ["amizade", "escola", "leitura", "natureza", "respeito"],
                "weights": [1, 1, 1, 1, 1],
            }
        }
        renderer = {"mode": "sentence_order", "correctKey": "answer"}
        return prompt, explanation, generator, renderer

    if template_type == "PT_PUNCTUATION":
        prompt = "Complete com a pontuação correta: {{frase}} __"
        explanation = "Ótimo cuidado com a pontuação. Isso deixa o texto mais claro."
        generator = {
            "frase": {
                "values": ["Que dia legal", "Vamos começar agora", "Olha que surpresa"],
                "weights": [1, 1, 1],
            },
            "answer": {"values": ["!"], "weights": [1]},
        }
        renderer = {"mode": "fill_blank", "correctKey": "answer"}
        return prompt, explanation, generator, renderer

    if template_type == "PT_SYLLABLES":
        words = ["janela", "caderno", "pipoca", "comunidade", "historia"]
        prompt = "Quantas sílabas tem a palavra '{{word}}'?"
        explanation = "Separando com calma, você encontrou a quantidade correta de sílabas."
        generator = {"word": {"values": words, "weights": [1, 1, 1, 1, 1]}, "answer": {"min": 2, "max": 5}}
        renderer = {"choices": {"count": 4, "strategy": "nearby_numbers"}, "correctKey": "answer"}
        return prompt, explanation, generator, renderer

    # EN_VOCAB
    words = [
        ("apple", "maçã"),
        ("book", "livro"),
        ("school", "escola"),
        ("friend", "amigo"),
        ("water", "água"),
    ]
    pair = words[index % len(words)]
    prompt = "Escolha a tradução correta de '{{word_en}}'."
    explanation = "Great! '{{word_en}}' significa '{{word_pt}}'."
    generator = {
        "word_en": {"values": [pair[0]], "weights": [1]},
        "word_pt": {"values": [pair[1]], "weights": [1]},
        "answer": {"values": [pair[1]], "weights": [1]},
    }
    renderer = {"mode": "vocab_choice", "correctKey": "answer"}
    return prompt, explanation, generator, renderer


def _fetch_skills(subject_name: str, age_groups: tuple[str, ...]) -> list[SkillRow]:
    with SessionLocal() as db:
        rows = db.execute(
            text(
                """
                SELECT sk.id::text AS id,
                       s.age_group::text AS age_group,
                       s.name AS subject_name
                FROM skills sk
                JOIN subjects s ON s.id = sk.subject_id
                WHERE s.name = :subject_name
                  AND s.age_group::text = ANY(:age_groups)
                ORDER BY s.age_group::text, sk."order"
                """
            ),
            {"subject_name": subject_name, "age_groups": list(age_groups)},
        ).all()
    return [SkillRow(id=str(r.id), age_group=str(r.age_group), subject_name=str(r.subject_name)) for r in rows]


def _clear_previous_seed() -> tuple[int, int, int]:
    with SessionLocal() as db:
        template_ids = db.execute(
            text("SELECT id::text FROM question_templates WHERE :seed_tag = ANY(tags)"),
            {"seed_tag": SEED_TAG},
        ).scalars().all()
        if not template_ids:
            return 0, 0, 0

        generated_ids = db.execute(
            text("SELECT id::text FROM generated_variants WHERE template_id = ANY(:template_ids::uuid[])"),
            {"template_ids": template_ids},
        ).scalars().all()

        history_deleted = db.execute(
            text(
                """
                DELETE FROM user_question_history
                WHERE template_id = ANY(:template_ids::uuid[])
                   OR generated_variant_id = ANY(:generated_ids::uuid[])
                """
            ),
            {
                "template_ids": template_ids,
                "generated_ids": generated_ids if generated_ids else ["00000000-0000-0000-0000-000000000000"],
            },
        ).rowcount or 0
        variants_deleted = db.execute(
            text("DELETE FROM generated_variants WHERE template_id = ANY(:template_ids::uuid[])"),
            {"template_ids": template_ids},
        ).rowcount or 0
        templates_deleted = db.execute(
            text("DELETE FROM question_templates WHERE id = ANY(:template_ids::uuid[])"),
            {"template_ids": template_ids},
        ).rowcount or 0
        db.commit()
    return int(templates_deleted), int(variants_deleted), int(history_deleted)


def _insert_template(
    *,
    skill_id: str,
    difficulty: str,
    template_type: str,
    prompt_template: str,
    explanation_template: str,
    generator_spec: dict[str, Any],
    renderer_spec: dict[str, Any],
    tags: list[str],
) -> None:
    with SessionLocal() as db:
        db.execute(
            text(
                """
                INSERT INTO question_templates
                    (skill_id, lesson_id, difficulty, template_type, prompt_template, explanation_template, generator_spec, renderer_spec, tags)
                VALUES
                    (
                        CAST(:skill_id AS uuid),
                        NULL,
                        :difficulty,
                        :template_type,
                        :prompt_template,
                        :explanation_template,
                        CAST(:generator_spec AS jsonb),
                        CAST(:renderer_spec AS jsonb),
                        CAST(:tags AS text[])
                    )
                """
            ),
            {
                "skill_id": skill_id,
                "difficulty": difficulty,
                "template_type": template_type,
                "prompt_template": prompt_template,
                "explanation_template": explanation_template,
                "generator_spec": json.dumps(generator_spec),
                "renderer_spec": json.dumps(renderer_spec),
                "tags": tags,
            },
        )
        db.commit()


def run_seed() -> None:
    deleted_templates, deleted_variants, deleted_history = _clear_previous_seed()
    inserted = 0
    skills_total = 0

    for plan in PLANS:
        skills = _fetch_skills(plan.subject_name, plan.age_groups)
        if not skills:
            print(f"Sem skills para {plan.subject_name} {plan.age_groups}. Rode seed estrutural antes.")
            continue
        skills_total += len(skills)

        for index in range(plan.total):
            skill = skills[index % len(skills)]
            template_type = plan.template_types[index % len(plan.template_types)]
            difficulty = _difficulty_for(age_group=skill.age_group, index=index)
            prompt, explanation, generator, renderer = _template_specs(template_type, skill.age_group, index)
            tags = [
                SEED_TAG,
                f"subject:{plan.subject_name.lower()}",
                f"age:{skill.age_group}",
                f"type:{template_type.lower()}",
                "hybrid_runtime",
            ]
            _insert_template(
                skill_id=skill.id,
                difficulty=difficulty,
                template_type=template_type,
                prompt_template=prompt,
                explanation_template=explanation,
                generator_spec=generator,
                renderer_spec=renderer,
                tags=tags,
            )
            inserted += 1

    print("=== HYBRID TEMPLATE SEED RESULT ===")
    print(f"deleted_templates: {deleted_templates}")
    print(f"deleted_generated_variants: {deleted_variants}")
    print(f"deleted_history_rows: {deleted_history}")
    print(f"skills_seen: {skills_total}")
    print(f"templates_inserted: {inserted}")


def main() -> None:
    run_seed()


if __name__ == "__main__":
    main()

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy import text

from app.db.session import SessionLocal

SEED_TAG = "seed_qbank_v1"
TARGET_SUBJECTS = ("Matemática", "Português")
QUESTIONS_PER_SKILL = 6
VARIANTS_PER_QUESTION = 4  # 3..10 requerido


@dataclass(frozen=True)
class SkillRow:
    id: str
    name: str
    subject_name: str
    age_group: str


def _pick(items: list[str], seed: int) -> str:
    return items[seed % len(items)]


def _difficulty_for(age_group: str, template_index: int) -> str:
    if age_group == "6-8":
        return "EASY" if template_index <= 3 else "MEDIUM"
    if age_group == "9-12":
        sequence = ("EASY", "MEDIUM", "MEDIUM", "HARD", "MEDIUM", "HARD")
        return sequence[template_index % len(sequence)]
    sequence = ("MEDIUM", "MEDIUM", "HARD", "HARD", "MEDIUM", "HARD")
    return sequence[template_index % len(sequence)]


def _math_contexts(age_group: str) -> list[str]:
    if age_group == "6-8":
        return ["figurinhas", "blocos coloridos", "adesivos", "bolinhas de gude", "frutas"]
    if age_group == "9-12":
        return ["camisas do time", "ingressos", "kits escolares", "livros", "cartas colecionáveis"]
    return ["planilhas de estudo", "custos de projeto", "simulado", "pontos em campeonato", "tempo de treino"]


def _names(age_group: str) -> list[str]:
    if age_group == "6-8":
        return ["Lia", "Noa", "Bia", "Téo", "Yuri"]
    if age_group == "9-12":
        return ["Ana", "Davi", "Rafa", "Sofia", "Lucas"]
    return ["Clara", "Miguel", "Valentina", "Heitor", "Nina"]


def _pt_texts(age_group: str) -> list[dict[str, Any]]:
    if age_group == "6-8":
        return [
            {"title": "Dia de parque", "text": "Lia levou uma bola e brincou com os amigos no parque.", "question": "Onde Lia brincou?", "options": [("a", "No parque"), ("b", "Na escola"), ("c", "No mercado")], "correct": "a"},
            {"title": "Hora da leitura", "text": "Téo escolheu um livro de aventuras e leu com atenção.", "question": "O que Téo escolheu?", "options": [("a", "Um jogo"), ("b", "Um livro"), ("c", "Um brinquedo")], "correct": "b"},
        ]
    if age_group == "9-12":
        return [
            {"title": "Mutirão da turma", "text": "A turma organizou a biblioteca e separou os livros por tema.", "question": "Qual foi a ação da turma?", "options": [("a", "Pintar a quadra"), ("b", "Organizar a biblioteca"), ("c", "Viajar")], "correct": "b"},
            {"title": "Feira de ciências", "text": "Rafa apresentou um experimento simples sobre reciclagem.", "question": "Sobre o que era o experimento?", "options": [("a", "Reciclagem"), ("b", "Astronomia"), ("c", "Culinária")], "correct": "a"},
        ]
    return [
        {"title": "Projeto colaborativo", "text": "O grupo criou um plano para reduzir desperdícios na escola.", "question": "Qual era o objetivo do plano?", "options": [("a", "Aumentar desperdícios"), ("b", "Reduzir desperdícios"), ("c", "Cancelar aulas")], "correct": "b"},
        {"title": "Clube de leitura", "text": "Os estudantes debateram argumentos e pontos de vista de um conto.", "question": "O que os estudantes debateram?", "options": [("a", "Receitas"), ("b", "Pontos de vista"), ("c", "Horário de jogos")], "correct": "b"},
    ]


def _math_variant(template_index: int, age_group: str, seed: int) -> dict[str, Any]:
    name = _pick(_names(age_group), seed)
    context = _pick(_math_contexts(age_group), seed + 1)
    base = 4 + (seed % 11)
    inc = 2 + (seed % 7)

    if template_index == 0:
        a = base + 3
        b = inc + 2
        answer = a + b
        options = [answer, answer - 2, answer + 3]
        return {
            "prompt": f"{name} tinha {a} {context} e ganhou mais {b}. Com quantas ficou?",
            "metadata": {
                "options": [
                    {"id": "a", "label": str(options[0])},
                    {"id": "b", "label": str(options[1])},
                    {"id": "c", "label": str(options[2])},
                ],
                "correctOptionId": "a",
            },
        }

    if template_index == 1:
        total = (base + 2) * 3
        divisor = 3
        answer = total // divisor
        return {
            "prompt": f"{name} dividiu {total} {context} em {divisor} grupos iguais. Quantos em cada grupo?",
            "metadata": {
                "placeholder": "Digite o resultado",
                "answer": str(answer),
            },
        }

    if template_index == 2:
        start = base
        step = 2 + (seed % 3)
        missing = start + (step * 3)
        return {
            "prompt": f"Complete a sequência: {start}, {start + step}, {start + step * 2}, __, {start + step * 4}",
            "metadata": {
                "options": [
                    {"id": "a", "label": str(missing)},
                    {"id": "b", "label": str(missing + 1)},
                    {"id": "c", "label": str(missing - 2)},
                ],
                "correctOptionId": "a",
            },
        }

    if template_index == 3:
        left = base + 9
        right = base + 4
        statement = f"{left} é menor que {right}."
        return {
            "prompt": f"Verdadeiro ou falso: {statement}",
            "metadata": {
                "options": [
                    {"id": "true", "label": "Verdadeiro"},
                    {"id": "false", "label": "Falso"},
                ],
                "correctOptionId": "false",
            },
        }

    if template_index == 4:
        pairs = [
            {"itemId": "i1", "itemLabel": f"{base}+{inc}", "targetId": "t1", "targetLabel": str(base + inc)},
            {"itemId": "i2", "itemLabel": f"{base + 6}-{inc}", "targetId": "t2", "targetLabel": str(base + 6 - inc)},
            {"itemId": "i3", "itemLabel": f"{(base // 2) + 2}x2", "targetId": "t3", "targetLabel": str(((base // 2) + 2) * 2)},
        ]
        return {
            "prompt": "Relacione cada expressão ao resultado correto.",
            "metadata": {"pairs": pairs, "variant": "DRAG_DROP"},
        }

    numbers = [base + 7, base + 1, base + 4, base + 9]
    sorted_numbers = sorted(numbers)
    return {
        "prompt": f"Organize em ordem crescente: {', '.join(str(n) for n in numbers)}",
        "metadata": {
            "items": [str(n) for n in numbers],
            "correctOrder": [str(n) for n in sorted_numbers],
        },
    }


def _pt_variant(template_index: int, age_group: str, seed: int) -> dict[str, Any]:
    names = _names(age_group)
    name = _pick(names, seed)

    words_by_age = {
        "6-8": ["bo-la", "ca-sa", "ja-ne-la", "bo-ne-ca", "la-pis"],
        "9-12": ["ca-der-no", "es-co-la", "pro-je-to", "co-la-bo-rar", "co-mu-ni-da-de"],
        "13-15": ["ar-gu-men-to", "con-si-de-ra-ção", "re-vi-são", "coe-rên-cia", "in-ter-pre-ta-ção"],
    }
    punct_by_age = {
        "6-8": "Que legal",
        "9-12": "Vamos começar agora",
        "13-15": "Precisamos revisar este texto",
    }
    sentence_sets = {
        "6-8": ["no parque", "Lia brincou", "com seus amigos"],
        "9-12": ["a turma", "organizou os livros", "na biblioteca"],
        "13-15": ["o grupo", "apresentou argumentos", "com clareza"],
    }

    if template_index == 0:
        word = _pick(words_by_age[age_group], seed + 2)
        syllables = len(word.split("-"))
        return {
            "prompt": f"Quantas sílabas tem a palavra '{word.replace('-', '')}'?",
            "metadata": {
                "options": [
                    {"id": "a", "label": str(syllables)},
                    {"id": "b", "label": str(max(1, syllables - 1))},
                    {"id": "c", "label": str(syllables + 1)},
                ],
                "correctOptionId": "a",
            },
        }

    if template_index == 1:
        phrase = punct_by_age[age_group]
        return {
            "prompt": f"Complete com a pontuação adequada: {phrase} __",
            "metadata": {
                "placeholder": "Digite o sinal",
                "answer": "!",
            },
        }

    if template_index == 2:
        parts = sentence_sets[age_group]
        shuffled = [parts[1], parts[2], parts[0]]
        return {
            "prompt": "Organize os trechos para formar uma frase correta.",
            "metadata": {
                "items": shuffled,
                "correctOrder": parts,
            },
        }

    if template_index == 3:
        text_obj = _pt_texts(age_group)[seed % len(_pt_texts(age_group))]
        return {
            "prompt": f"{text_obj['text']} {text_obj['question']}",
            "metadata": {
                "readingTitle": text_obj["title"],
                "options": [{"id": oid, "label": label} for oid, label in text_obj["options"]],
                "correctOptionId": text_obj["correct"],
            },
        }

    if template_index == 4:
        statement = f"{name} revisou a frase antes de entregar."
        return {
            "prompt": f"Verdadeiro ou falso: '{statement}' indica cuidado com a escrita.",
            "metadata": {
                "options": [
                    {"id": "true", "label": "Verdadeiro"},
                    {"id": "false", "label": "Falso"},
                ],
                "correctOptionId": "true",
            },
        }

    pairs = [
        {"itemId": "i1", "itemLabel": "frase", "targetId": "t1", "targetLabel": "começa com letra maiúscula"},
        {"itemId": "i2", "itemLabel": "pergunta", "targetId": "t2", "targetLabel": "termina com ?"},
        {"itemId": "i3", "itemLabel": "exclamação", "targetId": "t3", "targetLabel": "expressa emoção"},
    ]
    return {
        "prompt": "Relacione cada elemento da linguagem à sua característica.",
        "metadata": {"pairs": pairs, "variant": "MATCH"},
    }


def _question_type_for_template(template_index: int) -> str:
    mapping = {
        0: "MCQ",
        1: "FILL_BLANK",
        2: "MCQ",
        3: "TRUE_FALSE",
        4: "DRAG_DROP",
        5: "ORDERING",
    }
    return mapping[template_index]


def _fetch_target_skills() -> list[SkillRow]:
    with SessionLocal() as db:
        rows = db.execute(
            text(
                """
                SELECT sk.id::text AS id,
                       sk.name AS skill_name,
                       s.name AS subject_name,
                       s.age_group::text AS age_group
                FROM skills sk
                JOIN subjects s ON s.id = sk.subject_id
                WHERE s.name = ANY(:subjects)
                ORDER BY s.age_group::text, s.name, sk."order"
                """
            ),
            {"subjects": list(TARGET_SUBJECTS)},
        ).all()
    return [
        SkillRow(
            id=row.id,
            name=row.skill_name,
            subject_name=row.subject_name,
            age_group=row.age_group,
        )
        for row in rows
    ]


def _delete_previous_seed() -> tuple[int, int, int]:
    with SessionLocal() as db:
        seeded_questions = db.execute(
            text(
                """
                SELECT id::text
                FROM questions
                WHERE :seed_tag = ANY(tags)
                """
            ),
            {"seed_tag": SEED_TAG},
        ).scalars().all()

        if not seeded_questions:
            return 0, 0, 0

        question_ids = list(seeded_questions)
        variant_ids = db.execute(
            text(
                """
                SELECT id::text
                FROM question_variants
                WHERE question_id = ANY(:question_ids::uuid[])
                """
            ),
            {"question_ids": question_ids},
        ).scalars().all()

        deleted_history = db.execute(
            text(
                """
                DELETE FROM user_question_history
                WHERE question_id = ANY(:question_ids::uuid[])
                   OR (:has_variants AND variant_id = ANY(:variant_ids::uuid[]))
                """
            ),
            {
                "question_ids": question_ids,
                "has_variants": len(variant_ids) > 0,
                "variant_ids": variant_ids if variant_ids else ["00000000-0000-0000-0000-000000000000"],
            },
        ).rowcount or 0

        deleted_variants = db.execute(
            text(
                """
                DELETE FROM question_variants
                WHERE question_id = ANY(:question_ids::uuid[])
                """
            ),
            {"question_ids": question_ids},
        ).rowcount or 0

        deleted_questions = db.execute(
            text(
                """
                DELETE FROM questions
                WHERE id = ANY(:question_ids::uuid[])
                """
            ),
            {"question_ids": question_ids},
        ).rowcount or 0
        db.commit()
        return deleted_questions, deleted_variants, deleted_history


def _insert_question(
    *,
    skill_id: str,
    qtype: str,
    difficulty: str,
    prompt: str,
    explanation: str,
    metadata: dict[str, Any],
    tags: list[str],
) -> str:
    with SessionLocal() as db:
        question_id = db.execute(
            text(
                """
                INSERT INTO questions (skill_id, lesson_id, type, difficulty, prompt, explanation, metadata, tags)
                VALUES (CAST(:skill_id AS uuid), NULL, :type, :difficulty, :prompt, :explanation, :metadata, :tags)
                RETURNING id::text
                """
            ),
            {
                "skill_id": skill_id,
                "type": qtype,
                "difficulty": difficulty,
                "prompt": prompt,
                "explanation": explanation,
                "metadata": metadata,
                "tags": tags,
            },
        ).scalar_one()
        db.commit()
        return str(question_id)


def _insert_variant(
    *,
    question_id: str,
    variant_data: dict[str, Any],
    difficulty_override: str | None,
) -> None:
    with SessionLocal() as db:
        db.execute(
            text(
                """
                INSERT INTO question_variants (question_id, variant_data, difficulty_override)
                VALUES (CAST(:question_id AS uuid), :variant_data, :difficulty_override)
                """
            ),
            {
                "question_id": question_id,
                "variant_data": variant_data,
                "difficulty_override": difficulty_override,
            },
        )
        db.commit()


def run_seed() -> None:
    deleted_q, deleted_v, deleted_h = _delete_previous_seed()
    skills = _fetch_target_skills()
    if not skills:
        print("Nenhuma skill encontrada para Matemática/Português. Rode primeiro o seed estrutural.")
        return

    created_questions = 0
    created_variants = 0

    for skill_index, skill in enumerate(skills):
        for question_index in range(QUESTIONS_PER_SKILL):
            template_index = question_index % 6
            difficulty = _difficulty_for(skill.age_group, template_index)
            qtype = _question_type_for_template(template_index)

            base_seed = (skill_index + 1) * 100 + question_index * 17
            if skill.subject_name == "Matemática":
                variants = [
                    _math_variant(template_index, skill.age_group, base_seed + variant_slot * 13)
                    for variant_slot in range(VARIANTS_PER_QUESTION)
                ]
                explanation = (
                    "Use estratégia por etapas, confira o resultado e compare com o contexto do problema."
                )
            else:
                variants = [
                    _pt_variant(template_index, skill.age_group, base_seed + variant_slot * 11)
                    for variant_slot in range(VARIANTS_PER_QUESTION)
                ]
                explanation = (
                    "Leia com atenção, observe pistas do enunciado e escolha a alternativa mais coerente."
                )

            base_variant = variants[0]
            tags = [
                SEED_TAG,
                "template_based",
                f"subject:{skill.subject_name.lower()}",
                f"age:{skill.age_group}",
                f"skill:{skill.name.lower().replace(' ', '_')}",
                f"template:{template_index}",
            ]

            question_id = _insert_question(
                skill_id=skill.id,
                qtype=qtype,
                difficulty=difficulty,
                prompt=base_variant["prompt"],
                explanation=explanation,
                metadata=base_variant["metadata"],
                tags=tags,
            )
            created_questions += 1

            for variant_slot, variant in enumerate(variants):
                variant_data = {
                    "seedKey": f"{SEED_TAG}:{skill.id}:{question_index}:{variant_slot}",
                    "prompt": variant["prompt"],
                    "metadata": variant["metadata"],
                }
                difficulty_override = None
                if variant_slot == 1 and difficulty == "MEDIUM":
                    difficulty_override = "EASY"
                if variant_slot == 3 and difficulty in ("EASY", "MEDIUM"):
                    difficulty_override = "HARD" if skill.age_group != "6-8" else "MEDIUM"

                _insert_variant(
                    question_id=question_id,
                    variant_data=variant_data,
                    difficulty_override=difficulty_override,
                )
                created_variants += 1

    print("=== QUESTION BANK SEED RESULT (Math + Portuguese) ===")
    print(f"deleted_seeded_questions: {deleted_q}")
    print(f"deleted_seeded_variants: {deleted_v}")
    print(f"deleted_seeded_history: {deleted_h}")
    print(f"skills_targeted: {len(skills)}")
    print(f"questions_created: {created_questions}")
    print(f"variants_created: {created_variants}")


def main() -> None:
    run_seed()


if __name__ == "__main__":
    main()

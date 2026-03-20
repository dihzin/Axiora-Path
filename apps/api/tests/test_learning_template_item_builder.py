from __future__ import annotations

from app.models import (
    GeneratedVariant,
    Question,
    QuestionDifficulty,
    QuestionType,
    QuestionVariant,
    QuestionTemplate,
    QuestionTemplateType,
)
from app.services.adaptive_learning import (
    _build_question_item,
    _build_template_item,
    _effective_question_difficulty,
)


def _ordering_is_trivial_adjacent_swap(labels: list[str], correct_order: list[str]) -> bool:
    if labels == correct_order:
        return True
    mismatches = [index for index, (label, correct) in enumerate(zip(labels, correct_order, strict=True)) if label != correct]
    if len(mismatches) != 2:
        return False
    left, right = mismatches
    return right == left + 1 and labels[left] == correct_order[right] and labels[right] == correct_order[left]


def test_build_template_item_pt_syllables_does_not_raise_unbound_variables() -> None:
    template = QuestionTemplate(
        id="00000000-0000-0000-0000-000000000101",
        skill_id="00000000-0000-0000-0000-000000000201",
        lesson_id=17,
        difficulty=QuestionDifficulty.EASY,
        template_type=QuestionTemplateType.PT_SYLLABLES,
        prompt_template="",
        explanation_template="",
        generator_spec={},
        renderer_spec={},
        tags=[],
    )
    variant = GeneratedVariant(
        id="00000000-0000-0000-0000-000000000301",
        user_id=1,
        template_id=template.id,
        seed="seed",
        variant_data={
            "variables": {"word": "janela"},
            "metadata": {},
            "prompt": "",
        },
    )

    item = _build_template_item(template=template, generated_variant=variant)

    assert "janela" in item.prompt
    assert item.metadata.get("answer") == "3"


def test_build_template_item_en_vocab_creates_options_when_renderer_does_not_supply_them() -> None:
    template = QuestionTemplate(
        id="00000000-0000-0000-0000-000000000102",
        skill_id="00000000-0000-0000-0000-000000000202",
        lesson_id=18,
        difficulty=QuestionDifficulty.EASY,
        template_type=QuestionTemplateType.EN_VOCAB,
        prompt_template="",
        explanation_template="",
        generator_spec={},
        renderer_spec={},
        tags=[],
    )
    variant = GeneratedVariant(
        id="00000000-0000-0000-0000-000000000302",
        user_id=1,
        template_id=template.id,
        seed="seed",
        variant_data={
            "variables": {"word_en": "school", "word_pt": "escola", "answer": "escola"},
            "metadata": {"answer": "escola"},
            "prompt": "Escolha a tradução correta de 'school'.",
        },
    )

    item = _build_template_item(template=template, generated_variant=variant)

    assert item.prompt == "Escolha a tradução correta de 'school'."
    assert item.metadata.get("correctOptionId") in {"a", "b", "c"}
    options = item.metadata.get("options")
    assert isinstance(options, list) and len(options) >= 3
    labels = {entry.get("label") for entry in options if isinstance(entry, dict)}
    assert "escola" in labels


def test_build_question_item_infers_ordering_type_from_metadata() -> None:
    question = Question(
        id="00000000-0000-0000-0000-000000000103",
        skill_id="00000000-0000-0000-0000-000000000203",
        lesson_id=19,
        type=QuestionType.MCQ,
        difficulty=QuestionDifficulty.EASY,
        prompt="Organize os trechos para formar uma frase correta.",
        explanation=None,
        metadata_json={
            "items": ["Lia brincou", "com seus amigos", "no parque"],
            "correctOrder": ["no parque", "Lia brincou", "com seus amigos"],
        },
        tags=[],
    )
    variant = QuestionVariant(
        id="00000000-0000-0000-0000-000000000303",
        question_id=question.id,
        variant_data={},
    )

    item = _build_question_item(question=question, variant=variant)

    assert item.type == QuestionType.ORDERING
    assert item.metadata.get("correctOrder") == ["no parque", "Lia brincou", "com seus amigos"]
    items = item.metadata.get("items")
    assert isinstance(items, list) and len(items) == 3
    assert all(isinstance(entry, dict) for entry in items)
    assert sorted(int(entry.get("correctOrder")) for entry in items) == [1, 2, 3]
    labels = [str(entry.get("label")) for entry in items]
    assert not _ordering_is_trivial_adjacent_swap(labels, item.metadata["correctOrder"])


def test_build_template_item_pt_sentence_order_creates_ordering_metadata() -> None:
    template = QuestionTemplate(
        id="00000000-0000-0000-0000-000000000104",
        skill_id="00000000-0000-0000-0000-000000000204",
        lesson_id=20,
        difficulty=QuestionDifficulty.EASY,
        template_type=QuestionTemplateType.PT_SENTENCE_ORDER,
        prompt_template="Organize as partes para formar uma frase correta sobre {{tema}}.",
        explanation_template="",
        generator_spec={},
        renderer_spec={"mode": "sentence_order"},
        tags=[],
    )
    variant = GeneratedVariant(
        id="00000000-0000-0000-0000-000000000304",
        user_id=1,
        template_id=template.id,
        seed="seed",
        variant_data={
            "variables": {"tema": "amizade"},
            "metadata": {},
            "prompt": "Organize as partes para formar uma frase correta sobre amizade.",
        },
    )

    item = _build_template_item(template=template, generated_variant=variant)

    assert item.type == QuestionType.ORDERING
    assert item.metadata.get("correctOrder")
    items = item.metadata.get("items")
    assert isinstance(items, list) and len(items) == 3
    assert all(isinstance(entry, dict) for entry in items)
    assert [entry.get("label") for entry in sorted(items, key=lambda entry: int(entry["correctOrder"]))] == item.metadata.get("correctOrder")
    labels = [str(entry.get("label")) for entry in items]
    assert not _ordering_is_trivial_adjacent_swap(labels, list(item.metadata["correctOrder"]))


def test_build_question_item_normalizes_ordering_sequence_without_embedded_positions() -> None:
    question = Question(
        id="00000000-0000-0000-0000-000000000107",
        skill_id="00000000-0000-0000-0000-000000000207",
        lesson_id=23,
        type=QuestionType.MCQ,
        difficulty=QuestionDifficulty.EASY,
        prompt="Organize os numeros em ordem crescente.",
        explanation=None,
        metadata_json={
            "items": ["7", "4", "5", "8"],
            "correctOrder": ["4", "5", "7", "8"],
        },
        tags=[],
    )
    variant = QuestionVariant(
        id="00000000-0000-0000-0000-000000000307",
        question_id=question.id,
        variant_data={},
    )

    item = _build_question_item(question=question, variant=variant)

    assert item.type == QuestionType.ORDERING
    assert item.metadata.get("correctOrder") == ["4", "5", "7", "8"]
    items = item.metadata.get("items")
    assert isinstance(items, list) and len(items) == 4
    assert sorted(int(entry.get("correctOrder")) for entry in items) == [1, 2, 3, 4]
    labels = [str(entry.get("label")) for entry in items]
    assert not _ordering_is_trivial_adjacent_swap(labels, item.metadata["correctOrder"])


def test_build_question_item_merges_question_metadata_with_variant_metadata() -> None:
    question = Question(
        id="00000000-0000-0000-0000-000000000105",
        skill_id="00000000-0000-0000-0000-000000000205",
        lesson_id=21,
        type=QuestionType.MCQ,
        difficulty=QuestionDifficulty.EASY,
        prompt="Quantas silabas tem a palavra 'historia'?",
        explanation=None,
        metadata_json={
            "options": [
                {"id": "a", "label": "3"},
                {"id": "b", "label": "4"},
                {"id": "c", "label": "5"},
            ],
            "correctOptionId": "a",
        },
        tags=[],
    )
    variant = QuestionVariant(
        id="00000000-0000-0000-0000-000000000305",
        question_id=question.id,
        variant_data={"prompt": question.prompt, "metadata": {}},
    )

    item = _build_question_item(question=question, variant=variant)

    assert item.type == QuestionType.MCQ
    assert isinstance(item.metadata.get("options"), list)
    assert len(item.metadata["options"]) == 3
    assert item.metadata.get("correctOptionId") == "a"
    assert {entry["id"] for entry in item.metadata["options"]} == {"a", "b", "c"}


def test_build_template_item_pt_syllables_creates_options() -> None:
    template = QuestionTemplate(
        id="00000000-0000-0000-0000-000000000106",
        skill_id="00000000-0000-0000-0000-000000000206",
        lesson_id=22,
        difficulty=QuestionDifficulty.EASY,
        template_type=QuestionTemplateType.PT_SYLLABLES,
        prompt_template="",
        explanation_template="",
        generator_spec={},
        renderer_spec={},
        tags=[],
    )
    variant = GeneratedVariant(
        id="00000000-0000-0000-0000-000000000306",
        user_id=1,
        template_id=template.id,
        seed="seed",
        variant_data={
            "variables": {"word": "historia"},
            "metadata": {},
            "prompt": "",
        },
    )

    item = _build_template_item(template=template, generated_variant=variant)

    assert item.type == QuestionType.MCQ
    assert item.metadata.get("correctOptionId") in {"a", "b", "c"}
    options = item.metadata.get("options")
    assert isinstance(options, list) and len(options) == 3
    assert {"3", "4"}.intersection({entry.get("label") for entry in options if isinstance(entry, dict)})


def test_build_question_item_true_false_not_always_renders_correct_answer_first() -> None:
    question = Question(
        id="00000000-0000-0000-0000-000000000108",
        skill_id="00000000-0000-0000-0000-000000000208",
        lesson_id=24,
        type=QuestionType.TRUE_FALSE,
        difficulty=QuestionDifficulty.EASY,
        prompt="2 + 2 = 4. Essa afirmação está correta?",
        explanation=None,
        metadata_json={
            "options": [
                {"id": "true", "label": "Verdadeiro"},
                {"id": "false", "label": "Falso"},
            ],
            "correctOptionId": "true",
        },
        tags=[],
    )
    variant = QuestionVariant(
        id="00000000-0000-0000-0000-000000000308",
        question_id=question.id,
        variant_data={"prompt": question.prompt, "metadata": {}},
    )

    item = _build_question_item(question=question, variant=variant)

    options = item.metadata.get("options")
    assert isinstance(options, list) and len(options) == 2
    assert item.metadata.get("correctOptionId") == "true"
    assert str(options[0].get("id")) != "true"


def test_effective_question_difficulty_caps_variant_override_for_age_group() -> None:
    variant = QuestionVariant(
        id="00000000-0000-0000-0000-000000000307",
        question_id="00000000-0000-0000-0000-000000000107",
        variant_data={},
        difficulty_override=QuestionDifficulty.HARD,
    )

    assert _effective_question_difficulty(
        base_difficulty=QuestionDifficulty.EASY,
        variant=variant,
        age_group="6-8",
    ) == QuestionDifficulty.EASY
    assert _effective_question_difficulty(
        base_difficulty=QuestionDifficulty.MEDIUM,
        variant=variant,
        age_group="9-12",
    ) == QuestionDifficulty.MEDIUM

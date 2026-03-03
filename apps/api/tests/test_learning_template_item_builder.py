from __future__ import annotations

from app.models import GeneratedVariant, QuestionDifficulty, QuestionTemplate, QuestionTemplateType
from app.services.adaptive_learning import _build_template_item


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

    assert "Quantas sílabas tem a palavra 'janela'?" in item.prompt
    assert item.metadata.get("answer") == 3


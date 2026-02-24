from __future__ import annotations

from app.models import QuestionType
from app.services.adaptive_learning import (
    NextQuestionItem,
    _creates_type_streak,
    _infer_item_type_from_metadata,
)


def _item(item_type: QuestionType) -> NextQuestionItem:
    return NextQuestionItem(
        question_id="q",
        template_id=None,
        generated_variant_id=None,
        variant_id=None,
        type=item_type,
        prompt="p",
        explanation=None,
        skill_id="s",
        difficulty="EASY",  # type: ignore[arg-type]
        metadata={},
    )


def test_infer_item_type_from_metadata_pairs_returns_match() -> None:
    inferred = _infer_item_type_from_metadata({"pairs": [{"a": 1}]}, QuestionType.MCQ)
    assert inferred == QuestionType.MATCH


def test_infer_item_type_from_metadata_sequence_returns_ordering() -> None:
    inferred = _infer_item_type_from_metadata({"sequence": ["a", "b"]}, QuestionType.MCQ)
    assert inferred == QuestionType.ORDERING


def test_infer_item_type_true_false_labels_returns_true_false() -> None:
    inferred = _infer_item_type_from_metadata(
        {"options": [{"id": "1", "label": "Verdadeiro"}, {"id": "2", "label": "Falso"}]},
        QuestionType.MCQ,
    )
    assert inferred == QuestionType.TRUE_FALSE


def test_creates_type_streak_detects_three_in_a_row() -> None:
    items = [_item(QuestionType.MCQ), _item(QuestionType.MCQ)]
    assert _creates_type_streak(items, QuestionType.MCQ, max_streak=2) is True
    assert _creates_type_streak(items, QuestionType.MATCH, max_streak=2) is False


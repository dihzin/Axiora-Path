from __future__ import annotations

from datetime import date

import pytest
from pydantic import ValidationError

from app.schemas.children import ChildCreateRequest


def _safe_year_replace(value: date, year: int) -> date:
    try:
        return value.replace(year=year)
    except ValueError:
        return value.replace(month=2, day=28, year=year)


def test_child_creation_requires_date_of_birth() -> None:
    with pytest.raises(ValidationError):
        ChildCreateRequest(display_name="Ana", theme="default")


def test_child_age_must_be_between_4_and_18() -> None:
    today = date.today()
    too_young = _safe_year_replace(today, today.year - 3)
    too_old = _safe_year_replace(today, today.year - 19)

    with pytest.raises(ValidationError):
        ChildCreateRequest(display_name="Nova", date_of_birth=too_young, theme="default")

    with pytest.raises(ValidationError):
        ChildCreateRequest(display_name="Veterana", date_of_birth=too_old, theme="default")

from __future__ import annotations

from datetime import date

from app.services.child_age import get_child_age


def test_age_calculation_correct_on_birthday_edge_case() -> None:
    date_of_birth = date(2014, 3, 1)

    day_before_birthday = date(2026, 2, 28)
    on_birthday = date(2026, 3, 1)

    assert get_child_age(date_of_birth, today=day_before_birthday) == 11
    assert get_child_age(date_of_birth, today=on_birthday) == 12

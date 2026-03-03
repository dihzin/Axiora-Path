from __future__ import annotations

from datetime import date


def get_child_age(date_of_birth: date, *, today: date | None = None) -> int:
    reference = today or date.today()
    years = reference.year - date_of_birth.year
    if (reference.month, reference.day) < (date_of_birth.month, date_of_birth.day):
        years -= 1
    return max(0, years)

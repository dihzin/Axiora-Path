from __future__ import annotations

from sqlalchemy.orm import Session

from app.services.axion import refresh_axion_mood_states_daily


def refresh_axion_profiles_daily(db: Session) -> dict[str, int]:
    updated = refresh_axion_mood_states_daily(db)
    return {"updated_profiles": updated}

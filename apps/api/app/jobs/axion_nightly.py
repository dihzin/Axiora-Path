from __future__ import annotations

from sqlalchemy.orm import Session

from app.services.axion_core_v2 import run_axion_nightly


def run_axion_nightly_job(
    db: Session,
    *,
    batch_size: int = 250,
    active_window_days: int = 45,
) -> dict[str, int]:
    return run_axion_nightly(
        db,
        batch_size=batch_size,
        active_window_days=active_window_days,
    )


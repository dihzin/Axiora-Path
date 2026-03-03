from __future__ import annotations

from dataclasses import dataclass
from datetime import date
import hashlib

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AxionExperiment


@dataclass(slots=True)
class AxionVariantAssignment:
    experiment_id: str
    variant: str


def _deterministic_bucket(*, experiment_id: str, child_id: int) -> float:
    seed = f"{experiment_id}:{child_id}".encode("utf-8")
    digest = hashlib.sha256(seed).hexdigest()
    value = int(digest[:8], 16) % 10_000
    return value / 100.0


def resolve_nba_variant(db: Session, *, child_id: int | None, target_date: date | None = None) -> AxionVariantAssignment | None:
    if child_id is None:
        return None
    current = target_date or date.today()
    rows = db.scalars(
        select(AxionExperiment)
        .where(
            AxionExperiment.active.is_(True),
            AxionExperiment.start_date <= current,
            (AxionExperiment.end_date.is_(None) | (AxionExperiment.end_date >= current)),
        )
        .order_by(AxionExperiment.experiment_id.asc(), AxionExperiment.variant.asc())
    ).all()
    if not rows:
        return None

    by_experiment: dict[str, list[AxionExperiment]] = {}
    for row in rows:
        by_experiment.setdefault(row.experiment_id, []).append(row)

    def _experiment_priority(item: tuple[str, list[AxionExperiment]]) -> tuple[date, str]:
        experiment_id, variants = item
        start = max((variant.start_date for variant in variants), default=date.min)
        return (start, experiment_id)

    experiment_id, candidates = max(by_experiment.items(), key=_experiment_priority)
    bucket = _deterministic_bucket(experiment_id=experiment_id, child_id=child_id)
    total_allocation = sum(max(0.0, float(item.allocation_percentage or 0.0)) for item in candidates)
    if total_allocation <= 0:
        return AxionVariantAssignment(experiment_id=experiment_id, variant=candidates[0].variant)
    scaled_bucket = (bucket / 100.0) * total_allocation
    cumulative = 0.0
    for item in candidates:
        cumulative += max(0.0, float(item.allocation_percentage or 0.0))
        if scaled_bucket < cumulative:
            return AxionVariantAssignment(experiment_id=experiment_id, variant=item.variant)

    return AxionVariantAssignment(experiment_id=experiment_id, variant=candidates[-1].variant)


def resolve_nba_variant_for_experiment(
    db: Session,
    *,
    experiment_id: str,
    child_id: int | None,
    target_date: date | None = None,
) -> AxionVariantAssignment | None:
    if child_id is None:
        return None
    key = (experiment_id or "").strip()
    if not key:
        return None
    current = target_date or date.today()
    rows = db.scalars(
        select(AxionExperiment)
        .where(
            AxionExperiment.experiment_id == key,
            AxionExperiment.active.is_(True),
            AxionExperiment.start_date <= current,
            (AxionExperiment.end_date.is_(None) | (AxionExperiment.end_date >= current)),
        )
        .order_by(AxionExperiment.variant.asc())
    ).all()
    if not rows:
        return None

    bucket = _deterministic_bucket(experiment_id=key, child_id=child_id)
    total_allocation = sum(max(0.0, float(item.allocation_percentage or 0.0)) for item in rows)
    if total_allocation <= 0:
        return AxionVariantAssignment(experiment_id=key, variant=rows[0].variant)

    scaled_bucket = (bucket / 100.0) * total_allocation
    cumulative = 0.0
    for item in rows:
        cumulative += max(0.0, float(item.allocation_percentage or 0.0))
        if scaled_bucket < cumulative:
            return AxionVariantAssignment(experiment_id=key, variant=item.variant)
    return AxionVariantAssignment(experiment_id=key, variant=rows[-1].variant)

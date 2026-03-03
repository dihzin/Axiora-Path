from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import text
from sqlalchemy.orm import Session


@dataclass(slots=True)
class ConsistencyUserIssue:
    user_id: int
    variants: list[str]
    reasons: list[str]


@dataclass(slots=True)
class ConsistencyOrphanDecision:
    decision_id: str
    user_id: int | None
    child_id: int | None
    variant: str
    created_at: datetime


@dataclass(slots=True)
class ExperimentConsistencyResult:
    inconsistent_users_count: int
    multi_variant_users: list[ConsistencyUserIssue]
    orphan_decisions: list[ConsistencyOrphanDecision]
    valid: bool


def run_experiment_consistency_check(
    db: Session,
    *,
    experiment_key: str,
    tenant_id: int | None = None,
    max_rows: int = 200,
) -> ExperimentConsistencyResult:
    user_variant_rows = db.execute(
        text(
            """
            SELECT
                d.user_id AS user_id,
                ARRAY_AGG(DISTINCT d.variant ORDER BY d.variant) AS variants
            FROM axion_decisions d
            WHERE d.experiment_key = :experiment_key
              AND d.variant IS NOT NULL
              AND (:tenant_id IS NULL OR d.tenant_id = :tenant_id)
            GROUP BY d.user_id
            HAVING COUNT(DISTINCT d.variant) > 1
            ORDER BY d.user_id ASC
            """
        ),
        {"experiment_key": experiment_key, "tenant_id": tenant_id},
    ).mappings().all()

    child_variant_rows = db.execute(
        text(
            """
            SELECT
                d.child_id AS child_id,
                ARRAY_AGG(DISTINCT d.variant ORDER BY d.variant) AS variants,
                ARRAY_AGG(DISTINCT d.user_id ORDER BY d.user_id) AS users
            FROM axion_decisions d
            WHERE d.experiment_key = :experiment_key
              AND d.variant IS NOT NULL
              AND d.child_id IS NOT NULL
              AND (:tenant_id IS NULL OR d.tenant_id = :tenant_id)
            GROUP BY d.child_id
            HAVING COUNT(DISTINCT d.variant) > 1
            ORDER BY d.child_id ASC
            """
        ),
        {"experiment_key": experiment_key, "tenant_id": tenant_id},
    ).mappings().all()

    issues_by_user: dict[int, ConsistencyUserIssue] = {}
    for row in user_variant_rows:
        uid = int(row["user_id"])
        variants = [str(item) for item in (row["variants"] or [])]
        issues_by_user[uid] = ConsistencyUserIssue(
            user_id=uid,
            variants=variants,
            reasons=["user_multi_variant"],
        )

    for row in child_variant_rows:
        variants = [str(item) for item in (row["variants"] or [])]
        for raw_uid in (row["users"] or []):
            uid = int(raw_uid)
            existing = issues_by_user.get(uid)
            if existing is None:
                issues_by_user[uid] = ConsistencyUserIssue(
                    user_id=uid,
                    variants=variants,
                    reasons=["child_assignment_inconsistent"],
                )
                continue
            existing.variants = sorted(set([*existing.variants, *variants]))
            if "child_assignment_inconsistent" not in existing.reasons:
                existing.reasons.append("child_assignment_inconsistent")

    orphan_rows = db.execute(
        text(
            """
            SELECT
                d.id AS decision_id,
                d.user_id AS user_id,
                d.child_id AS child_id,
                d.variant AS variant,
                d.created_at AS created_at
            FROM axion_decisions d
            WHERE d.experiment_key IS NULL
              AND d.variant IS NOT NULL
              AND (:tenant_id IS NULL OR d.tenant_id = :tenant_id)
            ORDER BY d.created_at DESC
            LIMIT :max_rows
            """
        ),
        {"max_rows": max_rows, "tenant_id": tenant_id},
    ).mappings().all()

    multi_variant_users = sorted(issues_by_user.values(), key=lambda item: item.user_id)[:max_rows]
    orphan_decisions = [
        ConsistencyOrphanDecision(
            decision_id=str(row["decision_id"]),
            user_id=int(row["user_id"]) if row["user_id"] is not None else None,
            child_id=int(row["child_id"]) if row["child_id"] is not None else None,
            variant=str(row["variant"]),
            created_at=row["created_at"],
        )
        for row in orphan_rows
    ]
    inconsistent_users_count = len(issues_by_user)
    valid = inconsistent_users_count == 0 and len(orphan_decisions) == 0
    return ExperimentConsistencyResult(
        inconsistent_users_count=inconsistent_users_count,
        multi_variant_users=multi_variant_users,
        orphan_decisions=orphan_decisions,
        valid=valid,
    )

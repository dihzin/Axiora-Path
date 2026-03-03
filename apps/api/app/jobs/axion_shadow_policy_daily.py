from __future__ import annotations

from sqlalchemy import text

from app.db.session import SessionLocal
from app.services.axion_shadow_policy import compute_shadow_policy


def run_axion_shadow_policy_daily() -> None:
    db = SessionLocal()
    try:
        rows = db.execute(
            text(
                """
                SELECT DISTINCT tenant_id, experiment_key
                FROM axion_feature_snapshot
                WHERE experiment_key IS NOT NULL
                  AND snapshot_at >= (NOW() AT TIME ZONE 'UTC') - INTERVAL '2 days'
                ORDER BY tenant_id ASC, experiment_key ASC
                """
            )
        ).mappings().all()
        for row in rows:
            tenant_id = int(row["tenant_id"])
            experiment_key = str(row["experiment_key"])
            compute_shadow_policy(
                db,
                tenant_id=tenant_id,
                experiment_key=experiment_key,
            )
    finally:
        db.close()

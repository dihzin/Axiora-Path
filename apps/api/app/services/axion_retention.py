from __future__ import annotations

import csv
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from io import StringIO
from typing import Iterator

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models import EventLog


@dataclass(slots=True)
class AxionRetentionFilters:
    tenant_id: int | None
    action_type: str | None
    context: str | None
    persona: str | None
    experiment_key: str | None
    variant: str | None
    nba_reason: str | None
    destination: str | None
    dedupe_exposure_per_day: bool
    lookback_days: int
    date_from: date | None = None
    date_to: date | None = None


def get_axion_retention_metrics(db: Session, *, filters: AxionRetentionFilters) -> dict[str, float | int]:
    if filters.date_from is not None:
        window_start = datetime.combine(filters.date_from, time.min, tzinfo=UTC)
    else:
        window_start = datetime.now(UTC) - timedelta(days=max(1, filters.lookback_days))
    window_end = (
        datetime.combine(filters.date_to + timedelta(days=1), time.min, tzinfo=UTC)
        if filters.date_to is not None
        else None
    )
    uuid_pattern = r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    exposure_events_cte = (
        """
        exposure_events AS (
            SELECT DISTINCT ON (child_id, exposed_day)
                user_id,
                child_id,
                tenant_id,
                decision_id,
                exposed_at,
                exposed_day
            FROM exposure_base
            ORDER BY child_id, exposed_day, exposed_at ASC
        ),
        """
        if filters.dedupe_exposure_per_day
        else """
        exposure_events AS (
            SELECT
                user_id,
                child_id,
                tenant_id,
                decision_id,
                exposed_at,
                exposed_day
            FROM exposure_base
        ),
        """
    )
    stmt = text(
        """
        WITH exposure_base AS (
            SELECT
                d.user_id AS user_id,
                d.child_id AS child_id,
                e.tenant_id AS tenant_id,
                (e.payload->>'decision_id') AS decision_id,
                e.created_at AS exposed_at,
                date_trunc('day', e.created_at) AS exposed_day
            FROM event_log e
            JOIN axion_decisions d
              ON d.id = (e.payload->>'decision_id')::uuid
            LEFT JOIN user_persona_state ups
              ON ups.user_id = d.user_id
            LEFT JOIN axion_personas ap
              ON ap.id = ups.active_persona_id
            WHERE e.type = 'axion_brief_exposed'
              AND (e.payload->>'decision_id') ~* :uuid_pattern
              AND e.created_at >= :window_start
              AND (:window_end IS NULL OR e.created_at < :window_end)
              AND (:tenant_id IS NULL OR e.tenant_id = :tenant_id)
              AND (CAST(:action_type AS text) IS NULL OR UPPER(COALESCE(d.action_type, e.payload->>'actionType')) = UPPER(CAST(:action_type AS text)))
              AND (CAST(:context AS text) IS NULL OR LOWER(COALESCE(d.context::text, e.payload->>'context')) = LOWER(CAST(:context AS text)))
              AND (CAST(:persona AS text) IS NULL OR LOWER(ap.name) = LOWER(CAST(:persona AS text)))
              AND (CAST(:experiment_key AS text) IS NULL OR LOWER(COALESCE(d.experiment_key, d.experiment_id, '')) = LOWER(CAST(:experiment_key AS text)))
              AND (CAST(:variant AS text) IS NULL OR LOWER(COALESCE(d.variant, '')) = LOWER(CAST(:variant AS text)))
              AND (CAST(:nba_reason AS text) IS NULL OR LOWER(COALESCE(d.nba_reason, '')) = LOWER(CAST(:nba_reason AS text)))
        ),
        """
        + exposure_events_cte
        + """
        cohort_users AS (
            SELECT user_id, MIN(exposed_at) AS first_exposed_at
            FROM exposure_events
            GROUP BY user_id
        ),
        session_completed_events AS (
            SELECT
                ee.user_id AS user_id,
                s.created_at AS session_at
            FROM event_log s
            JOIN exposure_events ee
              ON ee.decision_id = s.payload->>'decision_id'
            WHERE s.type = 'axion_session_completed'
              AND (CAST(:destination AS text) IS NULL OR LOWER(COALESCE(s.payload->>'destination', '')) = LOWER(CAST(:destination AS text)))
        ),
        session_started_events AS (
            SELECT
                ee.user_id AS user_id,
                s.created_at AS session_at
            FROM event_log s
            JOIN exposure_events ee
              ON ee.decision_id = s.payload->>'decision_id'
            WHERE s.type = 'axion_session_started'
              AND (CAST(:destination AS text) IS NULL OR LOWER(COALESCE(s.payload->>'destination', '')) = LOWER(CAST(:destination AS text)))
        ),
        session_by_user AS (
            SELECT
                cu.user_id AS user_id,
                COUNT(*) FILTER (
                    WHERE sce.session_at >= cu.first_exposed_at
                      AND sce.session_at < cu.first_exposed_at + INTERVAL '30 days'
                ) AS sessions_30d,
                BOOL_OR(
                    sce.session_at >= cu.first_exposed_at
                    AND sce.session_at < cu.first_exposed_at + INTERVAL '1 day'
                ) AS retained_d1,
                BOOL_OR(
                    sce.session_at >= cu.first_exposed_at
                    AND sce.session_at < cu.first_exposed_at + INTERVAL '7 days'
                ) AS retained_d7,
                BOOL_OR(
                    sce.session_at >= cu.first_exposed_at
                    AND sce.session_at < cu.first_exposed_at + INTERVAL '30 days'
                ) AS retained_d30
            FROM cohort_users cu
            LEFT JOIN session_completed_events sce
              ON sce.user_id = cu.user_id
            GROUP BY cu.user_id
        ),
        cta_click_users AS (
            SELECT DISTINCT cce.user_id AS user_id
            FROM (
                SELECT
                    ee.user_id AS user_id,
                    c.created_at AS click_at,
                    c.payload->>'decision_id' AS decision_id
                FROM event_log c
                JOIN exposure_events ee
                  ON ee.decision_id = c.payload->>'decision_id'
                WHERE c.type = 'axion_cta_clicked'
            ) cce
        ),
        cta_click_events AS (
            SELECT
                ee.user_id AS user_id,
                c.created_at AS click_at,
                c.payload->>'decision_id' AS decision_id
            FROM event_log c
            JOIN exposure_events ee
              ON ee.decision_id = c.payload->>'decision_id'
            WHERE c.type = 'axion_cta_clicked'
        ),
        cta_session_windows AS (
            SELECT
                cce.user_id AS user_id,
                BOOL_OR(s_start.id IS NOT NULL) AS started_within_24h,
                BOOL_OR(s_done.id IS NOT NULL) AS completed_within_24h
            FROM cta_click_events cce
            LEFT JOIN event_log s_start
              ON s_start.type = 'axion_session_started'
             AND s_start.payload->>'decision_id' = cce.decision_id
             AND s_start.created_at >= cce.click_at
             AND s_start.created_at < cce.click_at + INTERVAL '24 hours'
             AND (CAST(:destination AS text) IS NULL OR LOWER(COALESCE(s_start.payload->>'destination', '')) = LOWER(CAST(:destination AS text)))
            LEFT JOIN event_log s_done
              ON s_done.type = 'axion_session_completed'
             AND s_done.payload->>'decision_id' = cce.decision_id
             AND s_done.created_at >= cce.click_at
             AND s_done.created_at < cce.click_at + INTERVAL '24 hours'
             AND (CAST(:destination AS text) IS NULL OR LOWER(COALESCE(s_done.payload->>'destination', '')) = LOWER(CAST(:destination AS text)))
            GROUP BY cce.user_id
        ),
        cta_session_converted_users AS (
            SELECT csw.user_id
            FROM cta_session_windows csw
            WHERE COALESCE(csw.completed_within_24h, FALSE)
        ),
        cta_session_started_converted_users AS (
            SELECT csw.user_id
            FROM cta_session_windows csw
            WHERE COALESCE(csw.started_within_24h, FALSE)
        )
        SELECT
            (SELECT COUNT(*)::int FROM exposure_base) AS exposures_total,
            (SELECT COUNT(DISTINCT (child_id::text || ':' || exposed_day::text))::int FROM exposure_base WHERE child_id IS NOT NULL) AS unique_exposures_per_day,
            (SELECT COUNT(*)::int FROM cohort_users) AS cohort_users,
            (SELECT COUNT(*)::int FROM session_by_user WHERE COALESCE(retained_d1, FALSE)) AS retained_d1_users,
            (SELECT COUNT(*)::int FROM session_by_user WHERE COALESCE(retained_d7, FALSE)) AS retained_d7_users,
            (SELECT COUNT(*)::int FROM session_by_user WHERE COALESCE(retained_d30, FALSE)) AS retained_d30_users,
            (SELECT COALESCE(SUM(sessions_30d), 0)::float FROM session_by_user) AS total_sessions_30d,
            (SELECT COUNT(*)::int FROM cta_click_users) AS cta_click_users,
            (SELECT COUNT(DISTINCT user_id)::int FROM session_started_events) AS session_started_users,
            (SELECT COUNT(*)::int FROM cta_session_started_converted_users) AS cta_session_started_converted_users,
            (SELECT COUNT(*)::int FROM cta_session_converted_users) AS cta_session_converted_users
        """
    )
    row = db.execute(
        stmt,
        {
            "window_start": window_start,
            "window_end": window_end,
            "uuid_pattern": uuid_pattern,
            "tenant_id": filters.tenant_id,
            "action_type": (filters.action_type or "").strip() or None,
            "context": (filters.context or "").strip() or None,
            "persona": (filters.persona or "").strip() or None,
            "experiment_key": (filters.experiment_key or "").strip() or None,
            "variant": (filters.variant or "").strip() or None,
            "nba_reason": (filters.nba_reason or "").strip() or None,
            "destination": (filters.destination or "").strip() or None,
        },
    ).mappings().first()
    if row is None:
        return {
            "exposures_total": 0,
            "unique_exposures_per_day": 0,
            "cohort_users": 0,
            "retained_d1_users": 0,
            "retained_d7_users": 0,
            "retained_d30_users": 0,
            "d1_rate": 0.0,
            "d7_rate": 0.0,
            "d30_rate": 0.0,
            "session_frequency": 0.0,
            "cta_click_users": 0,
            "session_started_users": 0,
            "cta_session_started_converted_users": 0,
            "cta_to_session_started_conversion": 0.0,
            "cta_session_converted_users": 0,
            "cta_to_session_conversion": 0.0,
        }

    exposures_total = int(row["exposures_total"] or 0)
    unique_exposures_per_day = int(row["unique_exposures_per_day"] or 0)
    cohort_users = int(row["cohort_users"] or 0)
    retained_d1_users = int(row["retained_d1_users"] or 0)
    retained_d7_users = int(row["retained_d7_users"] or 0)
    retained_d30_users = int(row["retained_d30_users"] or 0)
    total_sessions_30d = float(row["total_sessions_30d"] or 0.0)
    cta_click_users = int(row["cta_click_users"] or 0)
    session_started_users = int(row["session_started_users"] or 0)
    cta_session_started_converted_users = int(row["cta_session_started_converted_users"] or 0)
    cta_session_converted_users = int(row["cta_session_converted_users"] or 0)

    cohort_den = float(cohort_users) if cohort_users > 0 else 0.0
    click_den = float(cta_click_users) if cta_click_users > 0 else 0.0

    return {
        "exposures_total": exposures_total,
        "unique_exposures_per_day": unique_exposures_per_day,
        "cohort_users": cohort_users,
        "retained_d1_users": retained_d1_users,
        "retained_d7_users": retained_d7_users,
        "retained_d30_users": retained_d30_users,
        "d1_rate": round((retained_d1_users / cohort_den) * 100.0, 2) if cohort_den > 0 else 0.0,
        "d7_rate": round((retained_d7_users / cohort_den) * 100.0, 2) if cohort_den > 0 else 0.0,
        "d30_rate": round((retained_d30_users / cohort_den) * 100.0, 2) if cohort_den > 0 else 0.0,
        "session_frequency": round((total_sessions_30d / cohort_den), 4) if cohort_den > 0 else 0.0,
        "cta_click_users": cta_click_users,
        "session_started_users": session_started_users,
        "cta_session_started_converted_users": cta_session_started_converted_users,
        "cta_to_session_started_conversion": round((cta_session_started_converted_users / click_den) * 100.0, 2)
        if click_den > 0
        else 0.0,
        "cta_session_converted_users": cta_session_converted_users,
        "cta_to_session_conversion": round((cta_session_converted_users / click_den) * 100.0, 2) if click_den > 0 else 0.0,
    }


def stream_nba_retention_export_csv(
    db: Session,
    *,
    tenant_id: int,
    date_from: date | None = None,
    date_to: date | None = None,
) -> Iterator[str]:
    if date_from is not None:
        window_start = datetime.combine(date_from, time.min, tzinfo=UTC)
    else:
        window_start = datetime.now(UTC) - timedelta(days=30)
    window_end = (
        datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=UTC)
        if date_to is not None
        else None
    )
    uuid_pattern = r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"

    stmt = text(
        """
        WITH exposure_events AS (
            SELECT
                d.user_id AS user_id,
                d.child_id AS child_id,
                COALESCE(d.variant, 'UNKNOWN') AS variant,
                e.created_at AS exposed_at
            FROM event_log e
            JOIN axion_decisions d
              ON d.id = (e.payload->>'decision_id')::uuid
            WHERE e.type = 'axion_brief_exposed'
              AND (e.payload->>'decision_id') ~* :uuid_pattern
              AND e.tenant_id = :tenant_id
              AND COALESCE(d.experiment_key, d.experiment_id) = 'nba_retention_v1'
              AND e.created_at >= :window_start
              AND (:window_end IS NULL OR e.created_at < :window_end)
        ),
        cohort AS (
            SELECT
                user_id,
                child_id,
                variant,
                MIN(exposed_at) AS first_exposure_at
            FROM exposure_events
            GROUP BY user_id, child_id, variant
        ),
        decision_scope AS (
            SELECT DISTINCT
                d.user_id AS user_id,
                d.child_id AS child_id,
                COALESCE(d.variant, 'UNKNOWN') AS variant,
                d.id::text AS decision_id
            FROM axion_decisions d
            JOIN cohort c
              ON c.user_id = d.user_id
             AND c.child_id IS NOT DISTINCT FROM d.child_id
             AND c.variant = COALESCE(d.variant, 'UNKNOWN')
            WHERE d.tenant_id = :tenant_id
              AND COALESCE(d.experiment_key, d.experiment_id) = 'nba_retention_v1'
        ),
        session_events AS (
            SELECT
                ds.user_id AS user_id,
                ds.child_id AS child_id,
                ds.variant AS variant,
                s.type AS event_type,
                s.created_at AS created_at
            FROM decision_scope ds
            JOIN event_log s
              ON s.payload->>'decision_id' = ds.decision_id
            WHERE s.type IN ('axion_session_started', 'axion_session_completed')
        )
        SELECT
            c.user_id AS user_id,
            c.child_id AS child_id,
            c.variant AS variant,
            c.first_exposure_at AS first_exposure_at,
            BOOL_OR(
                se.event_type = 'axion_session_started'
                AND se.created_at >= c.first_exposure_at
                AND se.created_at < c.first_exposure_at + INTERVAL '30 days'
            ) AS session_started,
            BOOL_OR(
                se.event_type = 'axion_session_completed'
                AND se.created_at >= c.first_exposure_at
                AND se.created_at < c.first_exposure_at + INTERVAL '30 days'
            ) AS session_completed,
            BOOL_OR(
                se.event_type = 'axion_session_completed'
                AND se.created_at >= c.first_exposure_at
                AND se.created_at < c.first_exposure_at + INTERVAL '1 day'
            ) AS retained_d1,
            BOOL_OR(
                se.event_type = 'axion_session_completed'
                AND se.created_at >= c.first_exposure_at
                AND se.created_at < c.first_exposure_at + INTERVAL '7 days'
            ) AS retained_d7,
            COUNT(*) FILTER (
                WHERE se.event_type = 'axion_session_completed'
                  AND se.created_at >= c.first_exposure_at
                  AND se.created_at < c.first_exposure_at + INTERVAL '30 days'
            )::int AS sessions_30d
        FROM cohort c
        LEFT JOIN session_events se
          ON se.user_id = c.user_id
         AND se.child_id IS NOT DISTINCT FROM c.child_id
         AND se.variant = c.variant
        GROUP BY c.user_id, c.child_id, c.variant, c.first_exposure_at
        ORDER BY c.first_exposure_at ASC, c.user_id ASC, c.child_id ASC, c.variant ASC
        """
    )

    conn = db.connection().execution_options(stream_results=True)
    result = conn.execute(
        stmt,
        {
            "tenant_id": tenant_id,
            "window_start": window_start,
            "window_end": window_end,
            "uuid_pattern": uuid_pattern,
        },
    ).mappings()

    headers = [
        "user_id",
        "child_id",
        "variant",
        "first_exposure_at",
        "session_started",
        "session_completed",
        "retained_d1",
        "retained_d7",
        "sessions_30d",
    ]

    out = StringIO()
    writer = csv.writer(out, lineterminator="\n")
    writer.writerow(headers)
    yield out.getvalue()
    out.seek(0)
    out.truncate(0)

    for row in result:
        first_exposure = row["first_exposure_at"]
        first_exposure_text = first_exposure.isoformat() if isinstance(first_exposure, datetime) else ""
        writer.writerow(
            [
                int(row["user_id"]) if row["user_id"] is not None else "",
                int(row["child_id"]) if row["child_id"] is not None else "",
                str(row["variant"]) if row["variant"] is not None else "",
                first_exposure_text,
                "true" if bool(row["session_started"]) else "false",
                "true" if bool(row["session_completed"]) else "false",
                "true" if bool(row["retained_d1"]) else "false",
                "true" if bool(row["retained_d7"]) else "false",
                int(row["sessions_30d"] or 0),
            ]
        )
        yield out.getvalue()
        out.seek(0)
        out.truncate(0)


def compute_retention_metrics(
    db: Session,
    *,
    experiment_key: str,
    tenant_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> dict[str, object]:
    # Performance rationale:
    # - Build the experiment cohort once (first exposure per user).
    # - Precompute session_completed rows joined to the cohort in a CTE.
    # - Aggregate D1/D7 from that precomputed set (no correlated EXISTS per user).
    # This pattern works with indexes on:
    #   event_log(type, actor_user_id, created_at) [session_completed],
    #   event_log(type, decision_uuid, created_at) [brief exposure join],
    #   axion_decisions(experiment_key, user_id, created_at).
    experiment_status_raw = db.scalar(
        text(
            """
            SELECT
                CASE
                    WHEN BOOL_OR(experiment_status = 'AUTO_PAUSED') THEN 'AUTO_PAUSED'
                    WHEN BOOL_OR(experiment_status = 'PAUSED') THEN 'PAUSED'
                    ELSE 'ACTIVE'
                END AS experiment_status
            FROM axion_experiments
            WHERE experiment_id = :experiment_key
            """
        ),
        {"experiment_key": (experiment_key or "").strip()},
    )
    experiment_status = str(experiment_status_raw or "ACTIVE")

    if date_from is not None:
        window_start = datetime.combine(date_from, time.min, tzinfo=UTC)
    else:
        window_start = datetime.now(UTC) - timedelta(days=30)
    window_end = (
        datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=UTC)
        if date_to is not None
        else None
    )
    uuid_pattern = r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"

    metrics_stmt = text(
        """
        WITH exposures_raw AS (
            SELECT
                d.user_id AS user_id,
                COALESCE(d.variant, 'UNKNOWN') AS variant,
                (e.payload->>'decision_id') AS decision_id,
                e.created_at AS exposed_at
            FROM event_log e
            JOIN axion_decisions d
              ON d.id = (e.payload->>'decision_id')::uuid
            WHERE e.type = 'axion_brief_exposed'
              AND (e.payload->>'decision_id') ~* :uuid_pattern
              AND COALESCE(d.experiment_key, d.experiment_id) = :experiment_key
              AND e.created_at >= :window_start
              AND (:window_end IS NULL OR e.created_at < :window_end)
              AND (:tenant_id IS NULL OR e.tenant_id = :tenant_id)
        ),
        first_exposure AS (
            SELECT
                ranked.user_id AS user_id,
                ranked.variant AS variant,
                ranked.exposed_at AS first_exposure_at
            FROM (
                SELECT
                    er.user_id AS user_id,
                    er.variant AS variant,
                    er.exposed_at AS exposed_at,
                    ROW_NUMBER() OVER (
                        PARTITION BY er.user_id
                        ORDER BY er.exposed_at ASC, er.decision_id ASC
                    ) AS rn
                FROM exposures_raw er
            ) ranked
            WHERE ranked.rn = 1
        ),
        session_completed_scoped AS (
            SELECT
                fe.user_id AS user_id,
                fe.variant AS variant,
                fe.first_exposure_at AS first_exposure_at,
                s.created_at AS session_at
            FROM first_exposure fe
            LEFT JOIN event_log s
              ON s.type = 'axion_session_completed'
             AND s.actor_user_id = fe.user_id
             AND (:tenant_id IS NULL OR s.tenant_id = :tenant_id)
             AND s.created_at >= fe.first_exposure_at
             AND s.created_at < fe.first_exposure_at + INTERVAL '7 days'
        ),
        session_by_user AS (
            SELECT
                scs.user_id AS user_id,
                scs.variant AS variant,
                BOOL_OR(
                    scs.session_at IS NOT NULL
                    AND scs.session_at < scs.first_exposure_at + INTERVAL '1 day'
                ) AS retained_d1,
                BOOL_OR(scs.session_at IS NOT NULL) AS retained_d7
            FROM session_completed_scoped scs
            GROUP BY scs.user_id, scs.variant
        ),
        variant_metrics AS (
            SELECT
                su.variant AS variant,
                COUNT(*)::int AS cohort_users,
                COUNT(*) FILTER (WHERE COALESCE(su.retained_d1, FALSE))::int AS retained_d1_users,
                COUNT(*) FILTER (WHERE COALESCE(su.retained_d7, FALSE))::int AS retained_d7_users
            FROM session_by_user su
            GROUP BY su.variant
        )
        SELECT
            variant,
            cohort_users,
            retained_d1_users,
            retained_d7_users
        FROM variant_metrics
        ORDER BY variant ASC
        """
    )
    rows = db.execute(
        metrics_stmt,
        {
            "experiment_key": (experiment_key or "").strip(),
            "tenant_id": tenant_id,
            "window_start": window_start,
            "window_end": window_end,
            "uuid_pattern": uuid_pattern,
        },
    ).mappings().all()

    contamination_stmt = text(
        """
        WITH exposures_raw AS (
            SELECT
                d.user_id AS user_id,
                COALESCE(d.variant, 'UNKNOWN') AS variant
            FROM event_log e
            JOIN axion_decisions d
              ON d.id = (e.payload->>'decision_id')::uuid
            WHERE e.type = 'axion_brief_exposed'
              AND (e.payload->>'decision_id') ~* :uuid_pattern
              AND COALESCE(d.experiment_key, d.experiment_id) = :experiment_key
              AND e.created_at >= :window_start
              AND (:window_end IS NULL OR e.created_at < :window_end)
              AND (:tenant_id IS NULL OR e.tenant_id = :tenant_id)
        )
        SELECT COUNT(*)::int
        FROM (
            SELECT er.user_id
            FROM exposures_raw er
            GROUP BY er.user_id
            HAVING COUNT(DISTINCT er.variant) > 1
        ) contaminated
        """
    )
    contamination_count = int(
        db.execute(
            contamination_stmt,
            {
                "experiment_key": (experiment_key or "").strip(),
                "tenant_id": tenant_id,
                "window_start": window_start,
                "window_end": window_end,
                "uuid_pattern": uuid_pattern,
            },
        ).scalar_one_or_none()
        or 0
    )

    if contamination_count > 0 and tenant_id is not None and hasattr(db, "add"):
        db.add(
            EventLog(
                tenant_id=tenant_id,
                actor_user_id=None,
                child_id=None,
                type="experiment_contamination_multi_variant_users_count",
                payload={
                    "experiment_key": (experiment_key or "").strip(),
                    "count": contamination_count,
                    "timestamp": datetime.now(UTC).isoformat(),
                },
            )
        )

    variants: list[dict[str, float | int | str]] = []
    total_cohort = 0
    total_d1 = 0
    total_d7 = 0
    for row in rows:
        cohort_users = int(row["cohort_users"] or 0)
        retained_d1_users = int(row["retained_d1_users"] or 0)
        retained_d7_users = int(row["retained_d7_users"] or 0)
        total_cohort += cohort_users
        total_d1 += retained_d1_users
        total_d7 += retained_d7_users
        variants.append(
            {
                "variant": str(row["variant"] or "UNKNOWN"),
                "cohort_users": cohort_users,
                "retained_d1_users": retained_d1_users,
                "retained_d7_users": retained_d7_users,
                "d1_rate": round((retained_d1_users / float(cohort_users)) * 100.0, 2) if cohort_users > 0 else 0.0,
                "d7_rate": round((retained_d7_users / float(cohort_users)) * 100.0, 2) if cohort_users > 0 else 0.0,
            }
        )

    overall_d1_rate = round((total_d1 / float(total_cohort)) * 100.0, 2) if total_cohort > 0 else 0.0
    overall_d7_rate = round((total_d7 / float(total_cohort)) * 100.0, 2) if total_cohort > 0 else 0.0

    return {
        "experiment_key": (experiment_key or "").strip(),
        "experiment_status": experiment_status,
        "contamination_multi_variant_users_count": contamination_count,
        "cohort_users": total_cohort,
        "retained_d1_users": total_d1,
        "retained_d7_users": total_d7,
        "d1_rate": overall_d1_rate,
        "d7_rate": overall_d7_rate,
        "variants": variants,
    }

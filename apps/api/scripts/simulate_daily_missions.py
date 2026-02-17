from __future__ import annotations

import argparse
import concurrent.futures as futures
from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import func, select, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.models import (
    ChildProfile,
    DailyMission,
    LedgerTransaction,
    Membership,
    MembershipRole,
    PotAllocation,
    PotType,
    Tenant,
    TenantType,
    User,
    Wallet,
    DailyMissionStatus,
)
from app.services.daily_mission_service import DailyMissionCompletionError, complete_daily_mission_by_id, generate_daily_mission
from app.db.session import SessionLocal


class NoopEvents:
    def emit(self, **_kwargs: object) -> None:
        return


@dataclass
class SeedData:
    tenant_id: int
    user_id: int
    child_ids: list[int]


@dataclass
class RunStats:
    success: int = 0
    deadlocks: int = 0
    errors: int = 0


def _is_deadlock_error(exc: Exception) -> bool:
    if isinstance(exc, OperationalError):
        return "deadlock detected" in str(exc).lower()
    return "deadlock detected" in str(exc).lower()


def _seed_data(children_count: int) -> SeedData:
    with SessionLocal() as db:
        tenant = Tenant(type=TenantType.FAMILY, name="Load Test Family", slug=f"load-test-{uuid4().hex[:10]}")
        user = User(
            email=f"load-parent-{uuid4().hex[:8]}@axiora.local",
            name="Load Parent",
            password_hash="not-used-in-script",
        )
        db.add_all([tenant, user])
        db.flush()

        membership = Membership(
            tenant_id=tenant.id,
            user_id=user.id,
            role=MembershipRole.PARENT,
        )
        db.add(membership)

        child_ids: list[int] = []
        for idx in range(children_count):
            child = ChildProfile(
                tenant_id=tenant.id,
                display_name=f"Load Child {idx + 1}",
                avatar_key=None,
                birth_year=None,
            )
            db.add(child)
            db.flush()
            child_ids.append(child.id)

            wallet = Wallet(tenant_id=tenant.id, child_id=child.id, currency_code="BRL")
            db.add(wallet)
            db.flush()

            db.add_all(
                [
                    PotAllocation(tenant_id=tenant.id, wallet_id=wallet.id, pot=PotType.SPEND, percent=50),
                    PotAllocation(tenant_id=tenant.id, wallet_id=wallet.id, pot=PotType.SAVE, percent=30),
                    PotAllocation(tenant_id=tenant.id, wallet_id=wallet.id, pot=PotType.DONATE, percent=20),
                ]
            )

        db.commit()
        return SeedData(tenant_id=tenant.id, user_id=user.id, child_ids=child_ids)


def _preflight_schema() -> None:
    required_columns = {
        ("child_profiles", "last_mission_completed_at"),
        ("daily_missions", "tenant_id"),
        ("daily_missions", "source_type"),
        ("daily_missions", "status"),
    }
    required_indexes = {"idx_daily_missions_child_date"}

    with SessionLocal() as db:
        found_columns = set(
            db.execute(
                text(
                    """
                    SELECT table_name, column_name
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                    """
                )
            ).all()
        )
        missing_columns = sorted(required_columns - found_columns)
        if missing_columns:
            missing_text = ", ".join(f"{table}.{column}" for table, column in missing_columns)
            raise RuntimeError(
                "Database schema is outdated. Missing columns: "
                f"{missing_text}. Run: alembic upgrade head"
            )

        found_indexes = set(
            row[0]
            for row in db.execute(
                text(
                    """
                    SELECT indexname
                    FROM pg_indexes
                    WHERE schemaname = 'public'
                    """
                )
            ).all()
        )
        missing_indexes = sorted(required_indexes - found_indexes)
        if missing_indexes:
            missing_text = ", ".join(missing_indexes)
            raise RuntimeError(
                "Database schema is outdated. Missing indexes: "
                f"{missing_text}. Run: alembic upgrade head"
            )


def _generate_for_child(tenant_id: int, child_id: int) -> str:
    with SessionLocal() as db:
        child = db.get(ChildProfile, child_id)
        if child is None:
            raise RuntimeError(f"Child not found: {child_id}")
        mission = generate_daily_mission(db, child, current_tenant_id=tenant_id)
        return str(mission.id)


def _complete_for_mission(tenant_id: int, user_id: int, mission_id: str) -> None:
    with SessionLocal() as db:
        tenant = db.get(Tenant, tenant_id)
        user = db.get(User, user_id)
        if tenant is None or user is None:
            raise RuntimeError("Tenant/user not found for completion")

        try:
            with db.begin():
                complete_daily_mission_by_id(
                    db=db,
                    events=NoopEvents(),  # type: ignore[arg-type]
                    tenant=tenant,
                    user=user,
                    mission_id=mission_id,
                )
        except DailyMissionCompletionError as exc:
            raise RuntimeError(str(exc)) from exc


def _run_parallel_generate(seed: SeedData, workers: int) -> tuple[RunStats, list[str]]:
    stats = RunStats()
    mission_ids: list[str] = []
    with futures.ThreadPoolExecutor(max_workers=workers) as executor:
        future_list = [executor.submit(_generate_for_child, seed.tenant_id, child_id) for child_id in seed.child_ids]
        for future in futures.as_completed(future_list):
            try:
                mission_ids.append(future.result())
                stats.success += 1
            except Exception as exc:
                if _is_deadlock_error(exc):
                    stats.deadlocks += 1
                else:
                    stats.errors += 1
    return stats, mission_ids


def _run_parallel_complete(seed: SeedData, mission_ids: list[str], workers: int) -> RunStats:
    stats = RunStats()
    with futures.ThreadPoolExecutor(max_workers=workers) as executor:
        future_list = [
            executor.submit(_complete_for_mission, seed.tenant_id, seed.user_id, mission_id) for mission_id in mission_ids
        ]
        for future in futures.as_completed(future_list):
            try:
                future.result()
                stats.success += 1
            except Exception as exc:
                if _is_deadlock_error(exc):
                    stats.deadlocks += 1
                else:
                    stats.errors += 1
    return stats


def _validate(seed: SeedData) -> None:
    with SessionLocal() as db:
        today = datetime.now(UTC).date()

        total_rows = db.scalar(
            select(func.count(DailyMission.id)).where(
                DailyMission.tenant_id == seed.tenant_id,
                DailyMission.child_id.in_(seed.child_ids),
                DailyMission.date == today,
            )
        )
        distinct_children = db.scalar(
            select(func.count(func.distinct(DailyMission.child_id))).where(
                DailyMission.tenant_id == seed.tenant_id,
                DailyMission.child_id.in_(seed.child_ids),
                DailyMission.date == today,
            )
        )
        completed_rows = db.scalar(
            select(func.count(DailyMission.id)).where(
                DailyMission.tenant_id == seed.tenant_id,
                DailyMission.child_id.in_(seed.child_ids),
                DailyMission.date == today,
                DailyMission.status == DailyMissionStatus.COMPLETED,
            )
        )
        ledger_rows = db.scalar(
            select(func.count(LedgerTransaction.id)).where(
                LedgerTransaction.tenant_id == seed.tenant_id,
                LedgerTransaction.metadata_json["source"].astext == "daily_mission.complete",
            )
        )

        expected = len(seed.child_ids)
        print("")
        print("=== DAILY MISSION LOAD TEST RESULT ===")
        print(f"children_target: {expected}")
        print(f"missions_today_total: {int(total_rows or 0)}")
        print(f"missions_today_distinct_children: {int(distinct_children or 0)}")
        print(f"missions_completed_today: {int(completed_rows or 0)}")
        print(f"ledger_daily_mission_rows: {int(ledger_rows or 0)}")
        print("")
        print("Checks:")
        print(f"- unique(child_id, date): {'OK' if int(total_rows or 0) == expected else 'FAIL'}")
        print(f"- no duplicate mission rows: {'OK' if int(distinct_children or 0) == expected else 'FAIL'}")
        print(f"- completion applied once: {'OK' if int(ledger_rows or 0) == expected else 'FAIL'}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Local concurrent validation for daily missions")
    parser.add_argument("--children", type=int, default=500, help="Number of children to simulate")
    parser.add_argument("--workers", type=int, default=50, help="Parallel workers")
    parser.add_argument(
        "--double-complete",
        action="store_true",
        help="Run completion twice to validate idempotency (no duplicate rewards)",
    )
    args = parser.parse_args()

    _preflight_schema()

    print("Seeding test data...")
    seed = _seed_data(args.children)
    print(f"tenant_id={seed.tenant_id} user_id={seed.user_id} children={len(seed.child_ids)}")

    print("Generating daily missions in parallel...")
    gen_stats, mission_ids = _run_parallel_generate(seed, args.workers)
    print(
        f"generate: success={gen_stats.success} deadlocks={gen_stats.deadlocks} errors={gen_stats.errors} "
        f"unique_mission_ids={len(set(mission_ids))}"
    )

    print("Re-running generation in parallel (duplicate race check)...")
    regen_stats, mission_ids_regen = _run_parallel_generate(seed, args.workers)
    print(
        f"regen: success={regen_stats.success} deadlocks={regen_stats.deadlocks} errors={regen_stats.errors} "
        f"unique_mission_ids={len(set(mission_ids_regen))}"
    )

    print("Completing daily missions in parallel...")
    complete_stats = _run_parallel_complete(seed, mission_ids, args.workers)
    print(
        f"complete: success={complete_stats.success} deadlocks={complete_stats.deadlocks} errors={complete_stats.errors}"
    )

    if args.double_complete:
        print("Completing daily missions again in parallel (idempotency check)...")
        complete_stats_2 = _run_parallel_complete(seed, mission_ids, args.workers)
        print(
            f"complete_again: success={complete_stats_2.success} deadlocks={complete_stats_2.deadlocks} "
            f"errors={complete_stats_2.errors}"
        )

    _validate(seed)


if __name__ == "__main__":
    main()

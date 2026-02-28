from __future__ import annotations

import argparse
import asyncio
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
import json
import math
import os
from pathlib import Path
import sys
from typing import Any

import httpx
from sqlalchemy import create_engine, text


@dataclass(slots=True)
class UserScenario:
    name: str
    age: int
    subject_id: int
    child_id: int
    headers: dict[str, str]


@dataclass(slots=True)
class EndpointConfig:
    label: str
    method: str
    path: str
    calls: int


ENDPOINTS: list[EndpointConfig] = [
    EndpointConfig(label="/trail", method="GET", path="/api/learning/path", calls=50),
    EndpointConfig(label="/lesson", method="POST", path="/api/learning/next", calls=50),
    EndpointConfig(label="/brain_state", method="GET", path="/axion/brain_state", calls=50),
]

OUTPUT_PATH = Path("docs/performance_baseline_latest.json")


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Axiora performance benchmark")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--spawn-server", action="store_true")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--concurrency", type=int, default=10)
    parser.add_argument("--timeout-seconds", type=float, default=20.0)
    parser.add_argument("--startup-timeout-seconds", type=float, default=45.0)
    return parser.parse_args()


def _load_user_scenarios() -> list[UserScenario]:
    raw = (os.getenv("BENCH_USERS_JSON") or "").strip()
    if raw:
        items = json.loads(raw)
        out: list[UserScenario] = []
        for index, item in enumerate(items):
            out.append(
                UserScenario(
                    name=str(item.get("name") or f"user_{index + 1}"),
                    age=int(item.get("age") or 10),
                    subject_id=int(item.get("subject_id") or (index + 1)),
                    child_id=int(item.get("child_id") or (index + 1)),
                    headers={str(k): str(v) for k, v in dict(item.get("headers") or {}).items()},
                )
            )
        if len(out) >= 5:
            return out[:5]

    return [
        UserScenario(name="u6", age=6, subject_id=1, child_id=1, headers={}),
        UserScenario(name="u8", age=8, subject_id=2, child_id=2, headers={}),
        UserScenario(name="u10", age=10, subject_id=3, child_id=3, headers={}),
        UserScenario(name="u13", age=13, subject_id=4, child_id=4, headers={}),
        UserScenario(name="u16", age=16, subject_id=5, child_id=5, headers={}),
    ]


def _p95(values: list[float]) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    idx = max(0, min(len(ordered) - 1, math.ceil(len(ordered) * 0.95) - 1))
    return float(ordered[idx])


def _build_request(spec: EndpointConfig, scenario: UserScenario) -> tuple[dict[str, Any], dict[str, Any] | None]:
    if spec.label == "/trail":
        return (
            {"method": "GET", "url": spec.path, "params": {"subjectId": scenario.subject_id}},
            None,
        )
    if spec.label == "/lesson":
        return (
            {"method": "POST", "url": spec.path},
            {
                "subjectId": scenario.subject_id,
                "lessonId": None,
                "count": 10,
            },
        )
    return (
        {"method": "GET", "url": spec.path, "params": {"childId": scenario.child_id}},
        None,
    )


async def _spawn_api_server(args: argparse.Namespace) -> tuple[asyncio.subprocess.Process, list[dict[str, Any]]]:
    root = Path(__file__).resolve().parents[1]
    api_dir = root / "apps" / "api"
    env = os.environ.copy()
    env["PERF_MONITOR"] = "true"
    env["AXIORA_APP_ENV"] = env.get("AXIORA_APP_ENV", "development")
    proc = await asyncio.create_subprocess_exec(
        sys.executable,
        "-m",
        "uvicorn",
        "app.main:app",
        "--host",
        args.host,
        "--port",
        str(args.port),
        "--log-level",
        "warning",
        cwd=str(api_dir),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
        env=env,
    )
    performance_logs: list[dict[str, Any]] = []

    async def _reader() -> None:
        assert proc.stdout is not None
        async for raw in proc.stdout:
            line = raw.decode("utf-8", errors="ignore").strip()
            if not line:
                continue
            try:
                payload = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(payload, dict) and payload.get("type") == "performance":
                performance_logs.append(payload)

    asyncio.create_task(_reader())
    return proc, performance_logs


async def _wait_until_healthy(base_url: str, timeout_seconds: float) -> None:
    deadline = asyncio.get_running_loop().time() + timeout_seconds
    async with httpx.AsyncClient(base_url=base_url, timeout=2.0) as client:
        while True:
            try:
                response = await client.get("/health")
                if response.status_code < 500:
                    return
            except Exception:
                pass
            if asyncio.get_running_loop().time() >= deadline:
                raise TimeoutError("API did not become healthy within timeout")
            await asyncio.sleep(0.5)


async def _run_calls(
    client: httpx.AsyncClient,
    scenarios: list[UserScenario],
    specs: list[EndpointConfig],
    concurrency: int,
) -> list[dict[str, Any]]:
    semaphore = asyncio.Semaphore(max(1, concurrency))
    results: list[dict[str, Any]] = []
    lock = asyncio.Lock()

    async def _one(spec: EndpointConfig, index: int) -> None:
        scenario = scenarios[index % len(scenarios)]
        req_kwargs, payload = _build_request(spec, scenario)
        headers = dict(scenario.headers)
        headers["X-Benchmark-User"] = scenario.name
        headers["X-Benchmark-Age"] = str(scenario.age)
        if req_kwargs["method"] == "POST":
            headers.setdefault("Content-Type", "application/json")

        start = asyncio.get_running_loop().time()
        status_code = 0
        try:
            async with semaphore:
                response = await client.request(
                    req_kwargs["method"],
                    req_kwargs["url"],
                    params=req_kwargs.get("params"),
                    json=payload,
                    headers=headers,
                )
            status_code = int(response.status_code)
        except Exception:
            status_code = 0
        elapsed_ms = (asyncio.get_running_loop().time() - start) * 1000
        async with lock:
            results.append(
                {
                    "label": spec.label,
                    "path": spec.path,
                    "status": status_code,
                    "duration_ms": float(elapsed_ms),
                }
            )

    tasks: list[asyncio.Task[None]] = []
    for spec in specs:
        for idx in range(spec.calls):
            tasks.append(asyncio.create_task(_one(spec, idx)))
    await asyncio.gather(*tasks)
    return results


def _compute_metrics(
    endpoint_logs: list[dict[str, Any]],
    call_results: list[dict[str, Any]],
    specs: list[EndpointConfig],
) -> dict[str, dict[str, float | int]]:
    by_label: dict[str, dict[str, float | int]] = {}
    by_path_logs: dict[str, list[dict[str, Any]]] = {}
    for log in endpoint_logs:
        path = str(log.get("endpoint") or "")
        by_path_logs.setdefault(path, []).append(log)

    for spec in specs:
        logs_for_endpoint = by_path_logs.get(spec.path, [])
        if logs_for_endpoint:
            durations = [float(item.get("duration_ms") or 0.0) for item in logs_for_endpoint]
            queries = [float(item.get("query_count") or 0.0) for item in logs_for_endpoint]
            sample_size = len(logs_for_endpoint)
        else:
            fallback = [item for item in call_results if item["label"] == spec.label]
            durations = [float(item["duration_ms"]) for item in fallback]
            queries = [0.0 for _ in fallback]
            sample_size = len(fallback)
        avg_ms = (sum(durations) / len(durations)) if durations else 0.0
        avg_queries = (sum(queries) / len(queries)) if queries else 0.0
        by_label[spec.label] = {
            "avg_ms": avg_ms,
            "p95_ms": _p95(durations),
            "avg_queries": avg_queries,
            "sample_size": sample_size,
        }
    return by_label


def _classify(metrics: dict[str, dict[str, float | int]]) -> tuple[str, float]:
    trail_avg = float(metrics["/trail"]["avg_ms"])
    lesson_avg = float(metrics["/lesson"]["avg_ms"])
    brain_avg = float(metrics["/brain_state"]["avg_ms"])

    if trail_avg < 120:
        trail_score = 5.0
    elif trail_avg < 180:
        trail_score = 4.4
    else:
        trail_score = 3.0

    lesson_score = 4.4 if lesson_avg < 200 else 3.0
    brain_score = 4.4 if brain_avg < 150 else 3.0
    overall = round((trail_score + lesson_score + brain_score) / 3, 1)
    level = "GOOD" if overall >= 4.0 else "NEEDS_ATTENTION"
    return level, overall


def _save_baseline_to_db(metrics: dict[str, dict[str, float | int]]) -> None:
    db_url = (
        os.getenv("AXIORA_DATABASE_URL")
        or os.getenv("DATABASE_URL")
        or os.getenv("POSTGRES_URL")
        or ""
    ).strip()
    if not db_url:
        raise RuntimeError("PERF_BASELINE_SAVE=true but no database URL found in environment")

    engine = create_engine(db_url, future=True)
    create_sql = text(
        """
        CREATE TABLE IF NOT EXISTS performance_baseline (
            id BIGSERIAL PRIMARY KEY,
            endpoint TEXT NOT NULL,
            avg_ms DOUBLE PRECISION NOT NULL,
            p95_ms DOUBLE PRECISION NOT NULL,
            avg_queries DOUBLE PRECISION NOT NULL,
            sample_size INTEGER NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    insert_sql = text(
        """
        INSERT INTO performance_baseline (endpoint, avg_ms, p95_ms, avg_queries, sample_size)
        VALUES (:endpoint, :avg_ms, :p95_ms, :avg_queries, :sample_size)
        """
    )
    with engine.begin() as conn:
        conn.execute(create_sql)
        for endpoint, row in metrics.items():
            conn.execute(
                insert_sql,
                {
                    "endpoint": endpoint,
                    "avg_ms": float(row["avg_ms"]),
                    "p95_ms": float(row["p95_ms"]),
                    "avg_queries": float(row["avg_queries"]),
                    "sample_size": int(row["sample_size"]),
                },
            )


async def _main() -> int:
    args = _parse_args()
    base_url = args.base_url.rstrip("/")
    scenarios = _load_user_scenarios()
    performance_logs: list[dict[str, Any]] = []
    proc: asyncio.subprocess.Process | None = None

    if args.spawn_server:
        proc, performance_logs = await _spawn_api_server(args)
        base_url = f"http://{args.host}:{args.port}"
        await _wait_until_healthy(base_url, timeout_seconds=float(args.startup_timeout_seconds))

    try:
        async with httpx.AsyncClient(base_url=base_url, timeout=float(args.timeout_seconds)) as client:
            call_results = await _run_calls(
                client=client,
                scenarios=scenarios,
                specs=ENDPOINTS,
                concurrency=int(args.concurrency),
            )
    finally:
        if proc is not None:
            await asyncio.sleep(1.0)
            proc.terminate()
            try:
                await asyncio.wait_for(proc.wait(), timeout=8.0)
            except TimeoutError:
                proc.kill()
                await proc.wait()

    metrics = _compute_metrics(performance_logs, call_results, ENDPOINTS)
    total_requests = len(call_results)
    perf_level, perf_score = _classify(metrics)

    print("==== BASELINE PERFORMANCE ====")
    print(
        f"/trail -> avg: {metrics['/trail']['avg_ms']:.0f}ms | "
        f"p95: {metrics['/trail']['p95_ms']:.0f}ms | "
        f"avg_queries: {metrics['/trail']['avg_queries']:.0f}"
    )
    print(
        f"/lesson -> avg: {metrics['/lesson']['avg_ms']:.0f}ms | "
        f"p95: {metrics['/lesson']['p95_ms']:.0f}ms | "
        f"avg_queries: {metrics['/lesson']['avg_queries']:.0f}"
    )
    print(
        f"/brain_state -> avg: {metrics['/brain_state']['avg_ms']:.0f}ms | "
        f"p95: {metrics['/brain_state']['p95_ms']:.0f}ms | "
        f"avg_queries: {metrics['/brain_state']['avg_queries']:.0f}"
    )
    print(f"System Performance Level: {perf_level} ({perf_score:.1f}/5)")

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(
            {
                "generated_at": datetime.now(UTC).isoformat(),
                "base_url": base_url,
                "total_requests": total_requests,
                "users": [asdict(item) for item in scenarios],
                "metrics": metrics,
                "performance_level": perf_level,
                "performance_score": perf_score,
            },
            ensure_ascii=True,
            indent=2,
        ),
        encoding="utf-8",
    )

    should_save = (os.getenv("PERF_BASELINE_SAVE", "false").strip().lower() == "true")
    if should_save:
        _save_baseline_to_db(metrics)
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(_main()))

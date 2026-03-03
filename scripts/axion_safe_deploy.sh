#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="${ROOT_DIR}/apps/api"
PYTHON_BIN="python"
if ! command -v "${PYTHON_BIN}" >/dev/null 2>&1; then
  PYTHON_BIN="python3"
fi

AXION_API_BASE_URL="${AXION_API_BASE_URL:-http://localhost:8000}"
AXION_ADMIN_TOKEN="${AXION_ADMIN_TOKEN:-}"
AXION_TENANT_SLUG="${AXION_TENANT_SLUG:-}"
AXION_ENABLE_ROLLOUT_ACTIVATION="${AXION_ENABLE_ROLLOUT_ACTIVATION:-false}"
AXION_EXPERIMENT_KEY="${AXION_EXPERIMENT_KEY:-nba_retention_v1}"
AXION_ROLLOUT_PERCENT="${AXION_ROLLOUT_PERCENT:-5}"
AXION_ROLLOUT_STATE="${AXION_ROLLOUT_STATE:-ACTIVE}"

if [[ -z "${AXION_ADMIN_TOKEN}" ]]; then
  echo "[axion-safe-deploy] AXION_ADMIN_TOKEN is required"
  exit 1
fi
if [[ -z "${AXION_TENANT_SLUG}" ]]; then
  echo "[axion-safe-deploy] AXION_TENANT_SLUG is required"
  exit 1
fi

echo "[axion-safe-deploy] Using API dir: ${API_DIR}"
cd "${API_DIR}"

echo "[axion-safe-deploy] Step 1/5: alembic upgrade head"
"${PYTHON_BIN}" -m alembic upgrade head

echo "[axion-safe-deploy] Step 2/5: DB migrate+audit script"
"${ROOT_DIR}/scripts/axion_db_migrate_and_audit.sh"

echo "[axion-safe-deploy] Step 3/5: Validate /admin/axion/schema_status"
"${PYTHON_BIN}" - <<'PY'
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request


def _request(url: str, method: str = "GET", body: dict | None = None) -> tuple[int, dict]:
    token = os.environ["AXION_ADMIN_TOKEN"]
    tenant_slug = os.environ["AXION_TENANT_SLUG"]
    payload = None
    headers = {
        "Authorization": f"Bearer {token}",
        "X-Tenant-Slug": tenant_slug,
    }
    if body is not None:
        payload = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, method=method, data=payload, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            raw = response.read().decode("utf-8")
            parsed = json.loads(raw) if raw else {}
            return (int(response.status), parsed)
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8")
        parsed = json.loads(raw) if raw else {}
        return (int(exc.code), parsed)


base_url = os.environ.get("AXION_API_BASE_URL", "http://localhost:8000").rstrip("/")
status_code, payload = _request(f"{base_url}/admin/axion/schema_status", method="GET")
print(f"[axion-safe-deploy] schema_status code={status_code} payload={payload}")
if status_code != 200:
    raise SystemExit(1)
if not bool(payload.get("in_sync", False)):
    raise SystemExit(1)
if str(payload.get("status", "")).upper() != "OK":
    raise SystemExit(1)
PY

echo "[axion-safe-deploy] Step 4/5: Validate /admin/axion/metrics_health"
"${PYTHON_BIN}" - <<'PY'
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request


def _request(url: str) -> tuple[int, dict]:
    token = os.environ["AXION_ADMIN_TOKEN"]
    tenant_slug = os.environ["AXION_TENANT_SLUG"]
    req = urllib.request.Request(
        url,
        method="GET",
        headers={
            "Authorization": f"Bearer {token}",
            "X-Tenant-Slug": tenant_slug,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            raw = response.read().decode("utf-8")
            parsed = json.loads(raw) if raw else {}
            return (int(response.status), parsed)
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8")
        parsed = json.loads(raw) if raw else {}
        return (int(exc.code), parsed)


base_url = os.environ.get("AXION_API_BASE_URL", "http://localhost:8000").rstrip("/")
status_code, payload = _request(f"{base_url}/admin/axion/metrics_health")
print(f"[axion-safe-deploy] metrics_health code={status_code} payload={payload}")
if status_code != 200:
    raise SystemExit(1)
if not bool(payload.get("ready", False)):
    raise SystemExit(1)
PY

echo "[axion-safe-deploy] Step 5/5: Optional rollout activation"
if [[ "${AXION_ENABLE_ROLLOUT_ACTIVATION,,}" == "true" ]]; then
  "${PYTHON_BIN}" - <<'PY'
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request


base_url = os.environ.get("AXION_API_BASE_URL", "http://localhost:8000").rstrip("/")
experiment_key = os.environ.get("AXION_EXPERIMENT_KEY", "nba_retention_v1")
rollout_percent = int(os.environ.get("AXION_ROLLOUT_PERCENT", "5"))
to_state = os.environ.get("AXION_ROLLOUT_STATE", "ACTIVE")
token = os.environ["AXION_ADMIN_TOKEN"]
tenant_slug = os.environ["AXION_TENANT_SLUG"]

payload = {
    "toState": to_state,
    "rolloutPercentage": rollout_percent,
    "reason": "safe_deploy_rollout_activation",
}
req = urllib.request.Request(
    f"{base_url}/admin/axion/policy/{experiment_key}/transition",
    method="POST",
    data=json.dumps(payload).encode("utf-8"),
    headers={
        "Authorization": f"Bearer {token}",
        "X-Tenant-Slug": tenant_slug,
        "Content-Type": "application/json",
    },
)
try:
    with urllib.request.urlopen(req, timeout=15) as response:
        body = response.read().decode("utf-8")
        print(f"[axion-safe-deploy] rollout activation code={response.status} payload={body}")
        if int(response.status) != 200:
            raise SystemExit(1)
except urllib.error.HTTPError as exc:
    body = exc.read().decode("utf-8")
    print(f"[axion-safe-deploy] rollout activation failed code={exc.code} payload={body}")
    raise SystemExit(1)
PY
else
  echo "[axion-safe-deploy] Rollout activation skipped (AXION_ENABLE_ROLLOUT_ACTIVATION=false)"
fi

echo "[axion-safe-deploy] SUCCESS: Axion safe deploy checks passed."

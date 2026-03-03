$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = (Resolve-Path (Join-Path $ScriptDir "..")).Path
$ApiDir = (Resolve-Path (Join-Path $RootDir "apps/api")).Path

Write-Host "[axion-db] Using API dir: $ApiDir"
Set-Location $ApiDir

Write-Host "[axion-db] Running migrations: alembic upgrade head"
python -m alembic upgrade head

Write-Host "[axion-db] Running post-migration audit"
@'
from __future__ import annotations

import sys
from pathlib import Path

from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, text

from app.core.config import settings


def _schema_status(conn) -> tuple[str | None, str | None, bool]:
    cfg = Config(str((Path.cwd() / "alembic.ini").resolve()))
    script = ScriptDirectory.from_config(cfg)
    heads = sorted(script.get_heads())
    head_revision = ",".join(heads) if heads else None
    current_revision = MigrationContext.configure(conn).get_current_revision()
    return (current_revision, head_revision, bool(current_revision and head_revision and current_revision == head_revision))


engine = create_engine(settings.database_url, pool_pre_ping=True)
try:
    with engine.connect() as conn:
        q1 = conn.execute(
            text(
                """
                select count(*) from axion_decisions
                where decision_mode='policy' and policy_version is null
                """
            )
        ).scalar_one()

        q2 = conn.execute(
            text(
                """
                select count(*) from axion_decisions
                where decision_mode='policy' and policy_state in ('SHADOW','ROLLED_BACK')
                """
            )
        ).scalar_one()

        q3_rows = conn.execute(
            text(
                """
                select tenant_id, correlation_id, count(*)
                from axion_decisions
                where correlation_id is not null
                group by 1,2
                having count(*) > 1
                """
            )
        ).fetchall()

        current_revision, head_revision, in_sync = _schema_status(conn)
finally:
    engine.dispose()

print("[axion-db][Q1] policy decisions sem policy_version:", int(q1))
print("[axion-db][Q2] shadow/rolled_back servindo policy:", int(q2))
print("[axion-db][Q3] duplicidade de correlation rows:", len(q3_rows))
for row in q3_rows:
    print(f"[axion-db][Q3][row] tenant_id={row[0]} correlation_id={row[1]} count={row[2]}")
print("[axion-db][Q4] schema current:", current_revision)
print("[axion-db][Q4] schema head:", head_revision)
print("[axion-db][Q4] in_sync:", in_sync)

has_inconsistency = bool(int(q1) > 0 or int(q2) > 0 or len(q3_rows) > 0 or not in_sync)
if has_inconsistency:
    print("[axion-db] AUDIT FAILED: inconsistencies found.")
    raise SystemExit(1)

print("[axion-db] AUDIT PASSED: schema and data invariants are consistent.")
'@ | python -

if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

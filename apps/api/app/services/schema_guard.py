from __future__ import annotations

from dataclasses import dataclass
import logging
from pathlib import Path

from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine

from app.core.config import settings

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class SchemaStatus:
    current_revision: str | None
    head_revision: str | None
    in_sync: bool
    status: str


def _load_schema_revisions() -> tuple[str | None, str | None]:
    repo_root = Path(__file__).resolve().parents[2]
    alembic_ini = repo_root / "alembic.ini"
    alembic_cfg = Config(str(alembic_ini))
    script_dir = ScriptDirectory.from_config(alembic_cfg)
    heads = sorted(script_dir.get_heads())
    head_revision = ",".join(heads) if heads else None

    engine = create_engine(settings.database_url, pool_pre_ping=True)
    try:
        with engine.connect() as conn:
            current_revision = MigrationContext.configure(conn).get_current_revision()
    finally:
        engine.dispose()
    return (current_revision, head_revision)


def get_schema_status(*, app_env: str | None = None) -> SchemaStatus:
    env = str(app_env or settings.app_env or "development").strip().lower()
    current_revision, head_revision = _load_schema_revisions()
    in_sync = bool(current_revision and head_revision and current_revision == head_revision)
    if in_sync:
        status_label = "OK"
    elif env in {"staging", "production"}:
        status_label = "CRITICAL"
    else:
        status_label = "WARN"
    return SchemaStatus(
        current_revision=current_revision,
        head_revision=head_revision,
        in_sync=in_sync,
        status=status_label,
    )


def enforce_schema_sync_on_startup(*, app_env: str | None = None) -> SchemaStatus:
    schema = get_schema_status(app_env=app_env)
    env = str(app_env or settings.app_env or "development").strip().lower()
    if schema.in_sync:
        logger.info(
            "schema_guard_in_sync",
            extra={
                "environment": env,
                "current_revision": schema.current_revision,
                "head_revision": schema.head_revision,
            },
        )
        return schema

    if env in {"staging", "production"}:
        logger.critical(
            "schema_guard_out_of_sync",
            extra={
                "environment": env,
                "current_revision": schema.current_revision,
                "head_revision": schema.head_revision,
                "action": "fail_fast",
            },
        )
        raise SystemExit(1)

    logger.warning(
        "schema_guard_out_of_sync_dev",
        extra={
            "environment": env,
            "current_revision": schema.current_revision,
            "head_revision": schema.head_revision,
            "action": "warn_only",
        },
    )
    return schema


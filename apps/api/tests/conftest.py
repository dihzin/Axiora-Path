from __future__ import annotations

import os


os.environ.setdefault("AXIORA_DATABASE_URL", "sqlite+pysqlite:///:memory:")
os.environ.setdefault("AXIORA_REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("AXIORA_JWT_SECRET", "test-secret")
os.environ.setdefault("AXIORA_APP_ENV", "test")


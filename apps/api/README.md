# API

## Setup

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -e .[dev]
```

## Run

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Environment

Use as variaveis abaixo (prefixo `AXIORA_`):

- `AXIORA_DATABASE_URL`
- `AXIORA_REDIS_URL`
- `AXIORA_JWT_SECRET`
- `AXIORA_APP_ENV`
- `AXIORA_DATA_RETENTION_DAYS`
- `AXIORA_QUEUE_NAME`
- `AXIORA_CORS_ALLOWED_ORIGINS`
- `AXIORA_AUTH_COOKIE_SECURE`
- `AXIORA_AUTH_COOKIE_DOMAIN`
- `AXIORA_CSRF_EXEMPT_PATHS`
- `AXIORA_ACCOUNT_LOCK_MAX_ATTEMPTS`
- `AXIORA_ACCOUNT_LOCK_MINUTES`

## Structured Logging

- Middleware registra requests em JSON com:
  - `request_id`
  - `tenant_id`
  - `user_id`
  - `route`
  - `execution_time_ms`
- Header de resposta: `X-Request-Id`.
- Pronto para futuras integracoes com Datadog, Logtail e ELK.

## Error Contract

- Todas as respostas de erro seguem:
  - `code`
  - `message`
  - `details` (opcional)
- Excecoes internas retornam `500` sem stack trace no payload.

## Lint and type-check

```bash
ruff check .
mypy .
```

## Migrations

```bash
alembic revision --autogenerate -m "auto"
alembic upgrade head
```

## Retention Placeholder

```bash
python -c "from app.jobs.purge_deleted_data import run_purge_placeholder; print(run_purge_placeholder())"
```

## Worker (Background Jobs)

Rodar worker local:

```bash
python -m app.worker
```

Enfileirar jobs exemplo:

```bash
python -c "from app.jobs.enqueue import enqueue_weekly_summary; print(enqueue_weekly_summary())"
python -c "from app.jobs.enqueue import enqueue_purge_deleted_data; print(enqueue_purge_deleted_data())"
```

Jobs suportados:

- `weekly.summary.generate` (gera resumo semanal, sem envio de email)
- `purge.deleted_data` (stub de purge por retencao)

## Feature Flags

- Helper: `is_feature_enabled("ai_coach_v2", db, tenant_id=...)`
- Endpoint: `GET /features`
- Flags base:
  - `ai_coach_v2`
  - `gamification_v2`

## Security Checklist

- CORS estrito com allowlist de origens.
- Cookies de refresh e CSRF com `Secure` + `SameSite=Strict`.
- Middleware CSRF para rotas sensiveis.
- Validacao de forca de senha no signup.
- Lock de conta apos repetidas falhas de login.

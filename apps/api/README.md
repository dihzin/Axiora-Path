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

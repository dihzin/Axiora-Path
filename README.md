# axiora-path

Monorepo MVP:

- `apps/web`: Next.js 15 + TypeScript + Tailwind + shadcn
- `apps/api`: FastAPI + SQLAlchemy + Alembic
- `packages/shared`: tipos e schemas compartilhados
- `infra/docker`: Postgres + Redis

## Setup

Prerequisitos:

- Node.js 20+
- npm 10+
- Python 3.12
- Docker + Docker Compose

Instalacao:

```bash
npm install
```

```bash
cd apps/api
python -m venv .venv
.venv\Scripts\activate
pip install -e .[dev]
```

## Env Vars

API (`apps/api/.env`):

- `AXIORA_DATABASE_URL`
- `AXIORA_REDIS_URL`
- `AXIORA_JWT_SECRET`
- `AXIORA_APP_ENV`

Web (`apps/web/.env.local`):

- `NEXT_PUBLIC_API_URL` (default esperado: `http://localhost:8000`)
- `NEXT_PUBLIC_PARENT_PIN` (default no MVP: `1234`)

## Run Commands

Infra + API:

```bash
make dev
```

Web:

```bash
npm run dev:web
```

Migracoes:

```bash
make migrate
make upgrade
```

Testes API:

```bash
cd apps/api
pytest -q tests
```

Qualidade Web:

```bash
npm run lint:web
npm run typecheck:web
npm run build:web
```

## Smoke Test Checklist

1. Subir infra e API com `make dev`.
2. Rodar web com `npm run dev:web`.
3. Login no web em `/login`.
4. Confirmar fluxo `login -> select-tenant -> select-child -> child`.
5. Acessar area dos pais e validar guard de PIN (`/parent-pin`).
6. Criar/usar rotina e validar eventos no backend (`event_log`).
7. Testar modo offline no web e validar sincronizacao via `POST /sync/batch` ao voltar online.

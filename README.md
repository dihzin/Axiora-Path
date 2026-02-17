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
- `AXIORA_DATA_RETENTION_DAYS`
- `AXIORA_QUEUE_NAME`
- `AXIORA_CORS_ALLOWED_ORIGINS`
- `AXIORA_AUTH_COOKIE_SECURE`
- `AXIORA_AUTH_COOKIE_DOMAIN`
- `AXIORA_CSRF_EXEMPT_PATHS`
- `AXIORA_ACCOUNT_LOCK_MAX_ATTEMPTS`
- `AXIORA_ACCOUNT_LOCK_MINUTES`

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

Purge placeholder:

```bash
make purge-placeholder
```

Worker:

```bash
make worker
```

Queue jobs de exemplo:

```bash
make queue-weekly-summary
make queue-purge
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

## Performance Notes

- Backend:
  - `GET /routine/week` usa selecao de colunas necessarias em vez de carregar objetos ORM completos.
  - `GET /routine/weekly-metrics` usa agregacao SQL (count/sum com case) para evitar iteracao de listas em Python.
  - Indice dedicado para consulta semanal por crianca: `task_logs(child_id, date)`.
- Frontend:
  - Aprovacao no `/parent` usa update otimista da lista pendente para resposta imediata.
  - Em erro, faz rollback do estado local.
  - Apos sucesso, recarrega apenas cards secundarios (wallet/trend) em background, sem refetch completo da tela.

## Rate Limits

- Global: `100` requests por minuto por IP.
- Login: `10` tentativas em `5` minutos por IP (`POST /auth/login`).
- Contadores em Redis (`AXIORA_REDIS_URL`).

Quando excede, a API retorna `429` com:

```json
{
  "code": "RATE_LIMIT",
  "message": "Too many requests"
}
```

## Structured Logging

- Logs em JSON por request via middleware.
- Campos incluidos:
  - `request_id`
  - `tenant_id`
  - `user_id`
  - `route`
  - `execution_time_ms`
- A API retorna `X-Request-Id` em todas as respostas.
- Estrutura pronta para integracao futura com:
  - Datadog
  - Logtail
  - ELK

## Error Contract

- Erros padronizados:
  - `code`
  - `message`
  - `details` (opcional)
- Handler centralizado cobre:
  - `HTTPException`
  - validacao (`422`)
  - excecoes inesperadas (`500`)
- Stack trace interno nao e retornado na resposta da API.

## Audit Log

- Tabela `audit_log` registra:
  - `task.create`, `task.update`, `task.delete`
  - `task.approve`, `task.reject`
  - `wallet.adjust`
  - `goal.create`
  - `pin.change`
- Endpoint: `GET /audit?tenant_id={id}` (apenas role `PARENT`).

## Privacy Foundation

- Tabela `parental_consent`:
  - `tenant_id`
  - `accepted_terms_at`
  - `accepted_privacy_at`
  - `data_retention_policy_version`
- Endpoints:
  - `GET /legal`
  - `POST /legal/accept`
- Bloqueio de uso:
  - Enquanto consentimento nao estiver aceito, a API bloqueia uso do sistema para rotas de produto.
  - Rotas de `auth`, `legal` e `health` permanecem acessiveis para concluir onboarding legal.
- Estrutura para COPPA:
  - A resposta de `/legal` inclui `coppa_ready` (atualmente `false`) para futura extensao de compliance.

## Soft Delete and Retention

- Soft delete com `deleted_at` para:
  - `tenants`
  - `child_profiles`
  - `tasks`
- Tarefas removidas via `DELETE /tasks/{id}` agora marcam `deleted_at` e saem das consultas ativas.
- Placeholder de purge:
  - `apps/api/app/jobs/purge_deleted_data.py`
  - Usa `AXIORA_DATA_RETENTION_DAYS` para calcular candidatos a remocao definitiva.

## Background Processing

- Fila simples com Redis (`RPUSH`/`BLPOP`) em `apps/api/app/services/queue.py`.
- Worker dedicado em `apps/api/app/worker.py`.
- Jobs exemplo:
  - `weekly.summary.generate` (gera resumo semanal e persiste evento `weekly.summary.generated`)
  - `purge.deleted_data` (stub de purge por retencao)

## Feature Flags

- Tabela `feature_flags`:
  - `id`
  - `name`
  - `enabled_globally`
  - `tenant_id` (nullable, para override por tenant)
- Helper backend:
  - `is_feature_enabled("ai_coach_v2", db, tenant_id=...)`
- Endpoint:
  - `GET /features`
- Flags base para proximas fases:
  - `ai_coach_v2`
  - `gamification_v2`

## Security Checklist

- CORS estrito:
  - sem wildcard; usa `AXIORA_CORS_ALLOWED_ORIGINS`.
- Cookies de auth:
  - refresh token com `HttpOnly`, `Secure`, `SameSite=Strict`.
  - CSRF cookie com `Secure`, `SameSite=Strict`.
- Protecao CSRF:
  - middleware exige `X-CSRF-Token` para fluxos com cookie (`/auth/refresh`, `/auth/logout` e sessoes com cookie ativa).
- Senha forte:
  - minimo 10 chars, uppercase, lowercase, numero e simbolo.
- Lock de conta:
  - bloqueio temporario apos tentativas repetidas de login invalido.
  - configuravel por `AXIORA_ACCOUNT_LOCK_MAX_ATTEMPTS` e `AXIORA_ACCOUNT_LOCK_MINUTES`.
- Padrao de erro:
  - sem vazamento de stack trace em resposta de API.

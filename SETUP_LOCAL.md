# Axiora Path - Setup Local (Offline / Sem GitHub)

Este guia padroniza o ambiente local para quem recebeu uma copia do projeto em `.zip`/pasta, sem acesso ao GitHub.

## 1) Requisitos

- Node.js 20+
- npm 10+
- Python 3.12
- Docker Desktop (com Docker Compose)
- Windows PowerShell (comandos abaixo estao em PowerShell)

## 2) Estrutura esperada

Raiz do projeto:

```powershell
cd "c:\DEV\Axiora Path"
```

## 3) Infra local (Postgres + Redis)

Subir infraestrutura:

```powershell
docker compose -f infra/docker/docker-compose.yml up -d
docker compose -f infra/docker/docker-compose.yml ps
```

Credenciais padrao do Postgres (docker):

- host: `localhost`
- porta: `5432`
- database: `axiora`
- user: `axiora`
- password: `axiora`

## 4) Variaveis de ambiente

### API (`apps/api/.env`)

Copie de `apps/api/.env.example` e ajuste:

```env
AXIORA_DATABASE_URL=postgresql+psycopg://axiora:axiora@localhost:5432/axiora
AXIORA_REDIS_URL=redis://localhost:6379/0
AXIORA_JWT_SECRET=AxioraLocal@2026
AXIORA_APP_ENV=development
AXIORA_CORS_ALLOWED_ORIGINS=http://localhost:3000
AXIORA_AUTH_COOKIE_SECURE=false
AXIORA_AUTH_COOKIE_SAMESITE=lax
```

### Web (`apps/web/.env.local`)

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## 5) Instalar dependencias

### Monorepo (frontend)

```powershell
cd "c:\DEV\Axiora Path"
npm install
```

### API (venv + pacotes)

```powershell
cd "c:\DEV\Axiora Path\apps\api"
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -e .[dev]
```

## 6) Migrations e auditoria de schema

Na raiz:

```powershell
cd "c:\DEV\Axiora Path"
.\scripts\axion_db_migrate_and_audit.ps1
```

Esse script executa:

- `alembic upgrade head`
- auditoria de consistencia pos-migration

## 7) Seeds recomendados (evitar trilha vazia)

No terminal da API (com venv ativo):

```powershell
cd "c:\DEV\Axiora Path\apps\api"
python scripts/seed_aprender_curriculum_structure.py
python scripts/seed_aprender_content.py
python scripts/bootstrap_learning_retention.py
python scripts/seed_question_bank_math_portuguese.py
python scripts/seed_question_templates_hybrid.py
```

Observacao: o sistema possui bootstrap de seguranca para nao quebrar com trilha vazia, mas o ideal para QA local e rodar os seeds acima.

## 8) Subir API e Web

### Terminal API

```powershell
cd "c:\DEV\Axiora Path\apps\api"
.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Terminal Web

```powershell
cd "c:\DEV\Axiora Path"
npm run dev --workspace @axiora/web
```

Acessos:

- Web: `http://localhost:3000`
- API docs: `http://localhost:8000/docs`
- Health: `http://localhost:8000/health`

## 9) Usuarios recomendados para teste

Use contas separadas por tenant (familia), para validar isolamento:

1. `parent.alpha@local.com` (PARENT) - tenant `familia-alpha`
2. `parent.beta@local.com` (PARENT) - tenant `familia-beta`

Senha recomendada (atende regra de seguranca: >=10, maiuscula, minuscula, numero, simbolo):

- `Axiora@12345`

Criacao das contas:

- Preferencial: fluxo de signup no frontend.
- Alternativa: `POST /auth/signup` via docs.

Importante:

- No MVP, perfil `CHILD` nao faz login direto em `/auth/login`.
- Criacao de crianca acontece no onboarding (`/onboarding/complete`) apos signup/login do responsavel.

## 10) Checklist rapido de validacao

1. `GET /health` retorna 200.
2. Login de `parent.alpha@local.com` com tenant `familia-alpha` funciona.
3. Onboarding cria child profile e PIN.
4. Tela de trilha (`/child/aprender`) carrega sem erro 500.
5. Sem erro de schema no log da API.

## 11) Troubleshooting de banco (mais comum)

### Erro: `password authentication failed`

- Verifique `AXIORA_DATABASE_URL` no `apps/api/.env`.
- Verifique credenciais do container:

```powershell
docker exec -it axiora-postgres psql -U axiora -d axiora -c "select current_user, current_database();"
```

### Erro: `relation ... does not exist`

- Migrations nao aplicadas:

```powershell
cd "c:\DEV\Axiora Path\apps\api"
.venv\Scripts\Activate.ps1
alembic current
alembic heads
alembic upgrade head
```

### Erro: `Learning path unavailable. Run latest migrations/seeds.`

- Rode migrations + seeds (secao 6 e 7).

### Ambiente corrompido (reset total local)

```powershell
cd "c:\DEV\Axiora Path"
docker compose -f infra/docker/docker-compose.yml down -v
docker compose -f infra/docker/docker-compose.yml up -d
.\scripts\axion_db_migrate_and_audit.ps1
```

## 12) Opcional: Postgres local fora do Docker

Se a pessoa nao usar Docker, crie user+db manualmente:

```sql
CREATE USER axiora WITH PASSWORD 'axiora';
CREATE DATABASE axiora OWNER axiora;
GRANT ALL PRIVILEGES ON DATABASE axiora TO axiora;
```

E mantenha `AXIORA_DATABASE_URL` apontando para esse Postgres.


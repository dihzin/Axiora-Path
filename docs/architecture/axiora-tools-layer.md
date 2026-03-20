# Axiora Tools: Arquitetura de Camada de Monetizacao Imediata

- Data: `2026-03-19`
- Status: `Proposta pronta para execucao`
- Escopo: `apps/web + apps/api`

## Objetivo

Criar uma camada de monetizacao rapida (`Axiora Tools`) separada do core da plataforma, com:

- Zero impacto nas rotas e fluxos existentes do produto principal.
- Reuso de backend e infra ja existentes (FastAPI + Redis + auth atual).
- Caminho de migracao progressiva para o core quando houver product-market fit.

## Mapa de rotas (frontend)

- `/tools`: vitrine de ferramentas e entrada comercial.
- `/tools/[slug]`: pagina dedicada por ferramenta.
- `/beta`: captura de interesse e onboarding leve.
- `/app`: alias de navegacao para o produto principal (redireciona para `/child`).
- Rotas existentes (`/login`, `/child/*`, `/(app)/*`) permanecem inalteradas.

## Mapa de rotas (backend)

Todas as novas rotas sob namespace isolado:

- `GET /api/tools/catalog`
- `POST /api/tools/guest-session`
- `POST /api/tools/identify`
- `POST /api/tools/link-account`

Nao ha alteracao de contrato nas rotas antigas.

## Estrutura de pastas recomendada

### Frontend (`apps/web`)

```text
app/
  app/page.tsx                # alias para produto principal
  beta/page.tsx               # captura de usuarios
  tools/page.tsx              # landing de tools
  tools/[slug]/page.tsx       # pagina de produto rapido
lib/
  api/client.ts               # (opcional) wrappers de /api/tools/*
```

### Backend (`apps/api`)

```text
app/
  api/routes/tools.py         # namespace /api/tools/*
  schemas/tools.py            # contratos request/response
  services/tools_service.py   # regras guest/light/link + Redis
```

## Modelo de dados necessario (alvo)

## Fase 1 (imediata, sem migracao de schema)

Persistencia em Redis por sessao:

- `tools:session:{token}`
- Campos: `mode`, `tool_slug`, `source_path`, `utm`, `email`, `linked_user_id`, `linked_tenant_id`, `created_at`, `updated_at`, `expires_at`
- TTL padrao: 7 dias

Vantagem: entrega rapida sem tocar no schema SQL atual (evita risco no core).

## Fase 2 (core-ready, com migracao)

Tabelas alvo:

- `tools_catalog` (catalogo de ferramentas)
- `tools_sessions` (guest/light sessions)
- `tools_leads` (captura de e-mail e status de funnel)
- `tools_account_links` (ligacao para user/tenant do core)
- `tools_usage_events` (telemetria e conversao)

## Estrategia de autenticacao

1. `Guest` (sem login)
- Entrada por `POST /api/tools/guest-session`
- Sessao anonima com token curto e TTL.

2. `Usuario leve` (somente email)
- Upgrade via `POST /api/tools/identify`
- Mesma sessao evolui para `mode=light_user`.

3. `Conta completa` (core Axiora)
- Link autenticado via `POST /api/tools/link-account` com JWT + `X-Tenant-Slug`.
- Sessao passa para `mode=linked`.

## Guardrails de nao regressao

- Namespace isolado em `/api/tools/*`.
- Nenhuma mudanca em rotas existentes.
- Nenhuma mudanca de schema SQL nesta fase.
- Reuso do Redis ja inicializado no `app.state`.

## Evolucao para o produto principal

- Manter `tools_service` com contrato estavel.
- Migrar backend de Redis para tabelas SQL sem mudar API publica.
- Habilitar SSO entre `light_user` e `core_user`.
- Gradualmente mover tools validados para areas do core (`/app/*` interno), preservando redirects.

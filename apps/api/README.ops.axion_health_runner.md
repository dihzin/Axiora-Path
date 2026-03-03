# Axion Health Runner Ops Runbook

## Objetivo

Operar `POST /admin/experiments/health/run` via cron externo com rotacao segura de segredo.

## Configuracao de segredo (recomendada)

Use lista de segredos:

- `AXION_HEALTH_RUNNER_CRON_SECRETS=secret_v1,secret_v2`

Compatibilidade legada (evitar para novos ambientes):

- `AXION_HEALTH_RUNNER_CRON_SECRET=secret_legacy`

Regra de precedencia:

- Se `AXION_HEALTH_RUNNER_CRON_SECRETS` estiver preenchida, ela prevalece.
- `AXION_HEALTH_RUNNER_CRON_SECRET` so e usado quando a lista estiver vazia.

## Rotacao segura (zero downtime)

1. Adicionar novo segredo mantendo o antigo:
   - Ex.: `AXION_HEALTH_RUNNER_CRON_SECRETS=secret_old,secret_new`
2. Deploy da API com a nova lista.
3. Atualizar o cron externo para enviar `X-CRON-SECRET: secret_new`.
4. Validar execucao (status 200 e telemetria).
5. Remover segredo antigo da lista:
   - Ex.: `AXION_HEALTH_RUNNER_CRON_SECRETS=secret_new`
6. Deploy final.

## Frequencia recomendada de rotacao

- Alta criticidade: 30 dias
- Media criticidade: 60 dias
- Baixa criticidade: 90 dias

## Checklist de validacao pos-rotacao

1. Executar trigger manual:
   - `POST /admin/experiments/health/run` com novo `X-CRON-SECRET`
2. Verificar autenticacao cron:
   - `GET /admin/experiments/health/cron_auth_status`
   - Esperado: `secrets_configured_count > 0` e `status=OK`
3. Verificar runtime:
   - `GET /admin/experiments/health/runtime_status`
   - Esperado: `status` dentro da janela operacional
4. Verificar heartbeat:
   - `GET /admin/experiments/health/heartbeat`
   - Esperado: novos registros apos trigger

## Alertas operacionais

- `cron_auth_status.status = WARN`: lista de segredos vazia.
- `runtime_status.status = CRITICAL`: atraso acima de 2x da janela esperada.

## Backoff recomendado para cron externo

Se `POST /admin/experiments/health/run` retornar `500`:

1. Repetir tentativa apos ~2 minutos com jitter.
2. Se falhar de novo, repetir apos ~5 minutos com jitter.
3. Se terceira tentativa falhar, escalar para on-call e verificar `trigger_log`, `runtime_status` e `heartbeat`.

## Pre-deploy DB guard (Axion Decisions)

Antes de deploy em staging/producao, rode migration + auditoria de consistencia:

- PowerShell:
  - `./scripts/axion_db_migrate_and_audit.ps1`
- Bash:
  - `./scripts/axion_db_migrate_and_audit.sh`

O script executa:

1. `alembic upgrade head`
2. Auditoria SQL:
   - Q1: policy sem `policy_version`
   - Q2: `SHADOW/ROLLED_BACK` servindo `policy`
   - Q3: duplicidade `(tenant_id, correlation_id)`
   - Q4: `alembic current` vs `head`

Comportamento:

- Se qualquer inconsistencia for encontrada, termina com `exit code != 0`.
- Se tudo estiver consistente, termina com `exit code = 0`.

Uso recomendado:

1. Local/staging: rodar antes de validar smoke de `/api/axion/brief`.
2. Pipeline/pre-deploy: rodar como gate obrigatorio antes de promover para producao.

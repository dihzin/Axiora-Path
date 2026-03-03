# Axion Production Runbook

## Objetivo
Garantir deploy seguro do Axion em producao, bloqueando release com schema fora de `head`, invariantes quebradas ou observabilidade indisponivel.

## Pre-requisitos
- Variaveis de ambiente configuradas no backend (`AXIORA_*`).
- Acesso admin valido para endpoints `/admin/*`.
- Banco alvo acessivel.
- Dependencias instaladas em `apps/api`.

## Checklist de deploy seguro
1. Aplicar migrations:
   - `cd apps/api`
   - `python -m alembic upgrade head`
2. Rodar auditoria pos-migracao:
   - Linux/macOS: `./scripts/axion_db_migrate_and_audit.sh`
   - Windows: `./scripts/axion_db_migrate_and_audit.ps1`
3. Validar schema via API admin:
   - `GET /admin/axion/schema_status`
   - Esperado: `in_sync=true` e `status=OK`
4. Validar observabilidade do Axion:
   - `GET /admin/axion/metrics_health`
   - Esperado: `ready=true`
5. Ativar rollout gradual (sem big bang):
   - `POST /admin/axion/policy/{experiment_key}/transition`
   - Exemplo inicial: `rolloutPercentage=5`
   - Progressao recomendada: `5 -> 10 -> 25 -> 50 -> 75 -> 100`

## Script recomendado (safe deploy)
Use o script unico abaixo para padronizar o fluxo:

```bash
./scripts/axion_safe_deploy.sh
```

### Variaveis esperadas pelo script
- `AXION_API_BASE_URL` (default: `http://localhost:8000`)
- `AXION_ADMIN_TOKEN` (obrigatoria)
- `AXION_TENANT_SLUG` (obrigatoria)
- `AXION_ENABLE_ROLLOUT_ACTIVATION` (default: `false`)
- `AXION_EXPERIMENT_KEY` (default: `nba_retention_v1`)
- `AXION_ROLLOUT_PERCENT` (default: `5`)
- `AXION_ROLLOUT_STATE` (default: `ACTIVE`)

## Criterios de bloqueio (deploy abortado)
O deploy deve falhar (`exit_code != 0`) quando:
- `alembic upgrade head` falhar.
- Auditoria SQL detectar inconsistencias.
- `/admin/axion/schema_status` nao estiver em sync.
- `/admin/axion/metrics_health` nao estiver pronto.
- Ativacao de rollout (quando habilitada) falhar.

## Rollback operacional rapido
1. Acionar kill-switch:
   - `POST /admin/axion/kill_switch` com `{"enabled": true}`
2. Verificar heartbeat do health runner:
   - `GET /admin/experiments/health/runtime_status`
3. Reavaliar schema/metricas antes de reativar rollout.

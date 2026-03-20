# ADR 0002: Axiora Tools como Camada de Monetizacao Imediata

- Status: `Accepted`
- Data: `2026-03-19`
- Decisores: `Produto + Engenharia Axiora Path`

## Contexto

O Axiora Path esta com cerca de 65% do core em construcao e precisa iniciar monetizacao sem esperar todo o ciclo de produto principal.

Requisitos:

- Entregar produtos rapidos com baixo risco tecnico.
- Preservar completamente o core existente.
- Reusar backend e infraestrutura para reduzir custo e tempo.
- Garantir caminho de convergencia futura para o produto principal.

## Decisao

Criar `Axiora Tools` como camada separada porem integrada:

- Frontend dedicado em `/tools` e `/beta`.
- Namespace de API isolado em `/api/tools/*`.
- Persistencia inicial de sessao/lead em Redis (sem migracao de schema SQL).
- Ligacao com conta completa feita por fluxo explicito (`guest -> light_user -> linked`).

## Razao principal

Separar reduz risco de regressao no core e acelera experimentacao comercial.
Integrar pelo backend existente evita duplicacao de servicos criticos.

## Consequencias

### Positivas

- Time-to-revenue menor.
- Zero impacto esperado nas rotas atuais.
- Estrutura pronta para graduacao dos tools para o core.
- Menor custo operacional inicial.

### Trade-offs

- Dados de captura em Redis na fase 1 possuem menor historico analitico.
- Exige disciplina para migrar o que provar valor para tabelas do core.

## Evolucao para o produto principal

1. Validar conversao por tool em `/tools` + `/beta`.
2. Migrar persistencia Redis -> SQL com backfill.
3. Ativar SSO e unificacao de perfil.
4. Promover tools de maior LTV para trilhas do core.

## Guardrails

- Sem alterar contratos existentes fora do namespace `/api/tools/*`.
- Sem introduzir dependencia obrigatoria de tools no fluxo do core.
- Sem quebrar isolamento multi-tenant em rotas autenticadas.
- Toda migracao futura deve preservar compatibilidade de API.

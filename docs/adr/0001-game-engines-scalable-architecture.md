# ADR 0001: Arquitetura Escalável de Game Engines (40 -> 400 jogos)

- Status: `Accepted`
- Data: `2026-02-21`
- Decisores: `Produto + Engenharia Axiora Path`

## Contexto

O Axiora Path precisa escalar de poucos jogos para um catálogo extenso (40+ imediato, 400+ futuro), com:

- Conteúdo 100% orientado a banco
- Multi-tenant (`FAMILY`, `SCHOOL`)
- Personalização adaptativa (Axion) sem acoplamento ao frontend
- Reuso máximo de motores para evitar código duplicado

## Decisão

Adotar arquitetura **engine-first + template-driven**:

1. Jogos são instâncias de `game_templates` associadas a `game_engines`.
2. Variações e níveis são dados (`game_variations`, `game_levels`) e não código.
3. Sessões e métricas cognitivas são persistidas (`game_sessions`, `skill_metrics`, `cognitive_signals`).
4. O frontend renderiza experiências por contrato (schema/config), não por game hardcoded.
5. Axion ajusta dificuldade/ordem/recompensa via políticas sobre sinais persistidos.

## Motores padronizados

- QUIZ
- DRAG_DROP
- TIMED_CHALLENGE
- SIMULATION
- STORY
- PUZZLE
- MEMORY
- GRID
- STRATEGY
- CREATION

## Consequências

### Positivas

- Acelera criação de jogos por configuração.
- Reduz custo de manutenção e regressão.
- Facilita A/B tests por tenant e por faixa etária.
- Permite evolução de personalização Axion sem refatorar todos os jogos.

### Trade-offs

- Investimento inicial maior em contratos e validação de schema.
- Exige disciplina de versionamento dos templates.
- Observabilidade passa a ser mandatória para diagnosticar variações ruins.

## Regras não negociáveis

- Sem conteúdo hardcoded no frontend.
- Sem lógica de engine espalhada por telas.
- Qualquer novo jogo precisa mapear para engine existente antes de propor engine nova.
- APIs versionadas e payloads com compatibilidade retroativa.

## Plano de rollout

1. Infra de dados + contratos.
2. 3 motores pilotos (Quiz, Drag&Drop, Timed).
3. Camada de catálogo e publicação por tenant.
4. Axion adaptativo em loop fechado.
5. Escala progressiva para 40+ e depois 400+.


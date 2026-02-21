# Multiplayer Engine Generalization (AXIORA_STRATEGIC_ENGINE)

## 1. Executive Summary
- O multiplayer foi refatorado para uma camada genérica baseada em adapters por engine.
- O fluxo de sessão agora suporta múltiplos tipos de jogo sem duplicar regras de orquestração.
- Mantemos compatibilidade com o fluxo atual do Jogo da Velha e abrimos caminho para Quiz Battle, Desafio Matemático, Puzzle Cooperativo e Batalha Financeira.
- O backend centraliza `start_session`, `join_session`, `apply_move`, `get_state`, `end_session`.
- Segurança infantil e isolamento multi-tenant seguem obrigatórios em todos os endpoints.

## 2. Cognitive Twin Assessment
- Eventos multiplayer podem alimentar CTM com sinais de estratégia, persistência e recuperação pós-erro.
- `engineState` viabiliza métricas pedagógicas por engine sem alterar contrato de sessão.
- Revisão futura: registrar misconception clusters por tipo de ação/movimento.

## 3. Brain Path Architecture Proposal
```text
Client (Next.js)
  -> /api/games/multiplayer/session/*
FastAPI Router
  -> Multiplayer Engine Registry
      -> TicTacToe Adapter
      -> Quiz Battle Adapter
      -> Math Challenge Adapter
      -> Puzzle Coop Adapter
      -> Finance Battle Adapter
  -> Postgres (game_sessions, game_participants, game_moves)
  -> WS Hub (realtime) + polling fallback
```

## 4. Neuroeducation Optimization Opportunities
- Quiz Battle: reforço por recuperação ativa (retrieval).
- Math Challenge: cadência curta e feedback imediato.
- Puzzle Coop: colaboração com baixa ansiedade competitiva.
- Finance Battle: tomada de decisão com consequência simulada.

## 5. Behavioral & Emotional Safety Review
- Sem chat aberto e sem matchmaking público.
- Sessão privada por token/código curto com expiração.
- Turnos e regras explícitas, reduzindo frustração por ambiguidade.

## 6. Learning Analytics Gaps
- Próximo passo: persistir `skill_metrics` por `engine_key` e `move_payload`.
- Medir taxa de conclusão por engine e delta de mastery por sessão.

## 7. AI Cost & Scalability Risk
- Engine é determinística; LLM opcional apenas para explicação contextual.
- WS best-effort com fallback HTTP evita indisponibilidade total.

## 8. Multi-Tenant Impact
- Todas as operações filtram por `tenant_id`.
- Join/session state só retorna dados para participantes do tenant correto.

## 9. Phased Implementation Roadmap
- Fase 1 (entregue): abstraction layer + registry + enum expansion.
- Fase 2: adapters completos para engines não-tabuleiro com UI dedicada.
- Fase 3: telemetria cognitiva e balanceamento adaptativo por idade.
- Fase 4: modo SCHOOL supervisionado (professor controla início/fim).

## 10. Quick Wins
- Reutilizar mesma infraestrutura de sessão para novos jogos.
- Unificar payload de movimento com `action/payload` além de `cellIndex`.

## 11. Long-Term Differentiation Strategy
- Multiplayer orientado a aprendizagem e não somente competição.
- Adapters permitem escalar 40+ jogos mantendo governança técnica.

## 12. Axiora Maturity Score + Blockers
- Score atual: **8.1/10** na camada multiplayer.
- Blockers para 9.5+: persistência completa de métricas cognitivas por engine e supervisor mode de escola com controle pedagógico.


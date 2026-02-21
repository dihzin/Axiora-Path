# Axiora Multiplayer QR (Tic-Tac-Toe) - AXIORA_STRATEGIC_ENGINE

## 1. Executive Summary
- O MVP multiplayer 1v1 do Axiora inicia no Jogo da Velha com entrada privada por QR Code ou código curto.
- O acesso é fechado (sem matchmaking aberto), compatível com FAMILY e SCHOOL e sem chat livre.
- A sessão multiplayer usa `game_sessions` como agregado principal e as tabelas `game_participants` e `game_moves` para consistência.
- O estado é sincronizado por polling no MVP, com evolução planejada para WebSocket com Redis Pub/Sub.
- Segurança infantil: token efêmero, código curto expira, isolamento por tenant e sem conteúdo livre entre usuários.
- O mesmo contrato é reutilizável para outros jogos por `game_type` e `metadata` de engine.

## 2. Cognitive Twin Assessment
- Multiplayer não mede apenas vitória/derrota; captura sinais de persistência, tomada de decisão e controle de erro.
- Eventos de jogada (`game_moves`) alimentam `cognitive_signals` em fase 2 (latência, hesitação, reversão estratégica).
- O CTM deve ler padrões como: jogadas precipitadas, bloqueio tardio e abandono de sessão.

## 3. Brain Path Architecture Proposal
- Sessões multiplayer são sessões de aprendizagem social com reforço de estratégia e autorregulação.
- O Axion pode recomendar:
  - `OFFER_GAME_BREAK` quando frustração subir,
  - `OFFER_MICRO_MISSION` pós-partida para recuperar confiança,
  - revisão guiada em caso de sequência de derrotas.
- O mesmo pipeline permite ligar resultados do multiplayer ao caminho adaptativo.

## 4. Neuroeducation Optimization Opportunities
- Sessões curtas (3-5 min), com turnos claros e feedback não punitivo.
- Regras sem chat reduzem sobrecarga cognitiva e risco comportamental.
- Para 6-8 anos: UX simplificada (ícones grandes, poucos controles).
- Para 13-15 anos: telemetria estratégica mais detalhada (tempo por decisão e padrões de defesa/ataque).

## 5. Behavioral & Emotional Safety Review
- Sem matchmaking aberto.
- Sem chat livre.
- Sem ranking público por “inteligência”.
- Compartilhamento apenas por convite (QR/código curto), com expiração e vínculo ao tenant.
- Sessões canceladas automaticamente por inatividade/expiração.

## 6. Learning Analytics Gaps
- MVP ainda não grava `cognitive_signals` por jogada.
- Falta score de “qualidade estratégica” separado de vitória.
- Próxima etapa: métricas por idade (tempo médio por turno, erros evitáveis, jogadas de bloqueio).

## 7. AI Cost & Scalability Risk
- MVP não depende de LLM.
- Para escala, usar Redis para presença e broadcast de estado.
- Persistência permanece no Postgres; Redis fica transitório.
- Custos de IA futuros ficam opcionais para explicação pós-jogo (não para decisão crítica de partida).

## 8. Multi-Tenant Impact
- Cada sessão multiplayer pertence a um `tenant_id`.
- Join só funciona dentro do mesmo tenant.
- Compatível com FAMILY (pai/filho) e SCHOOL (pares da turma).
- Sem vazamento inter-tenant por token/código.

## 9. Phased Implementation Roadmap
### MVP (entregue)
- Tabelas: `game_participants`, `game_moves`, extensões em `game_sessions`.
- API: criar sessão, entrar por código/token, consultar estado, jogar, encerrar.
- Estado: polling.

### Escala 1
- Canal WebSocket por sessão.
- Redis Pub/Sub para sincronização horizontal.
- Presença/heartbeat por jogador.

### Escala 2
- Replay curto da partida.
- Moderation flags para comportamento abusivo indireto (abandono repetido em SCHOOL).
- Extensão para outros `game_type` além de `TICTACTOE`.

## 10. Quick Wins
- Exibir QR com validade restante.
- Botão “copiar código” e fallback manual.
- Tela de espera com status do segundo jogador.
- Pós-jogo com CTA de revisão curta.

## 11. Long-Term Differentiation Strategy
- “Duelo pedagógico” por habilidade (não só vitória) com feedback instrutivo.
- Multiplayer cooperativo para SCHOOL (resolver juntos metas curtas).
- Missões sociais seguras (família/turma) com foco em consistência, não competição tóxica.

## 12. Axiora Maturity Score (1-10) + blockers to 9.5+
- Maturidade atual: **7.4/10**.
- Blockers:
  - falta sincronização em tempo real via socket,
  - ausência de métricas cognitivas por jogada,
  - falta de expansão de engine multiplayer para 3+ jogos.

---

## Modelo de dados (resumo)
- `game_sessions`
  - `session_status`: `WAITING | IN_PROGRESS | FINISHED | CANCELLED`
  - `multiplayer_mode`: `SOLO | PVP_PRIVATE`
  - `join_token`, `join_code`, `expires_at`, `tenant_id`, `metadata`
- `game_participants`
  - host/convidado, papel (`X`/`O`)
- `game_moves`
  - sequência da jogada, payload do movimento

## Fluxo UX (resumo)
1. Jogador escolhe “2 jogadores” no Jogo da Velha.
2. Sistema cria sessão e mostra QR + código curto.
3. Jogador 2 entra por QR/código.
4. Tela de espera vira partida quando ambos conectarem.
5. Jogadas alternadas com validação de turno.
6. Encerramento com resultado + recompensa + próximo passo.

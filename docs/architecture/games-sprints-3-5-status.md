# Games Program - Sprint 3 to 5 Status

## Sprint 3 (Infra multiplayer base) - DONE
- Migração `0057_mp_tictactoe_qr` criada.
- `game_sessions` estendido com:
  - `tenant_id`, `session_status`, `multiplayer_mode`,
  - `join_token`, `join_code`, `expires_at`, `metadata`.
- Tabelas novas:
  - `game_participants`
  - `game_moves`
- API nova:
  - `POST /api/games/multiplayer/session/create`
  - `POST /api/games/multiplayer/session/join`
  - `GET /api/games/multiplayer/session/{session_id}`
  - `POST /api/games/multiplayer/session/{session_id}/move`
  - `POST /api/games/multiplayer/session/{session_id}/close`

## Sprint 4 (UX operacional no jogo) - DONE
- Jogo da Velha com fluxo:
  - escolha de modo (`1 jogador` / `2 jogadores`),
  - criação de convite privado,
  - entrada por código curto,
  - espera do segundo jogador,
  - polling de estado (MVP).
- Integração completa do frontend com os endpoints multiplayer.

## Sprint 5 (Integração adaptativa Axion) - DONE
- Encerramento de sessão multiplayer passa a gerar sinais para Axion:
  - `GAME_PLAYED` para cada participante.
- Payload inclui:
  - resultado (`WIN/LOSS/DRAW`),
  - papel (`X/O`),
  - contagem de jogadas.
- Sinais evitam duplicidade via flag em `game_sessions.metadata`.

## Próxima evolução recomendada
1. Migrar polling para WebSocket + Redis Pub/Sub.
2. Adicionar presença (`heartbeat`) e reconexão resiliente.
3. Expandir multiplayer para mais engines (ex.: quiz de duelo rápido).

# Axiora Path Game Engines Blueprint

## 1) Blueprint de pastas (monorepo)

```text
apps/
  api/
    app/
      api/routes/
        games.py
        game_sessions.py
        game_catalog.py
      services/games/
        engine_registry.py
        engine_runtime.py
        difficulty_policy.py
        axion_adapter.py
        validators/
          quiz_validator.py
          drag_drop_validator.py
          timed_validator.py
      repositories/
        games_repository.py
      schemas/
        game_catalog.py
        game_session.py
      models/
        game_engine.py
        game_template.py
        game_variation.py
        game_level.py
        game_session.py
        skill_metric.py
        cognitive_signal.py
      jobs/
        game_metrics_rollup.py
  web/
    app/
      child/games/
        page.tsx
        [gameId]/page.tsx
    components/games/
      game-shell.tsx
      game-header.tsx
      game-result-modal.tsx
      renderers/
        quiz-renderer.tsx
        drag-drop-renderer.tsx
        timed-renderer.tsx
      hooks/
        use-game-session.ts
        use-game-runtime.ts
    lib/games/
      registry.ts
      schema.ts
      adapters.ts
      telemetry.ts
docs/
  adr/
  architecture/
  api/
```

## 2) Domínio de dados (conceitual)

- `game_engines`: metadados do motor.
- `game_templates`: definição publicável do jogo (conteúdo base).
- `game_variations`: variações parametrizadas por template/faixa etária.
- `game_levels`: progressão por dificuldade e objetivos.
- `game_sessions`: execução por usuário.
- `skill_metrics`: agregação por habilidade.
- `cognitive_signals`: sinais finos (latência, persistência, frustração, foco etc.).

## 3) ERD conceitual

```text
tenants 1---n game_templates n---1 game_engines
game_templates 1---n game_variations
game_templates 1---n game_levels
users 1---n game_sessions n---1 game_templates
game_sessions 1---n cognitive_signals
users 1---n skill_metrics
skills 1---n skill_metrics
```

## 4) SQL base (Postgres)

```sql
create table if not exists game_engines (
  id uuid primary key,
  key varchar(64) unique not null, -- QUIZ, DRAG_DROP, ...
  name varchar(120) not null,
  schema_version int not null default 1,
  config_schema jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists game_templates (
  id uuid primary key,
  tenant_id bigint null,
  engine_id uuid not null references game_engines(id),
  subject varchar(64) not null,
  age_group varchar(16) not null, -- 6-8, 9-12, 13-15
  title varchar(160) not null,
  description text null,
  version int not null default 1,
  status varchar(24) not null default 'DRAFT', -- DRAFT, PUBLISHED, ARCHIVED
  content jsonb not null,
  flags jsonb not null default '{}'::jsonb, -- future_ai_personalization, a/b, etc.
  created_by bigint null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_game_templates_subject_age on game_templates(subject, age_group);

create table if not exists game_variations (
  id uuid primary key,
  template_id uuid not null references game_templates(id) on delete cascade,
  variation_key varchar(80) not null,
  difficulty varchar(16) not null, -- EASY, MEDIUM, HARD
  locale varchar(16) not null default 'pt-BR',
  config jsonb not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique(template_id, variation_key)
);

create table if not exists game_levels (
  id uuid primary key,
  template_id uuid not null references game_templates(id) on delete cascade,
  level_order int not null,
  level_name varchar(80) not null,
  target_score int not null,
  xp_reward int not null,
  coins_reward int not null default 0,
  time_limit_sec int null,
  config jsonb not null default '{}'::jsonb,
  unique(template_id, level_order)
);

create table if not exists game_sessions (
  id uuid primary key,
  tenant_id bigint not null,
  user_id bigint not null,
  template_id uuid not null references game_templates(id),
  variation_id uuid null references game_variations(id),
  level_id uuid null references game_levels(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz null,
  status varchar(24) not null default 'IN_PROGRESS', -- COMPLETED, ABORTED
  score int not null default 0,
  accuracy numeric(5,2) not null default 0,
  time_spent_ms int not null default 0,
  difficulty_served varchar(16) null,
  result_payload jsonb not null default '{}'::jsonb
);
create index if not exists idx_game_sessions_user_started on game_sessions(user_id, started_at desc);

create table if not exists skill_metrics (
  id uuid primary key,
  tenant_id bigint not null,
  user_id bigint not null,
  skill_key varchar(80) not null,
  mastery numeric(5,4) not null default 0,
  confidence numeric(5,4) not null default 0,
  velocity numeric(8,4) not null default 0,
  last_signal_at timestamptz null,
  updated_at timestamptz not null default now(),
  unique(user_id, skill_key)
);

create table if not exists cognitive_signals (
  id uuid primary key,
  session_id uuid not null references game_sessions(id) on delete cascade,
  user_id bigint not null,
  signal_type varchar(64) not null, -- FOCUS_DROP, FAST_GUESS, PERSISTENCE, etc.
  value numeric(10,4) not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_cognitive_signals_user_created on cognitive_signals(user_id, created_at desc);
```

## 5) Exemplo JSON (template + variação)

```json
{
  "template": {
    "engineKey": "QUIZ",
    "subject": "Matemática",
    "ageGroup": "9-12",
    "title": "Mercadinho da Soma",
    "content": {
      "narrative": "Ajude o Axion a fechar o caixa do mercado.",
      "skills": ["addition", "mental_math"],
      "baseConfig": {
        "questionsPerRound": 8,
        "lives": 3,
        "showHintAfterMs": 10000
      }
    },
    "flags": {
      "aiPersonalizationReady": true,
      "allowDynamicVariants": true
    }
  },
  "variation": {
    "variationKey": "market-sum-v2-hard",
    "difficulty": "HARD",
    "config": {
      "numberRange": [20, 120],
      "operationMix": {"+": 0.7, "-": 0.3},
      "timerSec": 45,
      "distractors": "nearby_numbers"
    }
  }
}
```

## 6) Lista de 50 jogos (mapa engine -> domínio)

### Matemática
1. Corrida da Soma (QUIZ)
2. Mercado do Troco (SIMULATION)
3. Torre da Multiplicação (PUZZLE)
4. Sequência Relâmpago (TIMED_CHALLENGE)
5. Fração Pizza (DRAG_DROP)
6. Missão Divisão (QUIZ)
7. Álgebra em Blocos (GRID)
8. Geometria Viva (CREATION)

### Educação Financeira
9. Orçamento da Semana (SIMULATION)
10. Cofrinho Inteligente (STRATEGY)
11. Priorize Gastos (DRAG_DROP)
12. Cartões e Limites (STORY)
13. Investidor Iniciante (SIMULATION)
14. Juros sem Mistério (QUIZ)
15. Meta de Compra (PUZZLE)

### Português
16. Caça ao Verbo (QUIZ)
17. Monta Frase (DRAG_DROP)
18. Pontuação Ninja (TIMED_CHALLENGE)
19. Ordem do Texto (PUZZLE)
20. Crônica Interativa (STORY)
21. Sinônimo Sprint (MEMORY)
22. Interpretação Flash (QUIZ)
23. Reescrita Criativa (CREATION)

### Lógica
24. Ponte Binária (GRID)
25. Caminho do Robô (STRATEGY)
26. Sudoku Kids (PUZZLE)
27. Padrões Secretos (MEMORY)
28. Labirinto Algorítmico (GRID)
29. Verdadeiro ou Falso Lógico (QUIZ)
30. Fluxo de Decisão (SIMULATION)

### Geografia
31. Mapa em Camadas (DRAG_DROP)
32. Capitais em Tempo (TIMED_CHALLENGE)
33. Climas do Mundo (QUIZ)
34. Biomas em Equilíbrio (SIMULATION)
35. Rota do Explorador (STRATEGY)
36. Globo Puzzle (PUZZLE)
37. Bandeiras Match (MEMORY)

### Ciências
38. Laboratório Seguro (SIMULATION)
39. Ciclo da Água (STORY)
40. Corpo Humano 3D (GRID)
41. Ecossistema em Jogo (STRATEGY)
42. Química no Dia a Dia (QUIZ)
43. Cadeia Alimentar (DRAG_DROP)
44. Experimento Relâmpago (TIMED_CHALLENGE)

### Soft Skills
45. Escolhas com Empatia (STORY)
46. Resolução de Conflitos (SIMULATION)
47. Foco 2 minutos (TIMED_CHALLENGE)
48. Planejamento da Rotina (STRATEGY)
49. Missão Colaborativa (GRID)
50. Comunicação Clara (CREATION)

## 7) Axion + IA plugável (futuro)

- Entrada: `game_sessions + skill_metrics + cognitive_signals`
- Motor determinístico decide:
  - dificuldade alvo
  - tipo de engine recomendado
  - recompensa e pacing
- Camada LLM opcional:
  - reescrita de feedback
  - explicação de erro
  - geração de variantes (com validação forte)
- Saída: decisão auditável + personalização sem acoplar UI.


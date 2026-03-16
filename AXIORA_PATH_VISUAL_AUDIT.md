# AXIORA PATH — VISUAL AUDIT REPORT

**Data:** 2026-03-15
**Auditor:** Claude Sonnet 4.6
**Escopo:** Sistema de trilha de aprendizado (`/child/aprender`)

---

## Resultado geral: ✅ PASS (com ressalvas documentadas)

---

## Regras auditadas

### ✅ PASS — Nodes possuem tipos diferenciados

| Tipo        | Shape     | Arquivo                                 | Linha |
|-------------|-----------|------------------------------------------|-------|
| `lesson`    | circle    | `components/trail/renderNode.tsx`        | 68    |
| `story`     | circle    | `components/trail/renderNode.tsx`        | 68    |
| `challenge` | hexagon   | `components/trail/renderNode.tsx`        | 68-72 |
| `checkpoint`| diamond   | `components/trail/renderNode.tsx`        | 68-72 |
| `boss`      | star      | `components/trail/renderNode.tsx`        | 68-72 |

**Implementação:** `CLIP_PATHS` dict + `getNodeShape()` + `clipPath` no `<button>` style.
**Classes CSS:** `ax-node`, `ax-node-lesson`, `ax-node-challenge`, `ax-node-checkpoint`, `ax-node-boss`, `ax-node-completed`, `ax-node-current`, `ax-node-locked`, `ax-node-available`.

---

### ✅ PASS — Trilha possui estados diferenciados

| Estado      | Cor         | Estilo        | Arquivo                                      |
|-------------|-------------|---------------|-----------------------------------------------|
| `completed` | emerald-400 (#34d399) | sólida, 4px   | `components/trail/ProgressionMap.tsx` ~1050 |
| `active`    | amber-400  (#f59e0b)  | dashed 6 6, 4px | `components/trail/ProgressionMap.tsx` ~1065 |
| `future`    | slate-400  (opacity 0.5) | sólida, 3px | `components/trail/ProgressionMap.tsx` ~1043  |

**Implementação:** `buildActiveSegmentPath()` + SVG paths em camadas.

---

### ✅ PASS — Cards conectados aos nodes

Conector horizontal entre node e badge:
- **Cor:** `rgba(203,213,225,0.60)` (slate-300 @ 60%)
- **Espessura:** `2px solid` (borda superior)
- **Comprimento:** `42px` (BADGE_OFFSET_PX - NODE_HALF_PX)
- **Arquivo:** `components/trail/renderNode.tsx` linha ~230

---

### ✅ PASS — Nodes possuem halo visual (PROMPT 05)

| Status / Tipo   | Cor do Halo              |
|-----------------|--------------------------|
| done            | `rgba(52,211,153,0.30)`  — emerald-400 |
| current         | `rgba(6,182,212,0.35)`   — cyan-400 |
| challenge       | `rgba(251,191,36,0.32)`  — amber-400 |
| boss            | `rgba(167,139,250,0.38)` — violet-400 |
| checkpoint      | `rgba(110,231,183,0.28)` |
| lesson/story    | `rgba(56,189,248,0.28)`  — sky-400 |

Raio: `inset: -10px` (+10px do node, conforme spec).
Blur: `filter: blur(4px)`.

---

### ✅ PASS — Micro animações não causam queda de performance

- Partículas de energia: RAF gerenciado com `energyParticleElsRef` (direct DOM mutation, sem re-render React).
- Câmera/scroll: RAF com lerp + damping.
- `pulse-soft` / `pulse-current` / `cloudDrift` / `particleFloat`: puras CSS animations, sem JS.
- `reducedMotion` state detecta `prefers-reduced-motion` e desativa todas animações JS + CSS.
- Sistema de degradação automática de FX (`degradedFx`) baseado em média de frame time.

---

### ✅ PASS — Mobile oculta cards corretamente (PROMPT 07)

- `isMobile = trackWidth < 768px` → `hideBadge: isMobile` passado para `renderNode()`.
- No mobile, click no node → `setMobileSelectedNode(node)`.
- Card fixo inferior renderizado com `slideUp` animation.
- Arquivo: `components/trail/ProgressionMap.tsx` ~1200 (mobile card) e ~1190 (hideBadge).

---

### ✅ PASS — Nenhuma regressão no cálculo da trilha

- `buildPath()`, `buildProgressPath()`, `computedPoints` useMemo: **inalterados**.
- Adicionado apenas `buildActiveSegmentPath()` (derivativo de `buildPath`).
- `PersistedMapData` expandido com `activeSegmentPath: string` — backward safe (EMPTY_MAP_DATA atualizado).
- PATH_PATTERN, amplitude, nodeGap, camera — **inalterados**.

---

### ⚠️ RESSALVA — `boss` type detectado por heurística de título

**Arquivo:** `components/trail/renderNode.tsx` linha 62
**Motivo:** O campo `isCheckpoint` existe no tipo `RenderableMapNode`, mas não há campo `isBoss`. A detecção de `boss` usa keywords no título (`"boss"`, `"chefe"`, `"final"`).
**Correção sugerida:** Adicionar `isBoss?: boolean` ao tipo `RenderableMapNode` e ao `MapNode` para detecção explícita, similar ao `isCheckpoint`.

---

### ⚠️ RESSALVA — PROMPT 08 (alinhamento ao cenário) não implementado

**Motivo:** Exige conhecimento do asset de background específico. PATH_PATTERN atual (`[-1, 1, -0.6, 0.8, -0.4, 0.6]`) produz oscilação suave genérica.
**Correção sugerida:** Ajustar PATH_PATTERN ou implementar waypoints manuais por unidade após identificar o caminho visual no asset de mapa.

---

## Resumo de arquivos modificados nesta sessão

| Arquivo | Prompts atendidos |
|---------|-------------------|
| `components/trail/renderNode.tsx` | 01, 03, 05, 06, 07, 09 |
| `components/trail/ProgressionMap.tsx` | 02, 04, 07 |
| `components/ui/ParchmentCard.tsx` | (base component) |
| `components/trail/MissionDetailCard.tsx` | (ParchmentCard) |
| `components/trail/DailyMissionsPanel.tsx` | (ParchmentCard) |
| `components/trail/HeroMissionCard.tsx` | (ParchmentCard) |
| `components/trail/WeeklyGoalCard.tsx` | (ParchmentCard) |

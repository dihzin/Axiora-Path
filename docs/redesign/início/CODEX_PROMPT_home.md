# 🤖 Codex Prompt — Menu Início (Home) Redesign
## Sistema de design: Duolingo-style (consistente com menu Aprender)

Cole este prompt no Codex junto com os 6 arquivos `.tsx` anexados.

---

## Contexto

Tenho um app Next.js 15 + TypeScript + Tailwind CSS + shadcn/ui.
O menu **Aprender** já segue o sistema de design Duolingo (nós 3D, trilha SVG, bottom nav ilustrado).
Agora preciso aplicar o **mesmo sistema de design** ao menu **Início** (Home).

Os 6 novos componentes estão anexados. Integre-os exatamente como descrito abaixo.

---

## Sistema de design — regras globais (manter consistência com /aprender)

| Token | Valor |
|---|---|
| Verde principal | `#58CC02` |
| Verde escuro (pedestal) | `#3A9A00` |
| Teal | `#4DD9AC` |
| Azul | `#1CB0F6` |
| Laranja | `#FF9600` |
| Fundo | `#F7F7F7` |
| Cards | `bg-white rounded-2xl shadow-sm border border-gray-100` |
| Botão 3D | face + pedestal `translateY(3-5px)` + `active:translate-y-[Xpx]` |
| Fonte peso | `font-extrabold` para títulos, `font-bold` para labels |

---

## Arquivo map — onde colocar cada arquivo

| Arquivo | Destino |
|---|---|
| `MissaoCard.tsx`   | `apps/web/components/home/MissaoCard.tsx`   |
| `AxionCard.tsx`    | `apps/web/components/home/AxionCard.tsx`    |
| `HumorRapido.tsx`  | `apps/web/components/home/HumorRapido.tsx`  |
| `ProgressoCard.tsx`| `apps/web/components/home/ProgressoCard.tsx`|
| `ListaTarefas.tsx` | `apps/web/components/home/ListaTarefas.tsx` |
| `HomeScreen.tsx`   | `apps/web/components/home/HomeScreen.tsx`   |

---

## Integração na page

Em `apps/web/app/page.tsx` (ou `app/(main)/page.tsx`), substitua o conteúdo por:

```tsx
import { HomeScreen } from '@/components/home/HomeScreen'
export default function HomePage() {
  return <HomeScreen />
}
```

---

## O que cada componente faz

### MissaoCard
- Card de missão diária com header em gradiente laranja
- Dois reward pills (XP e moedas)
- Botão "Completar missão" com efeito 3D (pedestal verde)
- Badge de dificuldade (NORMAL / DIFÍCIL / FÁCIL)

### AxionCard
- Card do mascote Axion como protagonista
- Header com gradiente suave verde/azul
- Avatar circular com sombra e anel de humor colorido
- Pills de estágio + humor com cores dinâmicas
- Bubble de mensagem do Axion

### HumorRapido
- 5 botões de humor com emoji + label
- Estado selecionado com cor e escala
- Contador de sequência (streak) em pill laranja
- Interação: `active:scale-95`, selecionado: `scale-105`

### ProgressoCard
- Dois cards lado a lado: Avatar e Pote SAVE
- Barra de XP com gradiente teal→azul + shine interno
- Barra de desafio semanal com gradiente roxo
- Ambas as barras têm mínimo de 4% de largura para sempre aparecer

### ListaTarefas
- Barra colorida lateral por dificuldade (verde/laranja/vermelho/roxo)
- Botão "Marcar" com efeito 3D verde (mesmo padrão do LessonNode)
- Estado concluído: ícone ✓ verde + linha no texto
- Tabs "Lista" / "Jornada" com tab ativa em verde 3D

### HomeScreen
- Container principal `max-w-lg` (levemente maior que a trilha que é `max-w-sm`)
- Reutiliza `TopStatsBar` e `BottomNav` do menu Aprender
- Espaçamento `space-y-4` entre cards
- `pb-32` para não sobrepor o BottomNav

---

## Mudanças visuais vs tela atual

| Antes | Depois |
|---|---|
| Sidebar esquerda com links de texto | BottomNav ilustrado (já existente) |
| Cards planos sem personalidade | Cards com gradientes, sombras e profundidade |
| Botão laranja flat | Botão 3D com pedestal e active state |
| Lista de tarefas sem hierarquia | Barra lateral colorida por dificuldade |
| Axion como imagem pequena | Axion como card protagonista com mood ring |
| Barras de XP finas e cinzas | Barras com gradiente, shine e altura legível |
| Humor como grid de avatares idênticos | Emojis expressivos com estado selecionado |

---

## Após aplicar

```bash
rm -rf apps/web/.next && npm run dev --workspace=apps/web
```

Acesse `http://localhost:3000` para ver o resultado.

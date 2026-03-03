// components/home/HomeScreen.tsx
'use client'

import { TopStatsBar }  from '@/components/trail/TopStatsBar'
import { BottomNav }    from '@/components/trail/BottomNav'
import { MissaoCard }   from './MissaoCard'
import { AxionCard }    from './AxionCard'
import { HumorRapido }  from './HumorRapido'
import { ProgressoCard } from './ProgressoCard'
import { ListaTarefas } from './ListaTarefas'

// ── Mock data — replace with API fetch from FastAPI ───────────────────────────
const mockTarefas = [
  { id: 't1', titulo: 'Arrumar a cama',          dificuldade: 'Fácil'   as const, peso: 5  },
  { id: 't2', titulo: 'Escovar os dentes',        dificuldade: 'Fácil'   as const, peso: 5  },
  { id: 't3', titulo: 'Organizar os brinquedos',  dificuldade: 'Fácil'   as const, peso: 10 },
  { id: 't4', titulo: 'Fazer a lição de casa',    dificuldade: 'Média'   as const, peso: 15 },
  { id: 't5', titulo: 'Ajudar na cozinha',        dificuldade: 'Média'   as const, peso: 20 },
  { id: 't6', titulo: 'Ler por 30 minutos',       dificuldade: 'Difícil' as const, peso: 30 },
  { id: 't7', titulo: 'Projeto especial da semana',dificuldade: 'Lendária'as const, peso: 50 },
]
// ─────────────────────────────────────────────────────────────────────────────

export function HomeScreen() {
  return (
    <div className="min-h-screen bg-[#F7F7F7]">

      {/* Sticky stats bar — shared with /aprender */}
      <TopStatsBar streak={1} gems={277} xp={34} />

      {/* Scrollable content */}
      <main className="max-w-lg mx-auto px-4 pt-4 pb-32 space-y-4">

        {/* 1 — Daily mission */}
        <MissaoCard
          title="Registrar humor do dia"
          description="Conte como está se sentindo para ajudar o Axion a ajustar seu plano."
          xp={17}
          moedas={6}
          dificuldade="NORMAL"
          onCompletar={() => console.log('missão completa')}
        />

        {/* 2 — Axion mascot */}
        <AxionCard
          estagio={1}
          humor="Atento"
          mensagem="Olá! Estou aqui para te ajudar hoje. Que tal completar sua missão?"
          avatarSrc="/axion-avatar.png"   // substitua pelo caminho real
        />

        {/* 3 — Quick mood + streak */}
        <HumorRapido
          sequencia={0}
          onSelect={(mood) => console.log('Humor:', mood)}
        />

        {/* 4 — XP / progress / pote SAVE */}
        <ProgressoCard
          xpAtual={0}
          xpNivel={100}
          nivel={1}
          desafioSemanal={0}
          poteSave={0}
          avatarSrc="/avatar-1.png"       // substitua pelo caminho real
          estagioAvatar={1}
          proximaMeta={undefined}
        />

        {/* 5 — Task list */}
        <ListaTarefas
          tarefas={mockTarefas}
          sequencia={0}
          onMarcar={(id) => console.log('Marcou:', id)}
        />

      </main>

      <BottomNav />
    </div>
  )
}

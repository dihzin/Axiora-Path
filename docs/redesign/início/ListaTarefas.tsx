// components/home/ListaTarefas.tsx
'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'

type Dificuldade = 'Fácil' | 'Média' | 'Difícil' | 'Lendária'

interface Tarefa {
  id: string
  titulo: string
  dificuldade: Dificuldade
  peso: number
  concluida?: boolean
}

interface ListaTarefasProps {
  tarefas: Tarefa[]
  sequencia: number
  onMarcar?: (id: string) => void
}

const difConfig: Record<Dificuldade, { bar: string; text: string; bg: string }> = {
  Fácil:    { bar: 'bg-[#58CC02]', text: 'text-green-600',  bg: 'bg-green-50'  },
  Média:    { bar: 'bg-[#FF9600]', text: 'text-orange-500', bg: 'bg-orange-50' },
  Difícil:  { bar: 'bg-[#FF4B4B]', text: 'text-red-500',    bg: 'bg-red-50'    },
  Lendária: { bar: 'bg-[#CE82FF]', text: 'text-purple-600', bg: 'bg-purple-50' },
}

type Tab = 'Lista' | 'Jornada'

export function ListaTarefas({ tarefas, sequencia, onMarcar }: ListaTarefasProps) {
  const [tab, setTab]           = useState<Tab>('Lista')
  const [concluidas, setConcluidas] = useState<Set<string>>(new Set())

  const handleMarcar = (id: string) => {
    setConcluidas(prev => new Set([...prev, id]))
    onMarcar?.(id)
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-center justify-between">
        <h3 className="font-extrabold text-gray-800 text-base">Lista de tarefas</h3>
        <div className="flex items-center gap-1 bg-orange-50 px-2.5 py-1 rounded-full">
          <span>🔥</span>
          <span className="text-orange-500 font-extrabold text-xs">{sequencia} dias</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4 mb-3 flex gap-2">
        {(['Lista', 'Jornada'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={cn(
              'px-4 py-1.5 rounded-xl text-xs font-extrabold transition-all duration-150',
              tab === t
                ? 'bg-[#58CC02] text-white shadow-md border-b-2 border-[#3A9A00]'
                : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Task rows */}
      <div className="divide-y divide-gray-50">
        {tarefas.map((tarefa, i) => {
          const done = concluidas.has(tarefa.id)
          const cfg  = difConfig[tarefa.dificuldade]

          return (
            <div
              key={tarefa.id}
              style={{ animationDelay: `${i * 50}ms` }}
              className={cn(
                'flex items-center gap-3 px-4 py-3 transition-all duration-200',
                done ? 'opacity-50' : 'opacity-100'
              )}
            >
              {/* Difficulty color bar */}
              <span className={cn('w-1 h-10 rounded-full shrink-0', cfg.bar)} />

              {/* Task info */}
              <div className="flex-1 min-w-0">
                <p className={cn(
                  'font-bold text-sm text-gray-800 truncate',
                  done && 'line-through text-gray-400'
                )}>
                  {tarefa.titulo}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={cn('text-[10px] font-bold', cfg.text)}>
                    {tarefa.dificuldade}
                  </span>
                  <span className="text-gray-300 text-[10px]">•</span>
                  <span className="text-[10px] text-gray-400 font-bold">
                    +{tarefa.peso} XP
                  </span>
                </div>
              </div>

              {/* 3D Marcar button */}
              {done ? (
                <div className="w-16 h-8 rounded-xl bg-green-100 flex items-center justify-center">
                  <Check className="w-4 h-4 text-green-500 stroke-[3]" />
                </div>
              ) : (
                <button
                  onClick={() => handleMarcar(tarefa.id)}
                  className="relative w-16 h-8 rounded-xl select-none
                    transition-transform duration-100 active:translate-y-[2px]"
                >
                  <span className="absolute inset-0 rounded-xl bg-[#3A9A00]"
                    style={{ transform: 'translateY(2px)' }} />
                  <span className="absolute inset-0 rounded-xl bg-[#58CC02]
                    flex items-center justify-center">
                    <span className="text-white text-[11px] font-extrabold relative z-10">
                      Marcar
                    </span>
                  </span>
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

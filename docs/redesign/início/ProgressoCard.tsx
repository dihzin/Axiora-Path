// components/home/ProgressoCard.tsx
'use client'

import Image from 'next/image'
import { cn } from '@/lib/utils'

interface ProgressoCardProps {
  xpAtual: number
  xpNivel: number
  nivel: number
  desafioSemanal: number   // 0–100
  poteSave: number         // R$
  avatarSrc: string
  estagioAvatar: number
  proximaMeta?: string
}

export function ProgressoCard({
  xpAtual, xpNivel, nivel, desafioSemanal,
  poteSave, avatarSrc, estagioAvatar, proximaMeta,
}: ProgressoCardProps) {
  const xpPct = Math.min(100, Math.round((xpAtual / xpNivel) * 100))

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Section label */}
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <h3 className="font-extrabold text-gray-800 text-base">Progresso</h3>
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
          Nível {nivel}
        </span>
      </div>

      {/* Avatar + Pote row */}
      <div className="px-4 pb-4 flex gap-3">
        {/* Avatar card */}
        <div className="flex-1 bg-gradient-to-br from-[#E8FBF4] to-[#EAF7FF]
          rounded-xl p-3 flex flex-col items-center gap-2 border border-green-100">
          <div className="w-14 h-14 rounded-full bg-white shadow-md flex items-center justify-center">
            <Image src={avatarSrc} alt="Avatar" width={48} height={48} className="rounded-full" />
          </div>
          <span className="text-[10px] font-bold text-gray-500">
            Estágio do avatar {estagioAvatar}
          </span>
        </div>

        {/* Pote SAVE card */}
        <div className="flex-1 bg-gradient-to-br from-yellow-50 to-orange-50
          rounded-xl p-3 flex flex-col justify-between border border-yellow-100">
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              Pote SAVE
            </p>
            <p className="text-xl font-extrabold text-gray-800 mt-0.5">
              R$ {poteSave.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-gray-400 font-bold">Próxima meta</p>
            <p className="text-xs font-bold text-orange-500">
              {proximaMeta ?? 'Sem meta'}
            </p>
          </div>
        </div>
      </div>

      {/* XP bar */}
      <div className="px-4 pb-3">
        <XpBar label="XP" pct={xpPct} sublabel={`${xpAtual} / ${xpNivel} XP`}
          color="from-[#4DD9AC] to-[#1CB0F6]" />
      </div>

      {/* Weekly challenge bar */}
      <div className="px-4 pb-4">
        <XpBar label="Desafio semanal" pct={desafioSemanal}
          sublabel={`${desafioSemanal}%`}
          color="from-[#CE82FF] to-[#A855F7]" />
      </div>
    </div>
  )
}

function XpBar({
  label, pct, sublabel, color,
}: { label: string; pct: number; sublabel: string; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-bold text-gray-600">{label}</span>
        <span className="text-xs font-bold text-gray-400">{sublabel}</span>
      </div>
      <div className="w-full h-4 bg-gray-100 rounded-full overflow-hidden shadow-inner">
        <div
          className={cn('h-full rounded-full bg-gradient-to-r transition-all duration-700', color)}
          style={{ width: `${Math.max(pct, 4)}%` }}
        >
          {/* Shine */}
          <div className="h-1/2 rounded-full bg-white opacity-25" />
        </div>
      </div>
    </div>
  )
}

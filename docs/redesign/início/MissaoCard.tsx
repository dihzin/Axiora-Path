// components/home/MissaoCard.tsx
'use client'

import { cn } from '@/lib/utils'
import { Zap } from 'lucide-react'

interface MissaoCardProps {
  title: string
  description: string
  xp: number
  moedas: number
  onCompletar: () => void
  dificuldade?: 'NORMAL' | 'DIFÍCIL' | 'FÁCIL'
}

const dificuldadeColor: Record<string, string> = {
  NORMAL:  'bg-sky-100 text-sky-600',
  DIFÍCIL: 'bg-red-100 text-red-500',
  FÁCIL:   'bg-green-100 text-green-600',
}

export function MissaoCard({
  title, description, xp, moedas, onCompletar, dificuldade = 'NORMAL'
}: MissaoCardProps) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header strip */}
      <div className="bg-gradient-to-r from-[#FF9600] to-[#FFB732] px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-white fill-white" />
          <span className="text-white font-extrabold text-sm tracking-wide">
            Missão do Dia
          </span>
        </div>
        <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', dificuldadeColor[dificuldade])}>
          {dificuldade}
        </span>
      </div>

      {/* Body */}
      <div className="p-4">
        <p className="font-extrabold text-gray-800 text-base mb-1">{title}</p>
        <p className="text-gray-500 text-sm mb-4">{description}</p>

        {/* Rewards row */}
        <div className="flex gap-3 mb-4">
          <RewardPill icon="⚡" label={`+${xp} XP`}  color="bg-sky-50 text-sky-600" />
          <RewardPill icon="💎" label={`+${moedas} moedas`} color="bg-purple-50 text-purple-600" />
        </div>

        {/* 3D CTA button — same pattern as LessonNode */}
        <button
          onClick={onCompletar}
          className="relative w-full flex items-center justify-center rounded-xl
            font-extrabold text-white text-sm tracking-wide select-none
            transition-transform duration-100 active:translate-y-[3px]"
          style={{ padding: '12px 0' }}
        >
          {/* Base / pedestal */}
          <span className="absolute inset-0 rounded-xl bg-[#D94F00]"
            style={{ transform: 'translateY(3px)' }} />
          {/* Face */}
          <span className="absolute inset-0 rounded-xl bg-[#FF6B00] flex items-center justify-center">
            <span className="absolute inset-0 rounded-xl"
              style={{ background: 'linear-gradient(170deg, rgba(255,255,255,0.18) 0%, transparent 55%)' }} />
          </span>
          <span className="relative z-10">Completar missão</span>
        </button>
      </div>
    </div>
  )
}

function RewardPill({ icon, label, color }: { icon: string; label: string; color: string }) {
  return (
    <div className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold', color)}>
      <span>{icon}</span>
      <span>{label}</span>
    </div>
  )
}

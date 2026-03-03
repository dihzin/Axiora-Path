// components/home/AxionCard.tsx
'use client'

import Image from 'next/image'

interface AxionCardProps {
  estagio: number
  humor: string
  mensagem: string
  avatarSrc: string
}

const humorColor: Record<string, { bg: string; text: string; dot: string }> = {
  Atento:   { bg: 'bg-sky-50',    text: 'text-sky-600',    dot: 'bg-sky-400'    },
  Feliz:    { bg: 'bg-green-50',  text: 'text-green-600',  dot: 'bg-green-400'  },
  Animado:  { bg: 'bg-yellow-50', text: 'text-yellow-600', dot: 'bg-yellow-400' },
  Triste:   { bg: 'bg-blue-50',   text: 'text-blue-500',   dot: 'bg-blue-400'   },
  Cansado:  { bg: 'bg-gray-50',   text: 'text-gray-500',   dot: 'bg-gray-400'   },
}

export function AxionCard({ estagio, humor, mensagem, avatarSrc }: AxionCardProps) {
  const h = humorColor[humor] ?? humorColor['Atento']

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Teal gradient header */}
      <div
        className="px-4 pt-5 pb-16 flex flex-col items-center text-center"
        style={{ background: 'linear-gradient(160deg, #E8FBF4 0%, #EAF7FF 100%)' }}
      >
        <p className="text-gray-400 text-[11px] font-bold uppercase tracking-widest mb-0.5">
          Seu parceiro de missão
        </p>
        <h3 className="text-gray-800 font-extrabold text-lg">Axion</h3>

        {/* Mascot avatar — elevated with shadow */}
        <div className="relative mt-3 mb-1">
          <div className="w-24 h-24 rounded-full bg-white shadow-xl flex items-center justify-center border-4 border-white">
            <Image src={avatarSrc} alt="Axion" width={80} height={80} className="rounded-full" />
          </div>
          {/* Mood glow ring */}
          <span className={`absolute inset-0 rounded-full ${h.bg} opacity-60 blur-md -z-10`} />
        </div>
      </div>

      {/* Pills row — overlaps the gradient */}
      <div className="-mt-5 flex justify-center gap-2 px-4 pb-4">
        <StagePill label={`Estágio ${estagio}`} />
        <HumorPill humor={humor} colors={h} />
      </div>

      {/* Message bubble */}
      <div className="mx-4 mb-4 bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
        <p className="text-gray-600 text-sm text-center leading-relaxed">
          💬 {mensagem}
        </p>
      </div>
    </div>
  )
}

function StagePill({ label }: { label: string }) {
  return (
    <span className="bg-white border border-gray-200 text-gray-600 text-xs font-bold
      px-3 py-1 rounded-full shadow-sm">
      {label}
    </span>
  )
}

function HumorPill({ humor, colors }: { humor: string; colors: { bg: string; text: string; dot: string } }) {
  return (
    <span className={`${colors.bg} ${colors.text} text-xs font-bold
      px-3 py-1 rounded-full flex items-center gap-1.5 shadow-sm`}>
      <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
      {humor}
    </span>
  )
}

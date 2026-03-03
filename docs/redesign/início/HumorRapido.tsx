// components/home/HumorRapido.tsx
'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

const moods = [
  { label: 'Feliz',   emoji: '😄', color: 'bg-yellow-100 border-yellow-300 text-yellow-700' },
  { label: 'Neutro',  emoji: '😐', color: 'bg-gray-100   border-gray-300   text-gray-600'   },
  { label: 'Triste',  emoji: '😢', color: 'bg-blue-100   border-blue-300   text-blue-600'   },
  { label: 'Bravo',   emoji: '😠', color: 'bg-red-100    border-red-300    text-red-600'     },
  { label: 'Cansado', emoji: '😴', color: 'bg-purple-100 border-purple-300 text-purple-600'  },
]

interface HumorRapidoProps {
  onSelect?: (mood: string) => void
  sequencia: number
}

export function HumorRapido({ onSelect, sequencia }: HumorRapidoProps) {
  const [selected, setSelected] = useState<string | null>(null)

  const handleSelect = (label: string) => {
    setSelected(label)
    onSelect?.(label)
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-extrabold text-gray-800 text-base">
          Pronto para hoje?
        </h3>
        <div className="flex items-center gap-1.5 bg-orange-50 px-3 py-1 rounded-full">
          <span className="text-base">🔥</span>
          <span className="text-orange-500 font-extrabold text-xs">
            {sequencia} dias
          </span>
        </div>
      </div>

      <p className="text-gray-400 text-xs mb-4">Como você está se sentindo agora?</p>

      {/* Mood grid */}
      <div className="flex gap-2 justify-between">
        {moods.map((mood, i) => (
          <button
            key={mood.label}
            onClick={() => handleSelect(mood.label)}
            style={{ animationDelay: `${i * 60}ms` }}
            className={cn(
              'flex flex-col items-center gap-1.5 flex-1 py-3 rounded-xl border-2',
              'transition-all duration-150 select-none',
              'active:scale-95',
              selected === mood.label
                ? `${mood.color} scale-105 shadow-md`
                : 'bg-gray-50 border-gray-100 text-gray-400 hover:bg-gray-100'
            )}
          >
            <span className="text-2xl">{mood.emoji}</span>
            <span className="text-[10px] font-bold">{mood.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// components/trail/UnitBanner.tsx
'use client'

import { BookOpen, List } from 'lucide-react'
import { Unit } from '@packages/shared/types/trail'

interface UnitBannerProps {
  unit: Unit
}

export function UnitBanner({ unit }: UnitBannerProps) {
  return (
    <div className="w-full rounded-2xl overflow-hidden shadow-lg mb-6"
      style={{ background: unit.color ?? 'linear-gradient(135deg, #4DD9AC 0%, #1CB0F6 100%)' }}
    >
      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-white/80 text-xs font-semibold uppercase tracking-widest mb-1">
              {unit.section}
            </p>
            <h2 className="text-white text-base font-extrabold leading-tight">
              {unit.title}
            </h2>
          </div>

          <button className="bg-white/20 hover:bg-white/30 transition rounded-xl p-2 ml-3 mt-0.5">
            <List className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="mt-3 flex items-center gap-2">
          <div className="flex-1 h-2.5 bg-white/30 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full transition-all duration-700"
              style={{ width: `${unit.progress}%` }}
            />
          </div>
          <BookOpen className="w-4 h-4 text-white/80 shrink-0" />
        </div>
      </div>
    </div>
  )
}

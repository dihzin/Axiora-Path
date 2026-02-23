// components/trail/UnitBanner.tsx
'use client'

import { BookOpen, List } from 'lucide-react'

interface UnitBannerProps {
  section: string
  title: string
  progress: number   // 0–100
  color?: string
}

export function UnitBanner({ section, title, progress, color }: UnitBannerProps) {
  const bg = color ?? 'linear-gradient(135deg, #4DD9AC 0%, #1CB0F6 100%)'

  return (
    <div
      className="w-full rounded-2xl overflow-hidden shadow-lg mb-4"
      style={{
        background: bg,
        position: 'relative',
        zIndex: 10,          // lower than nodes so trail is never covered
      }}
    >
      <div className="p-4">
        {/* Top row */}
        <div className="flex items-start justify-between">
          <div className="flex-1 pr-2">
            <p className="text-white/75 text-[10px] font-bold uppercase tracking-widest mb-1">
              {section}
            </p>
            <h2 className="text-white text-[15px] font-extrabold leading-snug">
              {title}
            </h2>
          </div>
          <button className="bg-white/20 hover:bg-white/30 transition rounded-xl p-2 shrink-0">
            <List className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Progress row */}
        <div className="mt-3 flex items-center gap-2">
          <div className="flex-1 h-2.5 bg-white/30 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full transition-all duration-700"
              style={{ width: `${progress}%` }}
            />
          </div>
          <BookOpen className="w-4 h-4 text-white/70 shrink-0" />
        </div>
      </div>
    </div>
  )
}

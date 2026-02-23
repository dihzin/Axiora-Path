// components/trail/TopStatsBar.tsx
'use client'

import { cn } from '@/lib/utils'

interface TopStatsBarProps {
  streak: number
  gems: number
  xp: number // percentage 0-100
  className?: string
}

export function TopStatsBar({ streak, gems, xp, className }: TopStatsBarProps) {
  return (
    <div
      className={cn(
        'max-w-sm mx-auto flex items-center justify-between px-4 py-3',
        'bg-white border-b border-gray-100 sticky top-0 z-40',
        className
      )}
    >
      {/* Streak */}
      <StatPill color="text-orange-500">
        <FlameIcon />
        <span>{streak}</span>
      </StatPill>

      {/* Gems */}
      <StatPill color="text-sky-400">
        <DiamondIcon />
        <span>{gems}</span>
      </StatPill>

      {/* XP with mini progress bar */}
      <div className="flex flex-col items-center gap-0.5">
        <StatPill color="text-yellow-500">
          <StarIcon />
          <span>{xp}%</span>
        </StatPill>
        <div className="w-14 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-yellow-400 rounded-full transition-all duration-700"
            style={{ width: `${xp}%` }}
          />
        </div>
      </div>

      {/* Book / league */}
      <button className="flex items-center justify-center w-9 h-9 rounded-xl hover:bg-gray-50 transition">
        <BookIcon />
      </button>
    </div>
  )
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function StatPill({
  color,
  children,
}: {
  color: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('flex items-center gap-1 font-extrabold text-sm', color)}>
      {children}
    </div>
  )
}

function FlameIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 2C12 2 7 7.5 7 13a5 5 0 0010 0c0-2.5-1.5-5-5-11z"
        fill="#FF9600"
      />
      <path
        d="M12 8c0 0-2.5 3-2.5 5.5a2.5 2.5 0 005 0C14.5 11 12 8 12 8z"
        fill="#FF6B00"
      />
      <ellipse cx="12" cy="19" rx="3" ry="1.2" fill="#FF6B00" opacity="0.3" />
    </svg>
  )
}

function DiamondIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M12 3L4 9l8 12 8-12-8-6z" fill="#4DD9F5" />
      <path d="M12 3L4 9h16L12 3z" fill="#83EEFF" />
      <path d="M4 9l8 12V9H4z" fill="#29C4E8" />
    </svg>
  )
}

function StarIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 2l2.9 6.3 6.6.9-4.8 4.6 1.2 6.5L12 17l-5.9 3.3 1.2-6.5L2.5 9.2l6.6-.9L12 2z"
        fill="#FFD700"
        stroke="#F0B400"
        strokeWidth="0.5"
      />
    </svg>
  )
}

function BookIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 4h7a1 1 0 011 1v14a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1z"
        fill="#AFAFAF"
      />
      <path
        d="M13 4h7a1 1 0 011 1v14a1 1 0 01-1 1h-7a1 1 0 01-1-1V5a1 1 0 011-1z"
        fill="#CBCBCB"
      />
      <path d="M12 4v16" stroke="white" strokeWidth="1.5" />
    </svg>
  )
}

// components/trail/LessonNode.tsx
'use client'

import { cn } from '@/lib/utils'

export type NodeType = 'completed' | 'active' | 'locked' | 'bonus'

interface LessonNodeProps {
  type: NodeType
  title: string
  onClick?: () => void
  index?: number
}

const config: Record<NodeType, {
  top: string
  bottom: string
  ring?: string
  icon: React.ReactNode
}> = {
  completed: {
    top:    'bg-[#58CC02]',
    bottom: 'bg-[#3A9A00]',
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <path d="M6 14l6 6 10-12" stroke="white" strokeWidth="3.5"
          strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  active: {
    top:    'bg-[#58CC02]',
    bottom: 'bg-[#3A9A00]',
    ring:   'ring-4 ring-[#58CC02]/30 ring-offset-2',
    icon: (
      <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
        <path d="M13 3l2.8 6.2 6.5.9-4.7 4.5 1.1 6.4L13 18l-5.7 3 1.1-6.4L3.7 10l6.5-.9L13 3z"
          fill="white" />
      </svg>
    ),
  },
  locked: {
    top:    'bg-[#E5E5E5]',
    bottom: 'bg-[#B0B0B0]',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="5" y="11" width="14" height="10" rx="2" fill="#AFAFAF" />
        <path d="M8 11V8a4 4 0 018 0v3" stroke="#AFAFAF" strokeWidth="2.5"
          strokeLinecap="round" fill="none" />
      </svg>
    ),
  },
  bonus: {
    top:    'bg-[#FFD700]',
    bottom: 'bg-[#C9A800]',
    icon: (
      <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
        <path d="M13 2l3 7h7l-5.5 4 2 7L13 16l-6.5 4 2-7L3 9h7l3-7z"
          fill="white" />
      </svg>
    ),
  },
}

export function LessonNode({ type, onClick, index = 0 }: LessonNodeProps) {
  const c = config[type]
  const isClickable = type !== 'locked'

  return (
    <div
      className="flex flex-col items-center"
      style={{
        animation: `popIn 0.4s cubic-bezier(0.34,1.56,0.64,1) ${index * 90}ms both`,
      }}
    >
      {/* Pulse ring — active only */}
      <div className="relative flex items-center justify-center">
        {type === 'active' && (
          <>
            <span className="absolute w-24 h-24 rounded-full bg-[#58CC02]/20 animate-ping" />
            <span className="absolute w-20 h-20 rounded-full bg-[#58CC02]/20 animate-ping [animation-delay:300ms]" />
          </>
        )}

        {/* ── 3D Button ─────────────────────────────────────── */}
        <button
          onClick={isClickable ? onClick : undefined}
          disabled={!isClickable}
          className={cn(
            'relative flex items-center justify-center rounded-full',
            'w-[72px] h-[72px]',
            'transition-all duration-100',
            isClickable
              ? 'active:translate-y-[4px] active:shadow-none cursor-pointer hover:brightness-105'
              : 'cursor-default',
            type === 'active' && c.ring
          )}
          style={{
            // The "pedestal" 3D effect: top face + thick bottom shadow
            background: 'transparent',
          }}
        >
          {/* Bottom layer — the "pedestal" */}
          <span
            className={cn(
              'absolute inset-0 rounded-full translate-y-[5px]',
              c.bottom
            )}
          />
          {/* Top face */}
          <span
            className={cn(
              'absolute inset-0 rounded-full flex items-center justify-center',
              c.top
            )}
          >
            {c.icon}
          </span>
        </button>
      </div>

      {/* "Começar" label — active only */}
      {type === 'active' && (
        <span
          className="mt-3 bg-[#58CC02] text-white text-xs font-extrabold
            px-4 py-1.5 rounded-xl shadow-md tracking-widest uppercase
            border-b-2 border-[#3A9A00]"
        >
          Começar
        </span>
      )}

      {/* Global keyframe injected once */}
      <style jsx global>{`
        @keyframes popIn {
          0%   { transform: scale(0.4); opacity: 0; }
          70%  { transform: scale(1.15); }
          100% { transform: scale(1);   opacity: 1; }
        }
      `}</style>
    </div>
  )
}

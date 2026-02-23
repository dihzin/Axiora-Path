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
  face: string
  base: string
  icon: React.ReactNode
}> = {
  completed: {
    face: 'bg-[#58CC02]',
    base: 'bg-[#3A9A00]',
    icon: (
      <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
        <path d="M6 15l7 7 11-13" stroke="white" strokeWidth="3.5"
          strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  active: {
    face: 'bg-[#58CC02]',
    base: 'bg-[#3A9A00]',
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <path
          d="M14 3l2.8 6.2 6.5.9-4.7 4.6 1.1 6.4L14 18l-5.7 3 1.1-6.4L4.7 10l6.5-.9L14 3z"
          fill="white"
        />
      </svg>
    ),
  },
  locked: {
    face: 'bg-[#CECECE]',
    base: 'bg-[#A0A0A0]',   // ← pedestal cinza escuro
    icon: (
      <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
        <rect x="5" y="12" width="16" height="11" rx="2.5" fill="#A0A0A0" />
        <path d="M9 12V9a4 4 0 018 0v3"
          stroke="#A0A0A0" strokeWidth="2.8" strokeLinecap="round" fill="none" />
      </svg>
    ),
  },
  bonus: {
    face: 'bg-[#FFD700]',
    base: 'bg-[#C9A800]',
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <path
          d="M14 2l3 7.5h7.5l-6 4.5 2.3 7.5L14 17l-6.8 4.5 2.3-7.5-6-4.5H11L14 2z"
          fill="white"
        />
      </svg>
    ),
  },
}

export function LessonNode({ type, onClick, index = 0 }: LessonNodeProps) {
  const c = config[type]
  const isClickable = type !== 'locked'

  return (
    <>
      {/* Keyframe injected once globally */}
      <style>{`
        @keyframes popIn {
          0%   { transform: scale(0.3); opacity: 0; }
          65%  { transform: scale(1.18); opacity: 1; }
          100% { transform: scale(1); }
        }
        @keyframes pulseRing {
          0%   { transform: scale(1);   opacity: 0.5; }
          100% { transform: scale(1.7); opacity: 0; }
        }
      `}</style>

      <div
        className="flex flex-col items-center"
        style={{
          animation: `popIn 0.42s cubic-bezier(0.34,1.56,0.64,1) ${index * 95}ms both`,
        }}
      >
        <div className="relative flex items-center justify-center">

          {/* Pulse rings — active only (pure CSS, no Tailwind purge issue) */}
          {type === 'active' && (
            <>
              <span
                className="absolute rounded-full bg-[#58CC02]"
                style={{
                  width: 88, height: 88,
                  animation: 'pulseRing 1.4s ease-out infinite',
                  opacity: 0,
                }}
              />
              <span
                className="absolute rounded-full bg-[#58CC02]"
                style={{
                  width: 88, height: 88,
                  animation: 'pulseRing 1.4s ease-out 0.5s infinite',
                  opacity: 0,
                }}
              />
            </>
          )}

          {/* ── 3D button — ALL types get pedestal ── */}
          <button
            onClick={isClickable ? onClick : undefined}
            disabled={!isClickable}
            className={cn(
              'relative flex items-center justify-center rounded-full select-none',
              'w-[72px] h-[72px]',
              'transition-transform duration-100',
              isClickable
                ? 'active:translate-y-[5px] cursor-pointer hover:brightness-105'
                : 'cursor-default'
            )}
          >
            {/* Base / pedestal layer */}
            <span
              className={cn(
                'absolute inset-0 rounded-full',
                c.base
              )}
              style={{ transform: 'translateY(5px)' }}
            />
            {/* Face layer */}
            <span
              className={cn(
                'absolute inset-0 rounded-full flex items-center justify-center',
                c.face
              )}
            >
              {/* Inner shine */}
              <span
                className="absolute inset-0 rounded-full"
                style={{
                  background:
                    'linear-gradient(170deg, rgba(255,255,255,0.22) 0%, transparent 55%)',
                }}
              />
              <span className="relative z-10">{c.icon}</span>
            </span>
          </button>
        </div>

        {/* "Começar" CTA — active only */}
        {type === 'active' && (
          <span
            className="mt-3 bg-[#58CC02] text-white text-[11px] font-extrabold
              px-5 py-1.5 rounded-xl tracking-[0.12em] uppercase shadow-md"
            style={{ borderBottom: '3px solid #3A9A00' }}
          >
            Começar
          </span>
        )}
      </div>
    </>
  )
}

// components/trail/BottomNav.tsx
'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/',           label: 'Início',     Icon: HomeIcon },
  { href: '/aprender',   label: 'Aprender',   Icon: BookIcon },
  { href: '/figurinhas', label: 'Figurinhas', Icon: CardsIcon },
  { href: '/jogos',      label: 'Jogos',      Icon: GameIcon },
  { href: '/loja',       label: 'Loja',       Icon: ShopIcon },
  { href: '/perfil',     label: 'Axion',      Icon: AxionIcon },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t-[3px] border-gray-100 shadow-[0_-2px_12px_rgba(0,0,0,0.06)]">
      <div className="max-w-sm mx-auto flex items-center justify-around px-0 pt-2 pb-3">
        {navItems.map(({ href, label, Icon }) => {
          const active =
            href === '/'
              ? pathname === '/'
              : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center gap-1 flex-1"
            >
              {/* Icon container */}
              <div
                className={cn(
                  'flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-200',
                  active ? 'scale-115' : 'opacity-40 grayscale-[60%]'
                )}
              >
                <Icon active={active} />
              </div>
              {/* Label */}
              <span
                className={cn(
                  'text-[9px] font-extrabold tracking-wider uppercase',
                  active ? 'text-[#1CB0F6]' : 'text-gray-400'
                )}
              >
                {label}
              </span>
              {/* Active dot */}
              {active && (
                <span className="w-1 h-1 rounded-full bg-[#1CB0F6]" />
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Illustrated SVG icons
// ─────────────────────────────────────────────────────────────────────────────

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
      {/* Shadow */}
      <path d="M15 5L2 16h4v10h7v-6h4v6h7V16h4L15 5z"
        fill={active ? '#E02020' : '#999'} transform="translate(0,1.5)" opacity="0.25" />
      {/* Body */}
      <path d="M15 5L2 16h4v10h7v-6h4v6h7V16h4L15 5z"
        fill={active ? '#FF4B4B' : '#C8C8C8'} />
      {/* Roof shine */}
      <path d="M15 5L2 16h13V5z" fill="white" fillOpacity="0.12" />
      {/* Door */}
      <rect x="12" y="20" width="6" height="6" rx="1"
        fill={active ? '#C43C3C' : '#A0A0A0'} />
    </svg>
  )
}

function BookIcon({ active }: { active: boolean }) {
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
      {/* Left page */}
      <rect x="4" y="4" width="10" height="22" rx="2"
        fill={active ? '#FF9600' : '#C8C8C8'} />
      {/* Right page */}
      <rect x="16" y="4" width="10" height="22" rx="2"
        fill={active ? '#E07800' : '#A8A8A8'} />
      {/* Spine */}
      <rect x="13" y="3" width="4" height="24" rx="2"
        fill={active ? '#FFB732' : '#DEDEDE'} />
      {/* Lines on left page */}
      <path d="M6 9h6M6 13h6M6 17h4"
        stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
      {/* Shine */}
      <rect x="4" y="4" width="10" height="6" rx="2"
        fill="white" fillOpacity="0.15" />
    </svg>
  )
}

function CardsIcon({ active }: { active: boolean }) {
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
      {/* Back card */}
      <rect x="3" y="7" width="18" height="13" rx="3"
        fill={active ? '#CE82FF' : '#C8C8C8'}
        transform="rotate(-8 3 7)" />
      {/* Front card */}
      <rect x="9" y="10" width="18" height="13" rx="3"
        fill={active ? '#A855F7' : '#A8A8A8'} />
      {/* Card shine */}
      <rect x="9" y="10" width="18" height="5" rx="3"
        fill="white" fillOpacity="0.18" />
      {/* Star on front */}
      <path d="M18 14l1 2.5h2.5l-2 1.5.8 2.5-2.3-1.5-2.3 1.5.8-2.5-2-1.5H16l1-2.5z"
        fill="white" fillOpacity="0.6" />
    </svg>
  )
}

function GameIcon({ active }: { active: boolean }) {
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
      {/* Controller body */}
      <rect x="3" y="9" width="24" height="13" rx="6"
        fill={active ? '#2BD9FE' : '#C8C8C8'} />
      {/* Top shine */}
      <rect x="3" y="9" width="24" height="6" rx="6"
        fill="white" fillOpacity="0.2" />
      {/* D-pad vertical */}
      <rect x="8" y="13" width="2" height="7" rx="1" fill="white" fillOpacity="0.85" />
      {/* D-pad horizontal */}
      <rect x="6" y="15" width="6" height="2" rx="1" fill="white" fillOpacity="0.85" />
      {/* Buttons */}
      <circle cx="21" cy="13" r="2" fill="white" fillOpacity="0.7" />
      <circle cx="24" cy="16" r="2" fill="white" fillOpacity="0.7" />
      <circle cx="18" cy="16" r="2" fill="white" fillOpacity="0.5" />
    </svg>
  )
}

function ShopIcon({ active }: { active: boolean }) {
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
      {/* Bag body */}
      <path d="M6 13h18l-2.5 13H8.5L6 13z"
        fill={active ? '#FF9600' : '#C8C8C8'} />
      {/* Bag body shine */}
      <path d="M6 13h18l-1 5H7L6 13z"
        fill="white" fillOpacity="0.15" />
      {/* Handle */}
      <path d="M11 13V10a4 4 0 018 0v3"
        stroke={active ? '#CC7A00' : '#A0A0A0'}
        strokeWidth="2.5" strokeLinecap="round" fill="none" />
      {/* Horizontal stripe */}
      <path d="M9 17h12"
        stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
    </svg>
  )
}

function AxionIcon({ active }: { active: boolean }) {
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
      {/* Crown */}
      <path d="M7 14l4-7 4 5 4-7 4 9H7z"
        fill={active ? '#FFD700' : '#C8C8C8'} />
      <path d="M7 14l4-7 4 5 4-7 4 9H7z"
        fill="white" fillOpacity="0.15" />
      {/* Head */}
      <circle cx="15" cy="21" r="7" fill={active ? '#58CC02' : '#B0B0B0'} />
      <circle cx="15" cy="21" r="7" fill="white" fillOpacity="0.12" />
      {/* Eyes */}
      <circle cx="12.5" cy="20" r="1.4" fill="white" />
      <circle cx="17.5" cy="20" r="1.4" fill="white" />
      <circle cx="13" cy="20" r="0.7" fill="#333" />
      <circle cx="18" cy="20" r="0.7" fill="#333" />
      {/* Smile */}
      <path d="M12 23q3 2.5 6 0"
        stroke="white" strokeWidth="1.3" strokeLinecap="round" fill="none" />
    </svg>
  )
}

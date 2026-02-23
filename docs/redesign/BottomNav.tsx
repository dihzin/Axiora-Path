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
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t-[3px] border-gray-100 shadow-[0_-2px_16px_rgba(0,0,0,0.07)]">
      <div className="max-w-sm mx-auto flex items-center justify-around px-0 pt-2 pb-3">
        {navItems.map(({ href, label, Icon }) => {
          const active =
            href === '/' ? pathname === '/' : pathname.startsWith(href)

          return (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center gap-0.5 flex-1"
            >
              <div
                className={cn(
                  'flex items-center justify-center w-10 h-10 transition-all duration-200',
                  active ? 'scale-110' : 'scale-100'
                )}
                // Duolingo: inactive = slight desaturate + opacity, NOT full grayscale
                style={active ? {} : { filter: 'saturate(0.3)', opacity: 0.65 }}
              >
                <Icon active={active} />
              </div>

              <span
                className={cn(
                  'text-[9px] font-extrabold tracking-wider uppercase transition-colors',
                  active ? 'text-[#1CB0F6]' : 'text-gray-400'
                )}
              >
                {label}
              </span>

              {/* Active underline bar */}
              <span
                className={cn(
                  'h-[3px] rounded-full transition-all duration-200 mt-0.5',
                  active ? 'w-6 bg-[#1CB0F6]' : 'w-0 bg-transparent'
                )}
              />
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SVG Icons — all illustrated with color, depth, and shine layers
// ─────────────────────────────────────────────────────────────────────────────

function HomeIcon({ active }: { active: boolean }) {
  const main  = active ? '#FF4B4B' : '#BBBBBB'
  const dark  = active ? '#C43C3C' : '#999999'
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
      <path d="M15 4L1 16h4.5v10h7v-6h5v6h7V16H29L15 4z" fill={main} />
      <path d="M15 4L1 16h14V4z" fill="white" fillOpacity="0.15" />
      <rect x="12" y="20" width="6" height="6" rx="1" fill={dark} />
    </svg>
  )
}

function BookIcon({ active }: { active: boolean }) {
  const left  = active ? '#FF9600' : '#BBBBBB'
  const right = active ? '#D97B00' : '#999999'
  const spine = active ? '#FFB732' : '#D0D0D0'
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
      <rect x="3"  y="4" width="11" height="22" rx="2" fill={left}  />
      <rect x="16" y="4" width="11" height="22" rx="2" fill={right} />
      <rect x="13" y="3" width="4"  height="24" rx="2" fill={spine} />
      <path d="M5 9h7M5 13h7M5 17h5"
        stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.65" />
      <rect x="3" y="4" width="11" height="6" rx="2"
        fill="white" fillOpacity="0.18" />
    </svg>
  )
}

function CardsIcon({ active }: { active: boolean }) {
  const back  = active ? '#CE82FF' : '#BBBBBB'
  const front = active ? '#A855F7' : '#999999'
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
      <rect x="2" y="7" width="19" height="14" rx="3" fill={back}
        transform="rotate(-8 2 7)" />
      <rect x="9" y="9" width="19" height="14" rx="3" fill={front} />
      <rect x="9" y="9" width="19" height="5" rx="3"
        fill="white" fillOpacity="0.18" />
      <path d="M18.5 13.5l1 2.5h2.5l-2 1.5.8 2.5-2.3-1.5-2.3 1.5.8-2.5-2-1.5h2.5l1-2.5z"
        fill="white" fillOpacity="0.55" />
    </svg>
  )
}

function GameIcon({ active }: { active: boolean }) {
  const body = active ? '#2BD9FE' : '#BBBBBB'
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
      <rect x="2" y="9" width="26" height="14" rx="6" fill={body} />
      <rect x="2" y="9" width="26" height="7" rx="6"
        fill="white" fillOpacity="0.2" />
      {/* D-pad */}
      <rect x="7"  y="13" width="2" height="7" rx="1" fill="white" fillOpacity="0.85" />
      <rect x="5"  y="15" width="6" height="2" rx="1" fill="white" fillOpacity="0.85" />
      {/* Buttons */}
      <circle cx="21" cy="13" r="2.2" fill="white" fillOpacity="0.7" />
      <circle cx="24" cy="16" r="2.2" fill="white" fillOpacity="0.7" />
      <circle cx="18" cy="16" r="2.2" fill="white" fillOpacity="0.45" />
    </svg>
  )
}

function ShopIcon({ active }: { active: boolean }) {
  const bag    = active ? '#FF9600' : '#BBBBBB'
  const handle = active ? '#CC7A00' : '#999999'
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
      <path d="M5 13h20l-2.8 13H7.8L5 13z" fill={bag} />
      <path d="M5 13h20l-1 5H6L5 13z" fill="white" fillOpacity="0.15" />
      <path d="M11 13V10a4 4 0 018 0v3"
        stroke={handle} strokeWidth="2.6" strokeLinecap="round" fill="none" />
      <path d="M8 17h14"
        stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.45" />
    </svg>
  )
}

function AxionIcon({ active }: { active: boolean }) {
  const head   = active ? '#58CC02' : '#BBBBBB'
  const crown  = active ? '#FFD700' : '#D0D0D0'
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
      {/* Crown */}
      <path d="M7 15l4-7 4 5 4-7 4 9H7z" fill={crown} />
      <path d="M7 15l4-7 4 5 4-7 4 9H7z" fill="white" fillOpacity="0.15" />
      {/* Head */}
      <circle cx="15" cy="22" r="7" fill={head} />
      <circle cx="15" cy="22" r="7" fill="white" fillOpacity="0.12" />
      {/* Eyes */}
      <circle cx="12.5" cy="21" r="1.5" fill="white" />
      <circle cx="17.5" cy="21" r="1.5" fill="white" />
      <circle cx="13"   cy="21" r="0.7" fill="#333" />
      <circle cx="18"   cy="21" r="0.7" fill="#333" />
      {/* Smile */}
      <path d="M12 24q3 2.5 6 0"
        stroke="white" strokeWidth="1.3" strokeLinecap="round" fill="none" />
    </svg>
  )
}

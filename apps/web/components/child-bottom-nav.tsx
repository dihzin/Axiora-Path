"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { memo } from "react";
import { cn } from "@/lib/utils";

export type ChildNavIconKey = "inicio" | "aprender" | "figurinhas" | "jogos" | "loja" | "axion";

const ICON_COMPONENTS: Record<ChildNavIconKey, (props: { active: boolean }) => React.ReactElement> = {
  inicio: HomeIcon,
  aprender: BookIcon,
  figurinhas: CardsIcon,
  jogos: GameIcon,
  loja: ShopIcon,
  axion: ProfileIcon,
};

const NAV_ITEMS = [
  { href: "/child", label: "Início", iconKey: "inicio" as const },
  { href: "/child/aprender", label: "Aprender", iconKey: "aprender" as const },
  { href: "/child/stickers", label: "Figurinhas", iconKey: "figurinhas" as const },
  { href: "/child/games", label: "Jogos", iconKey: "jogos" as const },
  { href: "/child/store", label: "Loja", iconKey: "loja" as const },
  { href: "/child/axion", label: "Axion", iconKey: "axion" as const },
] as const;

type ChildBottomNavProps = {
  spacer?: boolean;
};

function ChildBottomNavComponent({ spacer = true }: ChildBottomNavProps) {
  const pathname = usePathname();

  return (
    <>
      {spacer ? <div aria-hidden className="pointer-events-none lg:hidden" style={{ height: "calc(6rem + env(safe-area-inset-bottom))" }} /> : null}
      <nav className="safe-px safe-pb fixed inset-x-0 bottom-0 z-50 border-t-[2px] border-gray-100 bg-white shadow-[0_-3px_14px_rgba(0,0,0,0.06)] lg:hidden">
        <div className="mx-auto flex w-full max-w-md items-center justify-between px-2 py-1.5 md:max-w-4xl xl:max-w-6xl">
          {NAV_ITEMS.map((item) => {
            const isActive = item.href === "/child" ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                aria-label={item.label}
                className="flex min-w-[52px] flex-1 flex-col items-center gap-0.5 px-1 py-1"
                href={item.href}
              >
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200",
                    isActive ? "scale-[1.12]" : "opacity-45 grayscale-[60%]",
                  )}
                >
                  <ChildNavIcon name={item.iconKey} active={isActive} size={28} />
                </div>
                <span className={cn("text-[10px] font-extrabold tracking-wide transition-colors", isActive ? "text-[#1CB0F6]" : "text-gray-400")}>
                  {item.label}
                </span>
                {isActive ? <span className="h-[3px] w-6 rounded-full bg-[#1CB0F6]" /> : null}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}

export const ChildBottomNav = memo(ChildBottomNavComponent);

export function ChildNavIcon({ name, active, size = 28 }: { name: ChildNavIconKey; active: boolean; size?: number }) {
  const Icon = ICON_COMPONENTS[name];
  return (
    <span className="inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <Icon active={active} />
    </span>
  );
}

function HomeIcon({ active }: { active: boolean }) {
  const c = active ? "#FF4B4B" : "#AFAFAF";
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden>
      <path d="M16 4 3 15h4v13h8v-8h2v8h8V15h4L16 4z" fill={c} />
      <path d="M16 4 3 15h4v13h8v-8h2v8h8V15h4L16 4z" fill="white" fillOpacity="0.15" />
      <rect x="13" y="19" width="6" height="9" rx="1" fill={active ? "#C43C3C" : "#8A8A8A"} />
    </svg>
  );
}

function BookIcon({ active }: { active: boolean }) {
  const c = active ? "#FF9600" : "#AFAFAF";
  const dark = active ? "#CC7A00" : "#8A8A8A";
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden>
      <rect x="5" y="5" width="10" height="22" rx="2" fill={c} />
      <rect x="17" y="5" width="10" height="22" rx="2" fill={dark} />
      <rect x="14" y="4" width="4" height="24" rx="2" fill={active ? "#FFB732" : "#CBCBCB"} />
      <path d="M7 10h6M7 14h6M7 18h4" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CardsIcon({ active }: { active: boolean }) {
  const c = active ? "#CE82FF" : "#AFAFAF";
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden>
      <rect x="4" y="8" width="18" height="14" rx="3" fill={c} transform="rotate(-8 4 8)" />
      <rect x="10" y="10" width="18" height="14" rx="3" fill={active ? "#A855F7" : "#CBCBCB"} />
      <circle cx="19" cy="17" r="3" fill="white" fillOpacity="0.4" />
    </svg>
  );
}

function GameIcon({ active }: { active: boolean }) {
  const c = active ? "#2BD9FE" : "#AFAFAF";
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden>
      <rect x="4" y="10" width="24" height="14" rx="5" fill={c} />
      <rect x="4" y="10" width="24" height="7" rx="5" fill="white" fillOpacity="0.15" />
      <rect x="8" y="15" width="2" height="6" rx="1" fill="white" />
      <rect x="6" y="17" width="6" height="2" rx="1" fill="white" />
      <circle cx="22" cy="15" r="1.5" fill="white" fillOpacity="0.8" />
      <circle cx="25" cy="18" r="1.5" fill="white" fillOpacity="0.8" />
    </svg>
  );
}

function ShopIcon({ active }: { active: boolean }) {
  const c = active ? "#FF9600" : "#AFAFAF";
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden>
      <path d="M7 13h18l-2 13H9L7 13z" fill={c} />
      <path d="M12 13V10a4 4 0 0 1 8 0v3" stroke={active ? "#CC7A00" : "#8A8A8A"} strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <path d="M10 16h12" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
    </svg>
  );
}

function ProfileIcon({ active }: { active: boolean }) {
  const c = active ? "#58CC02" : "#AFAFAF";
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden>
      <path d="M8 14l4-6 4 4 4-6 4 8H8z" fill={active ? "#FFD700" : "#CBCBCB"} />
      <circle cx="16" cy="20" r="7" fill={c} />
      <circle cx="16" cy="20" r="7" fill="white" fillOpacity="0.15" />
      <circle cx="13.5" cy="19" r="1.2" fill="white" />
      <circle cx="18.5" cy="19" r="1.2" fill="white" />
      <path d="M13 22.5q3 2 6 0" stroke="white" strokeWidth="1.2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

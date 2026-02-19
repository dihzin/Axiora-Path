"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { memo } from "react";

const NAV_ITEMS = [
  { href: "/child", label: "Inicio", iconSrc: "/icons/inicio.svg" },
  { href: "/child/aprender", label: "Aprender", iconSrc: "/icons/aprender.svg" },
  { href: "/child/stickers", label: "Figurinhas", iconSrc: "/icons/figurinhas.svg" },
  { href: "/child/games", label: "Jogos", iconSrc: "/icons/jogos.svg" },
  { href: "/child/store", label: "Loja", iconSrc: "/icons/loja.svg" },
  { href: "/child/coach", label: "Axion", iconSrc: "/icons/axion.svg" },
] as const;

function ChildBottomNavComponent() {
  const pathname = usePathname();

  return (
    <>
      <div aria-hidden className="pointer-events-none" style={{ height: "calc(6rem + env(safe-area-inset-bottom))" }} />
      <nav className="safe-px safe-pb fixed inset-x-0 bottom-0 border-t border-[rgba(77,217,192,0.18)] bg-[rgba(255,255,255,0.97)] py-2 backdrop-blur">
        <div className="mx-auto grid w-full max-w-md grid-cols-6 gap-1 md:max-w-2xl">
          {NAV_ITEMS.map((item) => {
            const isActive = item.href === "/child" ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                aria-label={item.label}
                className="relative flex min-w-0 flex-col items-center gap-1 rounded-[14px] px-0.5 py-1 text-[8px] font-extrabold uppercase leading-none tracking-[0.02em] text-[#B8C8DC] transition-all hover:bg-[rgba(77,217,192,0.08)]"
                href={item.href}
              >
                <img
                  src={item.iconSrc}
                  alt=""
                  aria-hidden
                  className={`h-10 w-10 select-none object-contain transition-transform duration-200 [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)] ${
                    isActive ? "scale-[1.15] -translate-y-[3px]" : "hover:scale-[1.2] hover:-translate-y-1"
                  }`}
                  draggable={false}
                />
                <span className={`text-center ${isActive ? "text-[#2ABBA3]" : "text-[#B8C8DC]"}`}>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}

export const ChildBottomNav = memo(ChildBottomNavComponent);

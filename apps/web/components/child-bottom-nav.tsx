"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { memo } from "react";

const NAV_ITEMS = [
  { href: "/child", label: "Início", iconSrc: "/icons/inicio.svg" },
  { href: "/child/aprender", label: "Aprender", iconSrc: "/icons/aprender.svg" },
  { href: "/child/stickers", label: "Figurinhas", iconSrc: "/icons/figurinhas.svg" },
  { href: "/child/games", label: "Jogos", iconSrc: "/icons/jogos.svg" },
  { href: "/child/store", label: "Loja", iconSrc: "/icons/loja.svg" },
  { href: "/child/axion", label: "Axion", iconSrc: "/icons/axion.svg" },
] as const;

function ChildBottomNavComponent() {
  const pathname = usePathname();

  return (
    <>
      <div aria-hidden className="pointer-events-none" style={{ height: "calc(6rem + env(safe-area-inset-bottom))" }} />
      <nav className="safe-px safe-pb fixed inset-x-0 bottom-0 border-t border-[rgba(77,217,192,0.15)] bg-[rgba(255,255,255,0.98)] py-2 backdrop-blur">
        <div className="mx-auto grid w-full max-w-md grid-cols-6 gap-0.5 md:max-w-4xl xl:max-w-6xl">
          {NAV_ITEMS.map((item) => {
            const isActive = item.href === "/child" ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                aria-label={item.label}
                className="group relative flex min-w-0 flex-col items-center gap-1 rounded-xl px-0.5 py-1 text-[8px] font-black uppercase leading-none tracking-[0.02em] transition-all"
                href={item.href}
              >
                <Image
                  alt={item.label}
                  className={`h-10 w-10 origin-bottom transform-gpu object-contain transition duration-200 ease-out ${
                    isActive
                      ? "-translate-y-0.5 scale-[1.12] saturate-100 brightness-100"
                      : "scale-100 saturate-[0.72] brightness-[0.84] group-hover:-translate-y-0.5 group-hover:scale-[1.08] group-hover:saturate-100 group-hover:brightness-100"
                  }`}
                  height={40}
                  priority={isActive}
                  src={item.iconSrc}
                  width={40}
                />
                <span className={`text-center ${isActive ? "text-[#23BFA6]" : "text-[#9FB0CA]"}`}>{item.label}</span>
                {isActive ? <span className="absolute -bottom-1.5 h-1.5 w-1.5 rounded-full bg-[#4DD9C0]" /> : null}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}

export const ChildBottomNav = memo(ChildBottomNavComponent);

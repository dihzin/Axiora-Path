"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/child", label: "Início", iconSrc: "/icons/inicio.svg" },
  { href: "/child/aprender", label: "Aprender", iconSrc: "/icons/aprender.svg" },
  { href: "/child/stickers", label: "Figurinhas", iconSrc: "/icons/figurinhas.svg" },
  { href: "/child/games", label: "Jogos", iconSrc: "/icons/jogos.svg" },
  { href: "/child/store", label: "Loja", iconSrc: "/icons/loja.svg" },
  { href: "/child/axion", label: "Axion", iconSrc: "/icons/axion.svg" },
] as const;

export function FixedBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegação infantil"
      className="h-full border-t border-[rgba(77,217,192,0.18)] bg-[rgba(255,255,255,0.98)] px-2 pt-2 backdrop-blur"
    >
      <div className="grid h-full grid-cols-6 gap-0.5">
        {NAV_ITEMS.map((item) => {
          const isActive = item.href === "/child" ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              className="relative flex min-h-[48px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1"
            >
              <Image
                alt={item.label}
                src={item.iconSrc}
                width={36}
                height={36}
                className={`h-8 w-8 object-contain transition duration-150 ${isActive ? "scale-[1.08] saturate-100" : "saturate-[0.72] opacity-85"}`}
              />
              <span className={`text-[9px] font-black uppercase leading-none ${isActive ? "text-[#23BFA6]" : "text-[#93A5C0]"}`}>{item.label}</span>
              {isActive ? <span className="absolute -bottom-0.5 h-1.5 w-1.5 rounded-full bg-[#4DD9C0]" /> : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

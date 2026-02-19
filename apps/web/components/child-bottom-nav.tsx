"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Home, Puzzle, ShoppingBag, Sparkles, Star } from "lucide-react";
import { memo } from "react";

const NAV_ITEMS = [
  { href: "/child", label: "Inicio", icon: Home },
  { href: "/child/aprender", label: "Aprender", icon: BookOpen },
  { href: "/child/stickers", label: "Figurinhas", icon: Star },
  { href: "/child/games", label: "Jogos", icon: Puzzle },
  { href: "/child/store", label: "Loja", icon: ShoppingBag },
  { href: "/child/coach", label: "Axion", icon: Sparkles },
] as const;

function ChildBottomNavComponent() {
  const pathname = usePathname();

  return (
    <>
      <div aria-hidden className="pointer-events-none" style={{ height: "calc(6rem + env(safe-area-inset-bottom))" }} />
      <nav className="safe-px safe-pb fixed inset-x-0 bottom-0 border-t border-border bg-background/95 py-2 backdrop-blur">
        <div className="mx-auto grid w-full max-w-md grid-cols-6 gap-1 md:max-w-2xl">
          {NAV_ITEMS.map((item) => {
            const isActive = item.href === "/child" ? pathname === item.href : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                aria-label={item.label}
                className={`flex min-w-0 flex-col items-center gap-1 rounded-2xl px-1 py-2 text-xs font-semibold leading-tight transition-all ${
                  isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
                }`}
                href={item.href}
              >
                <span
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-2xl border-2 transition-all ${
                    isActive
                      ? "border-primary/45 bg-primary/15 shadow-[0_3px_0_rgba(178,69,36,0.25)]"
                      : "border-border bg-white shadow-[0_2px_0_rgba(184,200,239,0.7)]"
                  }`}
                >
                  <Icon className={`h-[18px] w-[18px] ${isActive ? "stroke-[2.6]" : "stroke-[2.4]"}`} />
                </span>
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}

export const ChildBottomNav = memo(ChildBottomNavComponent);

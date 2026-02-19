"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { memo } from "react";
import { BookOpen, Gamepad2, House, ShoppingBag, Sparkles, Star } from "lucide-react";

const NAV_ITEMS = [
  { href: "/child", label: "Início", icon: House },
  { href: "/child/aprender", label: "Aprender", icon: BookOpen },
  { href: "/child/stickers", label: "Figurinhas", icon: Star },
  { href: "/child/games", label: "Jogos", icon: Gamepad2 },
  { href: "/child/store", label: "Loja", icon: ShoppingBag },
  { href: "/child/coach", label: "Axion", icon: Sparkles },
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
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                aria-label={item.label}
                className="relative flex min-w-0 flex-col items-center gap-1 rounded-xl px-0.5 py-1 text-[8px] font-bold uppercase leading-none tracking-[0.02em] transition-all"
                href={item.href}
              >
                <span
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${
                    isActive ? "border-[#4DD9C0]/45 bg-[#4DD9C0]/12 text-[#1E293B]" : "border-[#C9D5E8] bg-white text-[#8FA1BE]"
                  }`}
                >
                  <Icon className="h-4.5 w-4.5" strokeWidth={2.2} />
                </span>
                <span className={`text-center ${isActive ? "text-[#2ABBA3]" : "text-[#9CB0CC]"}`}>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}

export const ChildBottomNav = memo(ChildBottomNavComponent);

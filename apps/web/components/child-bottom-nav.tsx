"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Sparkles, Star } from "lucide-react";
import { memo } from "react";

const NAV_ITEMS = [
  { href: "/child", label: "Inicio", icon: Home },
  { href: "/child/stickers", label: "Stickers", icon: Star },
  { href: "/child/coach", label: "Coach", icon: Sparkles },
] as const;

function ChildBottomNavComponent() {
  const pathname = usePathname();

  return (
    <nav className="safe-px safe-pb fixed inset-x-0 bottom-0 border-t border-border bg-background/95 py-2 backdrop-blur">
      <div className="mx-auto grid w-full max-w-md grid-cols-3 gap-1">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              className={`flex min-w-0 flex-col items-center gap-1 rounded-md px-1 py-2 text-xs font-medium leading-tight transition ${
                isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
              }`}
              href={item.href}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export const ChildBottomNav = memo(ChildBottomNavComponent);

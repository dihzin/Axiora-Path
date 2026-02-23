"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { AxionCharacter } from "@/components/axion-character";
import { ChildNavIcon, type ChildNavIconKey } from "@/components/child-bottom-nav";
import { TopStatsBar } from "@/components/trail/TopStatsBar";

type ChildDesktopShellProps = {
  children: ReactNode;
  activeNav?: ChildNavIconKey;
  rightRail?: ReactNode;
};

const NAV_ITEMS: Array<{ href: string; label: string; iconName: ChildNavIconKey }> = [
  { href: "/child", label: "Início", iconName: "inicio" },
  { href: "/child/aprender", label: "Aprender", iconName: "aprender" },
  { href: "/child/stickers", label: "Figurinhas", iconName: "figurinhas" },
  { href: "/child/games", label: "Jogos", iconName: "jogos" },
  { href: "/child/store", label: "Loja", iconName: "loja" },
  { href: "/child/axion", label: "Axion", iconName: "axion" },
];

export function ChildDesktopShell({ children, activeNav, rightRail }: ChildDesktopShellProps) {
  const pathname = usePathname();
  const resolvedActive = activeNav ?? resolveActive(pathname);

  return (
    <div className="min-h-screen bg-[#F4F7FC]">
      <div className="w-full lg:pl-[208px]">
        <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-20 lg:flex lg:w-[208px] lg:flex-col lg:gap-1 lg:border-r lg:border-[#E2E8F2] lg:bg-[#F4F7FC] lg:px-3 lg:py-5">
          <div className="mb-0.5 flex justify-center">
            <AxionCharacter stage={1} moodState="NEUTRAL" reducedMotion={false} />
          </div>
          {NAV_ITEMS.map((item) => (
            <DesktopNavItem
              key={item.href}
              href={item.href}
              iconName={item.iconName}
              label={item.label}
              active={resolvedActive === item.iconName}
            />
          ))}
        </aside>

        <div className="mx-auto w-full lg:grid lg:max-w-[1220px] lg:grid-cols-[minmax(620px,1fr)_320px] lg:gap-7 lg:px-5 xl:px-8">
          <div className="mx-auto w-full max-w-sm px-4 pb-4 pt-3 md:max-w-3xl md:px-6 lg:max-w-[760px] lg:px-0 lg:pb-10 lg:pt-5">{children}</div>

          <aside className="hidden lg:block lg:py-5">
            <div className="sticky top-5 space-y-3.5">
              {rightRail ?? <DefaultRightRail />}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function resolveActive(pathname: string): ChildNavIconKey {
  if (pathname.startsWith("/child/aprender")) return "aprender";
  if (pathname.startsWith("/child/stickers")) return "figurinhas";
  if (pathname.startsWith("/child/games")) return "jogos";
  if (pathname.startsWith("/child/store")) return "loja";
  if (pathname.startsWith("/child/axion")) return "axion";
  return "inicio";
}

function DesktopNavItem({ href, iconName, label, active }: { href: string; iconName: ChildNavIconKey; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`mx-1.5 inline-flex items-center gap-2.5 rounded-2xl px-4 py-[7px] text-[15px] font-black uppercase tracking-[0.04em] transition-colors ${
        active ? "border border-[#96D9FF] bg-[#EAF7FF] text-[#1DA1F2]" : "text-[#4A5F80] hover:bg-white"
      }`}
    >
      <span className={`${active ? "opacity-100" : "opacity-75 grayscale-[35%]"}`}>
        <ChildNavIcon name={iconName} active={active} size={42} />
      </span>
      {label}
    </Link>
  );
}

function DefaultRightRail() {
  return (
    <>
      <TopStatsBar streak={1} gems={277} xp={31} className="max-w-none" />
      <div className="rounded-2xl border border-[#DFE7F2] bg-white p-4 shadow-[0_4px_14px_rgba(0,0,0,0.06)]">
        <p className="text-xs font-black uppercase tracking-[0.08em] text-[#8A9BB4]">Progresso</p>
        <p className="mt-1 text-lg font-black text-[#1F3558]">Você está indo bem!</p>
        <p className="mt-1 text-sm font-semibold text-[#5F7393]">Continue explorando para evoluir no Axiora.</p>
      </div>
    </>
  );
}

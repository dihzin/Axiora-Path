"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { AxionCharacter } from "@/components/axion-character";
import { ChildNavIcon, type ChildNavIconKey } from "@/components/child-bottom-nav";
import { TopStatsBar } from "@/components/trail/TopStatsBar";
import { getAprenderLearningProfile, getStreak } from "@/lib/api/client";
import { enforceProfileCompletionRedirect } from "@/lib/profile-completion-middleware";

type ChildDesktopShellProps = {
  children: ReactNode;
  activeNav?: ChildNavIconKey;
  rightRail?: ReactNode;
  rightRailAppend?: ReactNode;
  menuSkin?: "default" | "trail";
  topBar?: ReactNode;
};

const NAV_ITEMS: Array<{ href: string; label: string; iconName: ChildNavIconKey }> = [
  { href: "/child", label: "Início", iconName: "inicio" },
  { href: "/child/aprender", label: "Aprender", iconName: "aprender" },
  { href: "/child/stickers", label: "Figurinhas", iconName: "figurinhas" },
  { href: "/child/games", label: "Jogos", iconName: "jogos" },
  { href: "/child/store", label: "Loja", iconName: "loja" },
  { href: "/child/axion", label: "Axion", iconName: "axion" },
];

export function ChildDesktopShell({ children, activeNav, rightRail, rightRailAppend, menuSkin = "default", topBar }: ChildDesktopShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const resolvedActive = activeNav ?? resolveActive(pathname);
  const [profileGuardReady, setProfileGuardReady] = useState(false);
  const isTrailSkin = menuSkin === "trail";

  useEffect(() => {
    if (typeof window === "undefined") return;
    const rawChildId = window.localStorage.getItem("axiora_child_id");
    const parsedChildId = rawChildId ? Number(rawChildId) : NaN;
    const childId = Number.isFinite(parsedChildId) && parsedChildId > 0 ? parsedChildId : null;
    let active = true;
    void enforceProfileCompletionRedirect({
      childId,
      redirect: (target) => router.replace(target),
    }).finally(() => {
      if (active) setProfileGuardReady(true);
    });
    return () => {
      active = false;
    };
  }, [router]);

  if (!profileGuardReady) {
    return null;
  }

  return (
    <div
      className={
        isTrailSkin
          ? "min-h-screen"
          : "min-h-screen bg-[radial-gradient(circle_at_46%_16%,rgba(255,163,94,0.16),rgba(24,49,46,0.04)_28%,rgba(2,6,23,0)_56%),radial-gradient(circle_at_72%_24%,rgba(79,157,138,0.12),rgba(2,6,23,0)_24%),linear-gradient(180deg,#112826_0%,#16312E_40%,#17322F_100%)]"
      }
    >
      <div className="w-full lg:pl-[208px]">
        <aside
          className={
            menuSkin === "trail"
              ? "hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-20 lg:flex lg:w-[208px] lg:flex-col lg:gap-1 lg:border-r lg:border-t lg:border-white/12 lg:border-t-white/10 lg:bg-[linear-gradient(180deg,rgba(20,52,47,0.62)_0%,rgba(14,35,32,0.48)_100%)] lg:px-3 lg:py-5 lg:backdrop-blur-xl"
              : "hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-20 lg:flex lg:w-[208px] lg:flex-col lg:gap-1 lg:border-r lg:border-white/5 lg:bg-[linear-gradient(180deg,rgba(20,40,37,0.96)_0%,rgba(16,33,31,0.98)_100%)] lg:px-3 lg:py-5 lg:shadow-[inset_-1px_0_0_rgba(255,255,255,0.04)]"
          }
        >
          <div className="mb-0.5 flex justify-center">
              <div
                className={
                  menuSkin === "trail"
                    ? "rounded-2xl bg-[#1C3A36]/82 p-1.5 shadow-[inset_0_1px_12px_rgba(0,0,0,0.3)]"
                    : "rounded-2xl bg-[linear-gradient(180deg,rgba(30,55,49,0.9),rgba(20,40,37,0.92))] p-1.5 shadow-[0_10px_24px_rgba(7,20,17,0.24),inset_0_1px_12px_rgba(255,255,255,0.04)]"
                }
              >
              <div className="scale-90">
                <AxionCharacter stage={1} moodState="NEUTRAL" reducedMotion={false} />
              </div>
            </div>
          </div>
          {NAV_ITEMS.map((item) => (
            <DesktopNavItem
              key={item.href}
              href={item.href}
              iconName={item.iconName}
              label={item.label}
              active={resolvedActive === item.iconName}
              skin={menuSkin}
            />
          ))}
        </aside>

        {topBar ? (
          <div
            className={
              isTrailSkin
                ? "relative z-30 mx-auto hidden w-full lg:block lg:px-3 lg:pt-2 xl:px-4 2xl:px-5"
                : "relative z-30 mx-auto hidden w-full lg:block lg:max-w-[1320px] lg:px-6 lg:pt-2 xl:max-w-[1420px] xl:px-8 xl:pt-2"
            }
          >
            {topBar}
          </div>
        ) : null}

        <div
          className={
            isTrailSkin
              ? "mx-auto w-full lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-4 lg:px-3 xl:grid-cols-[minmax(0,1fr)_356px] xl:px-4 2xl:px-5"
              : "mx-auto w-full lg:grid lg:max-w-[1320px] lg:grid-cols-[minmax(680px,820px)_320px] lg:gap-8 lg:px-6 xl:max-w-[1420px] xl:grid-cols-[minmax(720px,880px)_340px] xl:px-8"
          }
        >
          <div
            className={
              isTrailSkin
                ? "mx-auto w-full max-w-sm px-4 pb-4 pt-3 md:max-w-3xl md:px-6 lg:max-w-none lg:px-1 lg:pb-10 lg:pt-3"
                : "mx-auto w-full max-w-sm px-4 pb-4 pt-3 md:max-w-3xl md:px-6 lg:max-w-[820px] lg:px-0 lg:pb-10 lg:pt-5 xl:max-w-[880px]"
            }
          >
            {children}
          </div>

          <aside className={isTrailSkin ? "hidden lg:block lg:py-3" : "hidden lg:block lg:py-5"}>
            <div className="sticky top-5 space-y-3.5">
              {rightRail ?? (
                <>
                  <DefaultRightRail />
                  {rightRailAppend}
                </>
              )}
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

function DesktopNavItem({
  href,
  iconName,
  label,
  active,
  skin,
}: {
  href: string;
  iconName: ChildNavIconKey;
  label: string;
  active: boolean;
  skin: "default" | "trail";
}) {
  return (
    <Link
      href={href}
      className={
        skin === "trail"
          ? `mx-1.5 inline-flex items-center gap-2.5 rounded-2xl px-4 py-[7px] text-[15px] font-semibold uppercase tracking-[0.04em] text-slate-200/85 transition-all duration-200 ${
              active
                ? "border-l-[3px] border-l-amber-300/90 bg-white/14 text-slate-100"
                : "text-slate-200/80 hover:bg-white/10 hover:text-slate-100/95"
            }`
          : `mx-1.5 inline-flex items-center gap-2.5 rounded-2xl px-4 py-[7px] text-[15px] font-black uppercase tracking-[0.04em] transition-colors ${
              active ? "border border-[#FFBE85]/35 bg-[#FF7A2F]/12 text-[#FFE7D1]" : "text-[#D7C7B5] hover:bg-white/5"
            }`
      }
    >
      <span className={skin === "trail" ? "opacity-85 grayscale-[80%]" : `${active ? "opacity-100" : "opacity-80 grayscale-[22%]"}`}>
        <ChildNavIcon name={iconName} active={active} size={42} />
      </span>
      {label}
    </Link>
  );
}

function DefaultRightRail() {
  const [streak, setStreak] = useState(0);
  const [gems, setGems] = useState(0);
  const [xp, setXp] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const rawChildId = window.localStorage.getItem("axiora_child_id");
    const childId = rawChildId ? Number(rawChildId) : NaN;
    if (!Number.isFinite(childId) || childId <= 0) {
      setStreak(0);
      setGems(0);
      setXp(0);
      return;
    }

    let cancelled = false;
    const loadStats = () => {
      void getStreak(childId)
        .then((data) => {
          if (!cancelled) setStreak(Math.max(0, data.current));
        })
        .catch(() => {
          if (!cancelled) setStreak(0);
        });
      void getAprenderLearningProfile()
        .then((data) => {
          if (!cancelled) {
            setGems(Math.max(0, Math.round(data.axionCoins ?? 0)));
            setXp(Math.max(0, Math.min(100, Math.round(data.xpLevelPercent ?? 0))));
          }
        })
        .catch(() => {
          if (!cancelled) {
            setGems(0);
            setXp(0);
          }
        });
    };

    loadStats();
    const intervalId = window.setInterval(loadStats, 15000);
    window.addEventListener("focus", loadStats);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", loadStats);
    };
  }, []);

  return (
    <>
      <TopStatsBar streak={streak} gems={gems} xp={xp} className="max-w-none" />
      <div className="rounded-[26px] border border-white/10 bg-[linear-gradient(160deg,rgba(28,54,48,0.88)_0%,rgba(24,48,43,0.84)_55%,rgba(18,39,35,0.92)_100%)] p-4 shadow-[0_10px_28px_rgba(7,20,17,0.32),inset_0_1px_0_rgba(255,255,255,0.08)]">
        <p className="text-xs font-black uppercase tracking-[0.08em] text-[#CDBAA6]">Progresso</p>
        <p className="mt-1 text-lg font-black text-[#FFF4E7]">Você está indo bem!</p>
        <p className="mt-1 text-sm font-semibold text-[#E6D8C7]">Continue explorando para evoluir no Axiora.</p>
      </div>
    </>
  );
}

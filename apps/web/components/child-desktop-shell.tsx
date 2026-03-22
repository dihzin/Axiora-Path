"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

import { AxionCharacter } from "@/components/axion-character";
import { ChildNavIcon, type ChildNavIconKey } from "@/components/child-bottom-nav";
import { enforceProfileCompletionRedirect } from "@/lib/profile-completion-middleware";
import { cn } from "@/lib/utils";

type ChildDesktopShellProps = {
  children: ReactNode;
  activeNav?: ChildNavIconKey;
  rightRail?: ReactNode;
  rightRailAppend?: ReactNode;
  menuSkin?: "default" | "trail";
  topBar?: ReactNode;
  density?: "regular" | "dense";
  contentScale?: number;
};

const NAV_ITEMS: Array<{ href: string; label: string; iconName: ChildNavIconKey }> = [
  { href: "/child", label: "Início", iconName: "inicio" },
  { href: "/child/aprender", label: "Aprender", iconName: "aprender" },
  { href: "/child/stickers", label: "Figurinhas", iconName: "figurinhas" },
  { href: "/child/games", label: "Jogos", iconName: "jogos" },
  { href: "/child/store", label: "Loja", iconName: "loja" },
  { href: "/child/axion", label: "Axion", iconName: "axion" },
];

export function ChildDesktopShell({
  children,
  activeNav,
  rightRail,
  rightRailAppend,
  menuSkin = "default",
  topBar,
  density = "regular",
  contentScale = 1,
}: ChildDesktopShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const resolvedActive = activeNav ?? resolveActive(pathname);
  const [profileGuardReady, setProfileGuardReady] = useState(false);
  const isTrailSkin = menuSkin === "trail";
  const dense = density === "dense";
  const scaledStyle = contentScale < 0.999 ? ({ zoom: contentScale } as CSSProperties) : undefined;
  const railContent = rightRail ?? rightRailAppend ?? null;
  const hasRightRailContent = Boolean(railContent);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const rawChildId = window.sessionStorage.getItem("axiora_child_id");
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
          ? "relative z-[1] min-h-screen bg-[radial-gradient(1200px_540px_at_8%_-12%,rgba(56,189,248,0.10),transparent_60%),radial-gradient(980px_520px_at_92%_-10%,rgba(251,146,60,0.12),transparent_58%),linear-gradient(180deg,rgba(241,245,249,0.94)_0%,rgba(226,236,250,0.86)_100%)] lg:flex lg:h-screen lg:min-h-0 lg:flex-col lg:overflow-hidden"
          : "min-h-screen bg-[radial-gradient(1200px_540px_at_8%_-12%,rgba(56,189,248,0.10),transparent_60%),radial-gradient(980px_520px_at_92%_-10%,rgba(251,146,60,0.12),transparent_58%),linear-gradient(180deg,rgba(241,245,249,0.94)_0%,rgba(226,236,250,0.86)_100%)]"
      }
    >
      <div className={isTrailSkin ? cn("flex w-full flex-1 min-h-0 flex-col lg:overflow-hidden", dense ? "lg:pl-[184px]" : "lg:pl-[208px]") : "w-full lg:pl-[208px]"}>
        <aside
          className={
            menuSkin === "trail"
              ? cn(
                  "hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-20 lg:flex lg:flex-col lg:gap-1 lg:border-r lg:border-white/8 lg:bg-[linear-gradient(180deg,rgba(6,18,39,0.46)_0%,rgba(4,13,30,0.42)_100%)] lg:backdrop-blur-md",
                  dense ? "lg:w-[184px] lg:px-2.5 lg:py-4" : "lg:w-[208px] lg:px-3 lg:py-5",
                )
              : "hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-20 lg:flex lg:w-[208px] lg:flex-col lg:gap-1 lg:border-r-[3px] lg:border-r-[#5C4033] lg:bg-[linear-gradient(180deg,#3E2723_0%,#2A1810_100%)] lg:px-3 lg:py-5 lg:shadow-[4px_0_24px_rgba(0,0,0,0.4),inset_-1px_0_0_rgba(255,183,3,0.08)]"
          }
        >
          <div className="mb-0.5 flex justify-center">
              <div
                className={
                  menuSkin === "trail"
                    ? cn("rounded-2xl bg-[#12213D]/80 shadow-[inset_0_1px_12px_rgba(0,0,0,0.35)]", dense ? "p-1" : "p-1.5")
                    : "rounded-2xl border border-[#6D4C41]/60 bg-[linear-gradient(180deg,#4A2E22,#321A10)] p-1.5 shadow-[0_10px_24px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,183,3,0.10)]"
                }
              >
              <div className={dense ? "scale-[0.8]" : "scale-90"}>
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
              compact={dense}
            />
          ))}
        </aside>

        {topBar ? (
          <div
            className={
              isTrailSkin
                ? cn("sticky top-0 z-30 mx-auto hidden w-full bg-[rgba(15,23,42,0.06)] [backdrop-filter:blur(3px)] lg:block", dense ? "lg:px-2.5 lg:pt-1.5 xl:px-3.5 2xl:px-4" : "lg:px-3 lg:pt-2 xl:px-4 2xl:px-5")
                : "relative z-30 mx-auto hidden w-full lg:block lg:max-w-[1320px] lg:px-6 lg:pt-2 xl:max-w-[1420px] xl:px-8 xl:pt-2"
            }
            style={isTrailSkin ? scaledStyle : undefined}
          >
            {topBar}
          </div>
        ) : null}

        <div
            className={
              isTrailSkin
                ? cn(
                    "mx-auto w-full flex-1 min-h-0 lg:grid lg:overflow-hidden",
                    hasRightRailContent
                      ? dense
                        ? "lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-3 lg:px-2.5 xl:grid-cols-[minmax(0,1fr)_320px] xl:px-3.5 2xl:px-4"
                        : "lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-4 lg:px-3 xl:grid-cols-[minmax(0,1fr)_356px] xl:px-4 2xl:px-5"
                      : dense
                        ? "lg:grid-cols-[minmax(0,1fr)] lg:gap-0 lg:px-2.5 xl:px-3.5 2xl:px-4"
                        : "lg:grid-cols-[minmax(0,1fr)] lg:gap-0 lg:px-3 xl:px-4 2xl:px-5",
                  )
                : hasRightRailContent
                  ? "mx-auto w-full lg:grid lg:max-w-[1320px] lg:grid-cols-[minmax(680px,820px)_320px] lg:gap-8 lg:px-6 xl:max-w-[1420px] xl:grid-cols-[minmax(720px,880px)_340px] xl:px-8"
                  : "mx-auto w-full lg:max-w-[1320px] lg:px-6 xl:max-w-[1420px] xl:px-8"
            }
          style={isTrailSkin ? scaledStyle : undefined}
        >
          <div
            className={
              isTrailSkin
                ? cn("mx-auto w-full px-4 pb-4 pt-3 md:px-6 lg:overflow-hidden lg:pb-6", dense ? "lg:px-0.5 lg:pt-2" : "lg:px-1 lg:pt-3")
                : "mx-auto w-full max-w-sm px-4 pb-4 pt-3 md:max-w-3xl md:px-6 lg:max-w-[820px] lg:px-0 lg:pb-10 lg:pt-5 xl:max-w-[880px]"
            }
          >
            {children}
          </div>

          {hasRightRailContent ? (
            <aside className={isTrailSkin ? cn("hidden lg:block lg:overflow-y-auto", dense ? "lg:py-2" : "lg:py-3") : "hidden lg:block lg:py-5"}>
              <div className={cn("sticky space-y-3.5", dense ? "top-3 space-y-3" : "top-5")}>
                {railContent}
              </div>
            </aside>
          ) : null}
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
  compact = false,
}: {
  href: string;
  iconName: ChildNavIconKey;
  label: string;
  active: boolean;
  skin: "default" | "trail";
  compact?: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        skin === "trail"
          ? `mx-1.5 inline-flex items-center rounded-2xl font-bold uppercase tracking-[0.04em] transition-all duration-200 ${compact ? "gap-2 px-3 py-1.5 text-[13px]" : "gap-2.5 px-4 py-[7px] text-[15px]"} ${
              active
                ? "border-l-[3px] border-l-[#FFB703] bg-[rgba(255,183,3,0.12)] text-[#FFF3CC] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                : "text-[#FAEBD7]/80 hover:bg-[rgba(255,183,3,0.07)] hover:text-[#FFF3CC]"
            }`
          : `mx-1.5 inline-flex items-center rounded-2xl font-black uppercase tracking-[0.04em] transition-all duration-200 ${compact ? "gap-2 px-3 py-1.5 text-[13px]" : "gap-2.5 px-4 py-[7px] text-[15px]"} ${
              active
                ? "border border-[#FFB703]/40 bg-[linear-gradient(135deg,rgba(255,183,3,0.18),rgba(255,140,0,0.12))] text-[#FFF3CC] shadow-[0_0_12px_rgba(255,183,3,0.18),inset_0_1px_0_rgba(255,255,255,0.08)]"
                : "text-[#C8A882] hover:bg-[rgba(255,183,3,0.08)] hover:text-[#F5DEB3]"
            }`
      }
    >
      <span className={skin === "trail" ? "opacity-90" : `${active ? "opacity-100" : "opacity-75"}`}>
        <ChildNavIcon name={iconName} active={active} size={compact ? 34 : 42} />
      </span>
      {label}
    </Link>
  );
}

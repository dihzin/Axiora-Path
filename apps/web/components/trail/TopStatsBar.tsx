"use client";

import type { ReactNode } from "react";
import { Bell, CircleHelp, Coins, UserCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { FlameIcon } from "@/components/ui/icons/FlameIcon";
import { GemIcon } from "@/components/ui/icons/GemIcon";
import { StarIcon } from "@/components/ui/icons/StarIcon";

type TopStatsBarProps = {
  streak: number;
  gems: number;
  xp: number;
  xpTotal?: number;
  variant?: "compact" | "global";
  className?: string;
  action?: ReactNode;
};

export function TopStatsBar({ streak, gems, xp, xpTotal = 0, variant = "compact", className, action }: TopStatsBarProps) {
  const safeXp = Math.max(0, Math.min(100, xp));
  const safeGems = Math.max(0, Math.floor(gems));
  const safeXpTotal = Math.max(0, Math.floor(xpTotal));
  const coinsApprox = Math.max(0, safeGems * 2);
  const formatInt = (value: number) => new Intl.NumberFormat("pt-BR").format(value);

  if (variant === "global") {
    return (
      <div
        className={cn(
          "relative z-30 mx-auto flex h-[52px] w-full items-center justify-between gap-3 rounded-[14px] border border-[#78BFE3]/20 bg-[linear-gradient(180deg,rgba(17,56,82,0.92),rgba(14,42,64,0.92))] px-3.5 shadow-[0_8px_18px_rgba(2,10,20,0.28),inset_0_1px_0_rgba(255,255,255,0.12)]",
          className,
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <HudPill
            icon={<span className="text-[12px] text-slate-200">🕒</span>}
            value={`${Math.max(0, Math.floor(streak))}`}
            label="dias"
            className="min-w-[96px] justify-center"
          />
          <HudPill
            icon={<span className="text-[12px] text-amber-200">⚡</span>}
            value={`${safeXp}%`}
            label="xp"
            className="min-w-[82px] justify-center"
          />
        </div>
        <div className="flex min-w-0 items-center gap-1.5">
          <HudPill icon={<GemIcon className="h-4 w-4 text-fuchsia-300" />} value={formatInt(safeGems)} className="min-w-[94px] justify-center" />
          <HudPill icon={<Coins className="h-4 w-4 text-amber-300" />} value={formatInt(coinsApprox)} className="min-w-[108px] justify-center" />
          <HudPill icon={<StarIcon className="h-4 w-4 text-yellow-300" />} value={formatInt(safeXpTotal)} className="min-w-[102px] justify-center" />
          <IconPill icon={<Bell className="h-3.5 w-3.5" />} alert />
          <IconPill icon={<CircleHelp className="h-3.5 w-3.5" />} />
          <IconPill icon={<UserCircle2 className="h-4 w-4" />} />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative z-20 mx-auto flex w-full items-center justify-between gap-2",
        className,
      )}
    >
      <div className="flex h-11 flex-wrap items-center gap-2 rounded-[20px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,39,58,0.8),rgba(15,30,44,0.76))] px-2 py-1.5 shadow-[0_10px_24px_rgba(3,10,22,0.26),inset_0_1px_0_rgba(255,255,255,0.08)]">
        <StatItem
          label="dias"
          value={Math.max(0, Math.floor(streak))}
          icon={<FlameIcon className="h-[18px] w-[18px] text-orange-400/90" />}
        />
        <StatItem
          label="gemas"
          value={Math.max(0, Math.floor(gems))}
          icon={<StarIcon className="h-[18px] w-[18px] text-amber-300/90" />}
        />
        <StatItem
          label="xp"
          value={`${safeXp}%`}
          icon={<span className="text-[13px] font-semibold leading-none text-slate-100/90">%</span>}
        />
      </div>
      {action}
    </div>
  );
}

function HudPill({ icon, value, label, className }: { icon: ReactNode; value: string; label?: string; className?: string }) {
  return (
    <div
      className={cn(
        "inline-flex h-[34px] items-center gap-1.5 rounded-full border border-[#8EC7E6]/18 bg-[#0D2B44]/88 px-3.5 text-[13px] font-bold leading-none text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
        className,
      )}
    >
      {icon}
      <span>{value}</span>
      {label ? <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-300/80">{label}</span> : null}
    </div>
  );
}

function IconPill({ icon, alert = false }: { icon: ReactNode; alert?: boolean }) {
  return (
    <div className="relative inline-flex h-[34px] w-[34px] items-center justify-center rounded-full border border-[#8EC7E6]/18 bg-[#0D2B44]/88 text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
      {icon}
      {alert ? <span className="absolute right-[6px] top-[6px] h-2 w-2 rounded-full bg-red-500" /> : null}
    </div>
  );
}

function StatItem({
  icon,
  value,
  label,
  valueClassName,
}: {
  icon: ReactNode;
  value: string | number;
  label: string;
  valueClassName?: string;
}) {
  return (
    <div
      className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-[#10243A]/80 px-3 py-1.5 leading-none shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
      aria-label={label}
    >
      {icon}
      <div className="inline-flex items-baseline gap-1">
        <span className={cn("text-[15px] font-bold leading-none text-slate-50", valueClassName)}>{value}</span>
        <span className="text-[10px] font-semibold uppercase leading-none tracking-[0.08em] text-slate-300/75">{label}</span>
      </div>
    </div>
  );
}

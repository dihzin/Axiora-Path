"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { FlameIcon } from "@/components/ui/icons/FlameIcon";
import { StarIcon } from "@/components/ui/icons/StarIcon";

type TopStatsBarProps = {
  streak: number;
  gems: number;
  xp: number;
  className?: string;
  action?: ReactNode;
};

export function TopStatsBar({ streak, gems, xp, className, action }: TopStatsBarProps) {
  const safeXp = Math.max(0, Math.min(100, xp));

  return (
    <div
      className={cn(
        "relative z-20 mx-auto flex w-full items-center justify-between gap-2",
        className,
      )}
    >
      <div className="flex h-10 items-center gap-6 rounded-[20px] border border-white/8 bg-[linear-gradient(180deg,rgba(12,22,46,0.82),rgba(10,18,38,0.72))] px-4 py-1.5 shadow-[0_10px_24px_rgba(2,12,35,0.18),inset_0_1px_0_rgba(255,255,255,0.05)]">
        <StatItem
          label="streak"
          value={Math.max(0, Math.floor(streak))}
          icon={<FlameIcon className="h-[18px] w-[18px] text-orange-400/90" />}
        />
        <StatItem
          label="pontos"
          value={Math.max(0, Math.floor(gems))}
          icon={<StarIcon className="h-[18px] w-[18px] text-amber-300/90" />}
        />
        <StatItem
          label="progresso"
          value={`${safeXp}%`}
          icon={<span className="text-[13px] font-semibold leading-none text-slate-100/90">%</span>}
        />
      </div>
      {action}
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
    <div className="inline-flex items-center gap-1.5 rounded-full px-1 leading-none" aria-label={label}>
      {icon}
      <div className="inline-flex items-baseline gap-1">
        <span className={cn("text-[15px] font-bold leading-none text-slate-50", valueClassName)}>{value}</span>
        <span className="text-[11px] font-semibold uppercase leading-none tracking-[0.04em] text-slate-300/70">{label}</span>
      </div>
    </div>
  );
}

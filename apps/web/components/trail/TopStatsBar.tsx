"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { FlameIcon } from "@/components/ui/icons/FlameIcon";
import { GemIcon } from "@/components/ui/icons/GemIcon";
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
        "relative z-20 mx-auto flex w-full max-w-sm items-center justify-between gap-1.5 px-0.5 py-0.5",
        className,
      )}
    >
      <StatItem
        label="streak"
        value={Math.max(0, Math.floor(streak))}
        valueClassName="text-[#FF6B3D]"
        icon={<FlameIcon className="h-5 w-5 text-[#2B2F42]" />}
      />
      <StatItem
        label="gemas"
        value={Math.max(0, Math.floor(gems))}
        valueClassName="text-[#2B2F42]"
        icon={<GemIcon className="h-5 w-5 text-[#2B2F42]" />}
      />
      <StatItem
        label="progresso"
        value={`${safeXp}%`}
        valueClassName="text-[#FF6B3D]"
        icon={<StarIcon className="h-5 w-5 text-[#2B2F42]" />}
      />
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
    <div
      className="inline-flex h-8 items-center gap-1.5 rounded-[12px] px-2 text-[#2B2F42] transition duration-[180ms] [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.02] hover:bg-[#FF8A63]/12"
      aria-label={label}
    >
      {icon}
      <span className={cn("text-[15px] font-black leading-none text-[#2B2F42]", valueClassName)}>{value}</span>
    </div>
  );
}

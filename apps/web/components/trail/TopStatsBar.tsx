"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { BellDot, Coins, HelpCircle, UserRound, Zap } from "lucide-react";
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
  const router = useRouter();
  const safeXp = Math.max(0, Math.min(100, xp));
  const safeGems = Math.max(0, Math.floor(gems));
  const safeXpTotal = Math.max(0, Math.floor(xpTotal));
  const formatInt = (value: number) => new Intl.NumberFormat("pt-BR").format(value);

  if (variant === "global") {
    return (
      <div
        className={cn(
          "relative z-30 mx-auto flex h-[52px] w-full items-center justify-between gap-3 rounded-[14px] border border-[#78BFE3]/20 bg-[linear-gradient(180deg,rgba(17,56,82,0.94),rgba(14,42,64,0.94))] px-3.5 shadow-[0_8px_24px_rgba(2,10,20,0.32),inset_0_1px_0_rgba(255,255,255,0.14)]",
          className,
        )}
      >
        {/* Left: activity stats */}
        <div className="flex min-w-0 items-center gap-2">
          <HudPill
            icon={<FlameIcon className="h-4 w-4 text-orange-400" />}
            value={`${Math.max(0, Math.floor(streak))}`}
            label="dias"
            className="min-w-[96px] justify-center"
          />
          <HudPill
            icon={<Zap className="h-4 w-4 text-amber-300" strokeWidth={2.2} />}
            value={`${safeXp}%`}
            label="nível"
            className="min-w-[82px] justify-center"
          />
        </div>

        {/* Right: economy + actions */}
        <div className="flex min-w-0 items-center gap-1.5">
          <HudPill icon={<GemIcon className="h-4 w-4 text-fuchsia-300" />} value={formatInt(safeGems)} className="min-w-[88px] justify-center" />
          <HudPill icon={<Coins className="h-4 w-4 text-amber-300" strokeWidth={2} />} value={formatInt(safeGems)} className="min-w-[88px] justify-center" />
          <HudPill icon={<StarIcon className="h-4 w-4 text-yellow-300" />} value={formatInt(safeXpTotal)} label="xp" className="min-w-[102px] justify-center" />

          <ActionPill
            icon={<BellDot className="h-4 w-4" strokeWidth={1.8} />}
            label="Notificações"
            alert
            onClick={() => router.push("/child/notifications")}
          />
          <ActionPill
            icon={<HelpCircle className="h-4 w-4" strokeWidth={1.8} />}
            label="Ajuda"
            onClick={() => router.push("/child/help")}
          />
          <ActionPill
            icon={<UserRound className="h-[18px] w-[18px]" strokeWidth={1.8} />}
            label="Perfil"
            onClick={() => router.push("/child/profile")}
            highlight
          />
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
          icon={<GemIcon className="h-[18px] w-[18px] text-fuchsia-300/90" />}
        />
        <StatItem
          label="xp"
          value={`${safeXp}%`}
          icon={<Zap className="h-[16px] w-[16px] text-amber-300/90" strokeWidth={2.2} />}
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

function ActionPill({
  icon,
  label,
  alert = false,
  highlight = false,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  alert?: boolean;
  highlight?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "relative inline-flex h-[34px] w-[34px] items-center justify-center rounded-full border transition-all duration-150",
        highlight
          ? "border-[#78BFE3]/35 bg-[linear-gradient(135deg,rgba(30,80,120,0.9),rgba(15,50,80,0.9))] text-sky-200 shadow-[0_0_12px_rgba(120,191,227,0.18),inset_0_1px_0_rgba(255,255,255,0.12)] hover:border-[#78BFE3]/55 hover:shadow-[0_0_18px_rgba(120,191,227,0.28)]"
          : "border-[#8EC7E6]/18 bg-[#0D2B44]/88 text-slate-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] hover:border-[#8EC7E6]/35 hover:bg-[#0D3558]/90 hover:text-slate-100",
      )}
    >
      {icon}
      {alert ? (
        <span
          aria-hidden
          className="absolute right-[7px] top-[7px] h-[7px] w-[7px] rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)] ring-1 ring-[#0D2B44]"
        />
      ) : null}
    </button>
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

"use client";

import { cn } from "@/lib/utils";
import { ParchmentCard } from "@/components/ui/ParchmentCard";

type WeeklyGoalCardProps = {
  completed: number;
  target: number;
  weekLabel: string;
  className?: string;
  compact?: boolean;
};

export function WeeklyGoalCard({ completed, target, weekLabel, className, compact = false }: WeeklyGoalCardProps) {
  const safeTarget    = Math.max(1, target);
  const safeCompleted = Math.max(0, Math.min(safeTarget, completed));
  const remaining     = Math.max(0, safeTarget - safeCompleted);
  const percent       = Math.round((safeCompleted / safeTarget) * 100);
  const statusText    =
    remaining === 0
      ? "Você concluiu tudo esta semana!"
      : `Faltam ${remaining} miss${remaining === 1 ? "ão" : "ões"} esta semana!`;

  return (
    <ParchmentCard
      as="section"
      variant="glass"
      className={cn("medieval-hover", compact ? "p-3" : "p-4", className)}
    >
      {/* Extra ambient glow — gold halo from the left */}
      <div aria-hidden className="pointer-events-none absolute -left-4 top-1/2 h-24 w-24 -translate-y-1/2 rounded-full bg-[#FFB703]/10 blur-2xl" />

      <div className={cn("relative z-10 flex items-center", compact ? "gap-3" : "gap-4")}>
        {/* Trophy icon — wood-framed */}
        <div
          className={cn(
            "flex shrink-0 items-center justify-center rounded-[16px] border-2 border-[#A07850]/60 bg-[linear-gradient(145deg,rgba(253,245,230,0.8),rgba(240,210,155,0.6))] shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_0_14px_rgba(255,183,3,0.18)]",
            compact ? "h-12 w-12 text-[22px]" : "h-14 w-14 text-[26px]",
          )}
        >
          <span aria-hidden role="img">🏆</span>
        </div>

        <div className="min-w-0 flex-1">
          <p className={cn("font-bold leading-tight tracking-[-0.01em]", compact ? "text-[15px]" : "text-[17px]")} style={{ color: "#2C1E16" }}>{statusText}</p>
        </div>
      </div>

      <div className={cn("relative z-10", compact ? "mt-3" : "mt-4")}>
        {/* Progress bar — parchment trough, gold fill */}
        <div className="h-2.5 overflow-hidden rounded-full border-2 border-[#A07850]/50 bg-[linear-gradient(180deg,rgba(220,200,168,0.9)_0%,rgba(200,175,138,0.9)_100%)] shadow-[inset_0_1px_3px_rgba(44,30,18,0.14)]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#FFB703] via-[#FB8C00] to-[#D96C2A] shadow-[0_0_10px_rgba(255,183,3,0.5)] transition-[width] duration-700 ease-out"
            style={{ width: `${percent}%`, minWidth: safeCompleted > 0 ? "6px" : undefined }}
          />
        </div>
        <div className={cn("flex items-center justify-between", compact ? "mt-2" : "mt-3")}>
          <div className="flex items-center gap-2">
          {Array.from({ length: safeTarget }).map((_, index) => {
            const filled = index < safeCompleted;
            return (
              <span
                key={`${weekLabel}-${index}`}
                className={cn(
                  "rounded-full border-2 transition-all duration-300",
                  compact ? "h-2.5 w-2.5" : "h-3 w-3",
                  filled
                    ? "border-[#A07850]/60 bg-[#FFB703] shadow-[0_0_8px_rgba(255,183,3,0.55)]"
                    : "border-[#A07850]/30 bg-[rgba(160,120,80,0.12)]",
                )}
              />
            );
          })}
          </div>
          <span className="text-[11px] font-bold tabular-nums" style={{ color: "#8B5E1A" }}>
            {safeCompleted}/{safeTarget}
          </span>
        </div>
      </div>
    </ParchmentCard>
  );
}

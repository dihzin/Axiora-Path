"use client";

import { cn } from "@/lib/utils";

type WeeklyGoalCardProps = {
  completed: number;
  target: number;
  weekLabel: string;
  className?: string;
  compact?: boolean;
};

export function WeeklyGoalCard({ completed, target, weekLabel, className, compact = false }: WeeklyGoalCardProps) {
  const safeTarget = Math.max(1, target);
  const safeCompleted = Math.max(0, Math.min(safeTarget, completed));
  const remaining = Math.max(0, safeTarget - safeCompleted);
  const percent = Math.round((safeCompleted / safeTarget) * 100);
  const statusText =
    remaining === 0 ? "Você concluiu tudo esta semana!" : `Faltam ${remaining} miss${remaining === 1 ? "ão" : "ões"} esta semana!`;

  return (
    <section
      className={cn(
        "axiora-hover-magic relative overflow-hidden rounded-[26px] border border-amber-200/12 bg-[linear-gradient(145deg,rgba(24,24,52,0.9),rgba(16,20,44,0.82))] p-4 shadow-[0_14px_34px_rgba(2,8,28,0.26),inset_0_1px_0_rgba(255,255,255,0.08)] transition-all duration-500 hover:shadow-[0_18px_40px_rgba(2,8,28,0.34)]",
        compact && "p-3.5",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 rounded-[26px] bg-gradient-to-b from-white/5 via-white/[0.03] to-transparent" />
      <div className="pointer-events-none absolute -left-4 top-1/2 h-24 w-24 -translate-y-1/2 rounded-full bg-amber-300/12 blur-2xl" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-[linear-gradient(180deg,rgba(250,204,21,0.08),rgba(250,204,21,0))]" />
      <div className={cn("relative z-10 flex items-center", compact ? "gap-3" : "gap-4")}>
        <div className={cn("flex shrink-0 items-center justify-center rounded-[18px] border border-amber-300/20 bg-[linear-gradient(145deg,rgba(250,204,21,0.18),rgba(56,189,248,0.12))] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]", compact ? "h-12 w-12 text-[22px]" : "h-14 w-14 text-[26px]")}>
          ✦
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/70">Meta da semana</p>
            <div className="rounded-full border border-amber-200/25 bg-amber-300/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-amber-50/90">
              {weekLabel}
            </div>
          </div>
          <p className={cn("mt-1 font-semibold leading-tight tracking-[-0.01em] text-white", compact ? "text-[15px]" : "text-[17px]")}>{statusText}</p>
          <p className="mt-1 text-[12px] font-medium text-white/78">
            {safeCompleted} de {safeTarget} concluídas
          </p>
        </div>
      </div>

      <div className={cn("relative z-10", compact ? "mt-3" : "mt-4")}>
        <div className="mb-2 flex items-center justify-between text-[12px] font-semibold text-white">
          <span className="text-[11px] uppercase tracking-[0.1em] text-white/70">Barra de conquista</span>
          <span className="rounded-full border border-sky-300/35 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-100">{percent}%</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full border border-[#9CC8F2]/45 bg-[linear-gradient(180deg,rgba(227,236,247,0.92)_0%,rgba(217,229,242,0.92)_100%)] shadow-[inset_0_1px_3px_rgba(40,58,88,0.12)]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-sky-400 to-blue-500 transition-transform transition-shadow transition-opacity duration-700 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="mt-3 flex items-center gap-2">
          {Array.from({ length: safeTarget }).map((_, index) => {
            const filled = index < safeCompleted;
            return (
              <span
                key={`${weekLabel}-${index}`}
                className={cn(
                  "h-3 w-3 rounded-full border transition-all duration-300",
                  filled
                    ? "border-amber-200/60 bg-amber-300 shadow-[0_0_10px_rgba(252,211,77,0.55)]"
                    : "border-white/20 bg-white/10",
                )}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}


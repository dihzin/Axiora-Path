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
        "axiora-hover-magic relative overflow-hidden rounded-[26px] border border-white/12 bg-[linear-gradient(155deg,rgba(24,49,43,0.9)_0%,rgba(28,64,56,0.82)_54%,rgba(20,42,38,0.9)_100%)] p-4 shadow-[0_16px_40px_rgba(7,20,17,0.28),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-[2px] transition-all duration-500 hover:shadow-[0_22px_46px_rgba(7,20,17,0.36)]",
        compact && "p-3",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 rounded-[26px] bg-gradient-to-b from-white/5 via-white/[0.03] to-transparent" />
      <div className="pointer-events-none absolute -left-4 top-1/2 h-24 w-24 -translate-y-1/2 rounded-full bg-[#F1C56B]/12 blur-2xl" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-[linear-gradient(180deg,rgba(255,176,122,0.08),rgba(255,176,122,0))]" />
      <div className={cn("relative z-10 flex items-center", compact ? "gap-3" : "gap-4")}>
        <div className={cn("flex shrink-0 items-center justify-center rounded-[18px] border border-[#F1C56B]/25 bg-[linear-gradient(145deg,rgba(241,197,107,0.22),rgba(255,154,72,0.14))] shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_0_16px_rgba(241,197,107,0.14)]", compact ? "h-12 w-12 text-[22px]" : "h-14 w-14 text-[26px]")}>
          <span aria-hidden role="img">🏆</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: "rgba(255,180,100,0.82)" }}>✦ Meta da semana</p>
            <div className="rounded-full border border-amber-200/25 bg-amber-300/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-amber-50/90">
              {weekLabel}
            </div>
          </div>
          <p className={cn("mt-1 font-bold leading-tight tracking-[-0.01em] text-white", compact ? "text-[15px]" : "text-[17px]")}>{statusText}</p>
          <p className="mt-1 text-[12px] font-medium text-white/78">
            {safeCompleted} de {safeTarget} concluídas
          </p>
        </div>
      </div>

      <div className={cn("relative z-10", compact ? "mt-3" : "mt-4")}>
        <div className="mb-2 flex items-center justify-between text-[12px] font-semibold text-white">
          <span className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: "rgba(255,180,100,0.75)" }}>Barra de conquista</span>
          <span className="rounded-full border border-[#F1C56B]/35 bg-[#FF9A48]/10 px-2 py-0.5 text-[10px] font-semibold text-[#FFE7D1]">{percent}%</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full border border-[#E6D8C6]/45 bg-[linear-gradient(180deg,rgba(244,238,229,0.92)_0%,rgba(234,225,214,0.92)_100%)] shadow-[inset_0_1px_3px_rgba(58,67,62,0.12)]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#F1C56B] via-[#FF9A48] to-[#D96C2A] transition-transform transition-shadow transition-opacity duration-700 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
        {!compact && (
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
        )}
      </div>
    </section>
  );
}


"use client";

import { cn } from "@/lib/utils";

type WeeklyGoalCardProps = {
  completed: number;
  target: number;
  weekLabel: string;
  className?: string;
};

export function WeeklyGoalCard({ completed, target, weekLabel, className }: WeeklyGoalCardProps) {
  const safeTarget = Math.max(1, target);
  const safeCompleted = Math.max(0, Math.min(safeTarget, completed));
  const remaining = Math.max(0, safeTarget - safeCompleted);
  const percent = Math.round((safeCompleted / safeTarget) * 100);
  const statusText =
    remaining === 0 ? "Você concluiu tudo esta semana!" : `Faltam ${remaining} miss${remaining === 1 ? "ão" : "ões"} esta semana!`;

  return (
    <section
      className={cn(
        "axiora-hover-magic relative overflow-hidden rounded-2xl border border-white/14 bg-[linear-gradient(160deg,rgba(15,23,42,0.86)_0%,rgba(12,25,54,0.82)_55%,rgba(10,19,46,0.92)_100%)] p-4 backdrop-blur-xl shadow-[0_10px_28px_rgba(2,12,35,0.32),inset_0_1px_0_rgba(255,255,255,0.08)] transition-all duration-500 hover:shadow-[0_14px_36px_rgba(2,12,35,0.42)]",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b from-white/5 via-white/[0.03] to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-[radial-gradient(70%_90%_at_50%_0%,rgba(56,189,248,0.16),transparent_65%)]" />
      <div className="relative z-10 flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/75">Meta da semana</p>
          <p className="mt-1 text-[18px] font-semibold leading-tight tracking-[-0.01em] text-white">{
            statusText
          }</p>
          <p className="mt-1 text-[12px] font-medium text-white/80">
            Você já concluiu {safeCompleted} de {safeTarget}.
          </p>
        </div>
        <div className="rounded-full border border-sky-300/30 bg-sky-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-100">
          {weekLabel}
        </div>
      </div>

      <div className="relative z-10 mt-2.5">
        <div className="mb-1.5 flex items-center justify-between text-[12px] font-semibold text-white">
          <span className="text-[11px] uppercase tracking-[0.1em] text-white/70">Progresso da semana</span>
          <span className="rounded-full border border-sky-300/35 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-100">{percent}%</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full border border-[#9CC8F2]/45 bg-[linear-gradient(180deg,rgba(227,236,247,0.92)_0%,rgba(217,229,242,0.92)_100%)] shadow-[inset_0_1px_3px_rgba(40,58,88,0.12)]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-sky-400 to-blue-500 transition-transform transition-shadow transition-opacity duration-700 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    </section>
  );
}


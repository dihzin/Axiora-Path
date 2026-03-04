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
        "axiora-hover-magic relative overflow-hidden rounded-2xl border border-white/10 bg-[rgba(15,23,42,0.85)] bg-gradient-to-b from-white/10 to-white/5 p-4 backdrop-blur-xl shadow-[0_0_30px_rgba(56,189,248,0.1)] transition-all duration-500 hover:shadow-[0_0_30px_rgba(56,189,248,0.25)]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.09em] text-white">Meta da semana</p>
          <p className="mt-1 text-[21px] font-semibold leading-tight text-white">{
            statusText
          }</p>
          <p className="mt-1 text-[13px] font-medium text-white/80">
            Você já concluiu {safeCompleted} de {safeTarget}.
          </p>
        </div>
        <div className="rounded-full bg-[#DFE6F1] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.06em] text-[#2B2F42]">
          {weekLabel}
        </div>
      </div>

      <div className="mt-2.5">
        <div className="mb-1.5 flex items-center justify-between text-[12px] font-semibold text-white">
          <span>Progresso da semana</span>
          <span className="rounded-full bg-[#DFE6F1] px-2 py-0.5 text-[11px] text-[#2B2F42]">{percent}%</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full border border-[#CDD9E9] bg-[linear-gradient(180deg,#DEE7F3_0%,#D7E1EF_100%)] shadow-[inset_0_1px_3px_rgba(40,58,88,0.12)]">
          <div
            className="h-full rounded-full bg-[linear-gradient(120deg,#3E73AF_0%,#5D8DC2_100%)] transition-transform transition-shadow transition-opacity duration-700 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    </section>
  );
}


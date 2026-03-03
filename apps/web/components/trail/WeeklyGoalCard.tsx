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
        "axiora-hover-magic relative overflow-hidden rounded-[28px] bg-[linear-gradient(180deg,#FFFDFC_0%,#FFF6F2_100%)] p-4 shadow-[var(--axiora-shadow-sm)]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.08em] text-[#5C5C5C]">Meta da semana</p>
          <p className="mt-1 text-[28px] font-black leading-tight text-[#1E1E1E]">{statusText}</p>
          <p className="mt-1 text-[13px] font-semibold text-[#5C5C5C]">
            Você já concluiu {safeCompleted} de {safeTarget}.
          </p>
        </div>
        <div className="rounded-full bg-[#FFEDE5] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.06em] text-[#2B2F42]">
          {weekLabel}
        </div>
      </div>

      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between text-[12px] font-black text-[#5C5C5C]">
          <span>Progresso da semana</span>
          <span className="rounded-full bg-[#FFEDE5] px-2 py-0.5 text-[11px] text-[#2B2F42]">{percent}%</span>
        </div>
        <div className="h-4 overflow-hidden rounded-full bg-[#FFE6DB] shadow-[inset_0_2px_5px_rgba(104,81,71,0.12)]">
          <div
            className="h-full rounded-full bg-[linear-gradient(135deg,#FF6B3D_0%,#FF8A63_100%)] transition-transform transition-shadow transition-opacity duration-700 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    </section>
  );
}


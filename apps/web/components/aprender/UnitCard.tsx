"use client";

import { BookText, CheckCircle2 } from "lucide-react";

import { ProgressBar } from "@/components/ui/progress-bar";

type UnitCardProps = {
  sectionOrder?: number;
  order: number;
  title: string;
  completionRate: number;
  completedLessons: number;
  totalLessons: number;
  active?: boolean;
};

export function UnitCard({ sectionOrder, order, title, completionRate, completedLessons, totalLessons, active = false }: UnitCardProps) {
  const safeProgress = Math.max(0, Math.min(100, Math.round(completionRate * 100)));

  return (
    <article
      className="overflow-hidden rounded-[var(--path-radius-card)] border border-[#0BA590] bg-[color:var(--path-secondary)] text-white shadow-[var(--path-shadow-1)]"
      aria-label={`Unidade ${title}`}
    >
      <div className="grid min-h-[76px] grid-cols-[1fr_auto]">
        <div className="px-[var(--path-space-3)] pb-[var(--path-space-2)] pt-[var(--path-space-2)]">
          <p className="text-xs font-black uppercase tracking-[0.06em] text-white/80">
            {sectionOrder ? `Seção ${sectionOrder}, ` : ""}Unidade {order}
          </p>
          <h2 className="mt-0.5 break-words text-[1.75rem] font-black leading-none">{title}</h2>
        </div>
        <div className="flex w-16 items-center justify-center border-l border-[#099381] bg-[#11BAA3]">
          <BookText className="h-6 w-6" aria-hidden />
        </div>
      </div>
      <div className="space-y-1 bg-[#10B198] px-[var(--path-space-3)] pb-[var(--path-space-2)] pt-0.5">
        <ProgressBar value={safeProgress} tone="secondary" className="h-1.5 border-white/25 bg-white/20" barClassName="duo-progress__bar--secondary" />
        <p className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
          {completedLessons}/{totalLessons}
          <span className="sr-only">{active ? "Unidade atual" : "Unidade"}</span>
        </p>
      </div>
    </article>
  );
}

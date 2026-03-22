"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type PulseSectionProps = {
  stats: {
    logsTodayCount: number;
    missionProgressPercent: number;
    todayStatusCounts: { approved: number; pending: number; rejected: number };
    activeGoalTitle: string;
    activeGoalTargetLabel: string;
  };
};

export function PulseSection({ stats }: PulseSectionProps) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={cn(
        "rounded-xl border bg-white/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_3px_16px_rgba(0,0,0,0.05)]",
        "backdrop-blur transition-[border-color,transform,box-shadow,background-color] duration-200",
        open
          ? "border-white/55"
          : "border-white/45 hover:-translate-y-px hover:border-white/60 hover:bg-white/65 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.90),0_5px_20px_rgba(0,0,0,0.07)]",
      )}
    >
      <button
        type="button"
        className="flex w-full cursor-pointer items-center justify-between gap-2 px-3.5 py-2.5 transition-opacity duration-150 hover:opacity-80"
        onClick={() => setOpen((prev) => !prev)}
      >
        <div className="flex items-center gap-2">
          <p className="axiora-subtitle text-[11px] font-black uppercase tracking-[0.08em] opacity-50">
            Pulso da semana
          </p>
          {!open && (
            <span className="axiora-subtitle text-[11px] opacity-50 transition-opacity duration-300">
              {stats.logsTodayCount} ação{stats.logsTodayCount !== 1 ? "ões" : ""} hoje
            </span>
          )}
        </div>
        <ChevronDown
          className="h-3.5 w-3.5 opacity-40 transition-transform duration-200"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        />
      </button>

      {open ? (
        <div className="space-y-2 px-3.5 pb-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-[rgba(148,163,184,0.10)] px-3 py-2 transition-[background-color] duration-150 hover:bg-[rgba(148,163,184,0.15)]">
              <p className="axiora-subtitle text-[10px] opacity-55 uppercase tracking-[0.08em]">Ações hoje</p>
              <p className="axiora-title mt-0.5 text-lg font-extrabold">{stats.logsTodayCount}</p>
            </div>
            <div className="rounded-xl bg-[rgba(148,163,184,0.10)] px-3 py-2 transition-[background-color] duration-150 hover:bg-[rgba(148,163,184,0.15)]">
              <p className="axiora-subtitle text-[10px] opacity-55 uppercase tracking-[0.08em]">Missão</p>
              <p className="axiora-title mt-0.5 text-lg font-extrabold">{stats.missionProgressPercent}%</p>
            </div>
          </div>

          <div className="rounded-xl bg-[rgba(148,163,184,0.10)] px-3 py-2">
            <p className="axiora-subtitle text-[10px] opacity-55 uppercase tracking-[0.08em] mb-1.5">Tarefas</p>
            <div className="grid grid-cols-3 gap-1 text-center">
              <div>
                <p className="axiora-title text-sm font-extrabold text-[#0E8F62]">{stats.todayStatusCounts.approved}</p>
                <p className="axiora-subtitle text-[10px] opacity-50">Aprovadas</p>
              </div>
              <div>
                <p className="axiora-title text-sm font-extrabold text-[#B87400]">{stats.todayStatusCounts.pending}</p>
                <p className="axiora-subtitle text-[10px] opacity-50">Pendentes</p>
              </div>
              <div>
                <p className="axiora-title text-sm font-extrabold text-[#B23B3B]">{stats.todayStatusCounts.rejected}</p>
                <p className="axiora-subtitle text-[10px] opacity-50">Rejeitadas</p>
              </div>
            </div>
          </div>

          {stats.activeGoalTitle !== "Definir objetivo" && (
            <div className="rounded-xl bg-[rgba(148,163,184,0.10)] px-3 py-2">
              <p className="axiora-subtitle text-[10px] opacity-55 uppercase tracking-[0.08em]">Meta</p>
              <p className="axiora-title mt-0.5 text-sm font-extrabold">{stats.activeGoalTitle}</p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

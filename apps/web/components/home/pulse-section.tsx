"use client";

import { useEffect, useState } from "react";
import { BarChart2, X } from "lucide-react";
import { createPortal } from "react-dom";

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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fechar com Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <>
      {/* Card compacto sempre visível */}
      <button
        type="button"
        aria-label="Ver detalhes do pulso da semana"
        onClick={() => setOpen(true)}
        className="w-full cursor-pointer rounded-xl border border-white/45 bg-white/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_3px_16px_rgba(0,0,0,0.05)] backdrop-blur transition-[border-color,transform,box-shadow,background-color] duration-200 hover:-translate-y-px hover:border-white/60 hover:bg-white/65 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.90),0_5px_20px_rgba(0,0,0,0.07)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A2F] focus-visible:ring-offset-2"
      >
        <div className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="axiora-subtitle text-[11px] font-black uppercase tracking-[0.08em] opacity-50">
              Pulso da semana
            </p>
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-lg bg-[rgba(148,163,184,0.12)] px-2 py-0.5">
                <span className="axiora-title text-[12px] font-extrabold">{stats.logsTodayCount}</span>
                <span className="axiora-subtitle text-[10px] opacity-55">ações</span>
              </span>
              <span className="inline-flex items-center gap-1 rounded-lg bg-[rgba(148,163,184,0.12)] px-2 py-0.5">
                <span className="axiora-title text-[12px] font-extrabold">{stats.missionProgressPercent}%</span>
                <span className="axiora-subtitle text-[10px] opacity-55">missão</span>
              </span>
            </div>
          </div>
          <span
            aria-hidden
            className="axiora-subtitle inline-flex shrink-0 items-center gap-1 rounded-lg bg-[rgba(148,163,184,0.12)] px-2.5 py-1 text-[11px] font-semibold opacity-55"
          >
            <BarChart2 className="h-3.5 w-3.5" />
            Ver
          </span>
        </div>
      </button>

      {/* Modal com backdrop blur */}
      {mounted &&
        open &&
        createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-end justify-center p-4 sm:items-center"
            onClick={(e) => {
              if (e.target === e.currentTarget) setOpen(false);
            }}
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/25 backdrop-blur-sm" />

            {/* Painel */}
            <div className="relative w-full max-w-sm animate-fade-slide-up rounded-2xl border border-white/65 bg-white/85 p-5 shadow-[0_24px_64px_rgba(0,0,0,0.16),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-xl">
              {/* Header */}
              <div className="mb-4 flex items-center justify-between">
                <p className="axiora-subtitle text-[12px] font-black uppercase tracking-[0.08em] opacity-55">
                  Pulso da semana
                </p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Fechar"
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-black/8 opacity-40 transition-opacity hover:opacity-70 focus-visible:outline-none"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-2.5">
                {/* Ações e missão */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-[rgba(148,163,184,0.12)] px-3 py-2.5">
                    <p className="axiora-subtitle text-[10px] uppercase tracking-[0.08em] opacity-55">Ações hoje</p>
                    <p className="axiora-title mt-0.5 text-2xl font-extrabold">{stats.logsTodayCount}</p>
                  </div>
                  <div className="rounded-xl bg-[rgba(148,163,184,0.12)] px-3 py-2.5">
                    <p className="axiora-subtitle text-[10px] uppercase tracking-[0.08em] opacity-55">Missão</p>
                    <p className="axiora-title mt-0.5 text-2xl font-extrabold">{stats.missionProgressPercent}%</p>
                  </div>
                </div>

                {/* Tarefas */}
                <div className="rounded-xl bg-[rgba(148,163,184,0.10)] px-3 py-2.5">
                  <p className="axiora-subtitle mb-2 text-[10px] uppercase tracking-[0.08em] opacity-55">Tarefas</p>
                  <div className="grid grid-cols-3 gap-1 text-center">
                    <div>
                      <p className="axiora-title text-base font-extrabold text-[#0E8F62]">
                        {stats.todayStatusCounts.approved}
                      </p>
                      <p className="axiora-subtitle text-[10px] opacity-50">Aprovadas</p>
                    </div>
                    <div>
                      <p className="axiora-title text-base font-extrabold text-[#B87400]">
                        {stats.todayStatusCounts.pending}
                      </p>
                      <p className="axiora-subtitle text-[10px] opacity-50">Pendentes</p>
                    </div>
                    <div>
                      <p className="axiora-title text-base font-extrabold text-[#B23B3B]">
                        {stats.todayStatusCounts.rejected}
                      </p>
                      <p className="axiora-subtitle text-[10px] opacity-50">Rejeitadas</p>
                    </div>
                  </div>
                </div>

                {/* Meta ativa */}
                {stats.activeGoalTitle !== "Definir objetivo" && (
                  <div className="rounded-xl bg-[rgba(148,163,184,0.10)] px-3 py-2.5">
                    <p className="axiora-subtitle text-[10px] uppercase tracking-[0.08em] opacity-55">Meta ativa</p>
                    <p className="axiora-title mt-0.5 text-sm font-extrabold">{stats.activeGoalTitle}</p>
                    {stats.activeGoalTargetLabel ? (
                      <p className="axiora-subtitle mt-0.5 text-[11px] opacity-45">{stats.activeGoalTargetLabel}</p>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

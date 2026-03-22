"use client";

import { Flame, Lock, Volume2, VolumeX } from "lucide-react";

import { PrimaryAction } from "@/components/primary-action";
import { cn } from "@/lib/utils";
import { useChangePulse } from "@/hooks/use-change-pulse";
import type { HomeNextAction } from "@/hooks/use-home-state";

function formatBRL(valueCents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    valueCents / 100,
  );
}

function getFlameClass(streak: number): string {
  if (streak >= 8) return "flame-strong";
  if (streak >= 4) return "flame-medium";
  return "flame-small";
}

type StatsBadgesProps = {
  stats: {
    level: number;
    xpPercent: number;
    xpPulsing: boolean;
    streak: number;
    balanceCents: number;
    isSchoolTenant: boolean;
  };
  nextStepHint: string;
  nextAction: HomeNextAction;
  soundEnabled: boolean;
  onPrimaryAction: () => void;
  onToggleSound: () => void;
  onParentMode: () => void;
};

export function StatsBadges({
  stats,
  nextStepHint,
  nextAction,
  soundEnabled,
  onPrimaryAction,
  onToggleSound,
  onParentMode,
}: StatsBadgesProps) {
  // Pulse quando saldo muda
  const balancePulse = useChangePulse(stats.balanceCents);

  return (
    <div className="flex flex-col gap-2.5">
      {/* ── CTA Principal — elemento mais chamativo ────────────────────────── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <PrimaryAction
          label={nextAction.label}
          onClick={onPrimaryAction}
          className="w-full sm:min-w-[200px] sm:w-auto"
        />
        {/* Hint de contexto logo ao lado */}
        <p className="axiora-subtitle text-[12px] opacity-60 sm:max-w-[200px]">
          {nextAction.helperText}
        </p>
      </div>

      {/* ── Badges de contexto — light glass com contraste legível ──────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Nível */}
        <div className="inline-flex items-center gap-1.5 rounded-2xl border border-white/55 bg-white/70 px-2.5 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_2px_8px_rgba(0,0,0,0.05)] backdrop-blur-sm transition-[transform,box-shadow] duration-200 hover:-translate-y-px hover:bg-white/80 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_4px_12px_rgba(0,0,0,0.07)]">
          <span className="text-[10px] font-black uppercase tracking-[0.10em] text-[#64748B]">Nível</span>
          <span className="text-[13px] font-extrabold text-[#0F172A]">{stats.level}</span>
        </div>

        {/* XP */}
        <div className="inline-flex items-center gap-1.5 rounded-2xl border border-white/55 bg-white/70 px-2.5 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_2px_8px_rgba(0,0,0,0.05)] backdrop-blur-sm transition-[transform,box-shadow] duration-200 hover:-translate-y-px hover:bg-white/80 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_4px_12px_rgba(0,0,0,0.07)]">
          <span className="text-[10px] font-black uppercase tracking-[0.10em] text-[#64748B]">XP</span>
          <span
            className={cn(
              "text-[13px] font-extrabold text-[#EA580C] transition-[transform,filter] duration-300 ease-out",
              stats.xpPulsing && "scale-[1.12] brightness-110",
            )}
          >
            {stats.xpPercent.toFixed(0)}%
          </span>
        </div>

        {/* Streak */}
        <div className="inline-flex items-center gap-1.5 rounded-2xl border border-white/55 bg-white/70 px-2.5 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_2px_8px_rgba(0,0,0,0.05)] backdrop-blur-sm transition-[transform,box-shadow] duration-200 hover:-translate-y-px hover:bg-white/80 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_4px_12px_rgba(0,0,0,0.07)]">
          <span className="text-[10px] font-black uppercase tracking-[0.10em] text-[#64748B]">Streak</span>
          <span className="inline-flex items-center gap-1 text-[13px] font-extrabold text-[#0F172A]">
            <Flame
              className={cn(
                "h-3.5 w-3.5 text-[#FB923C]",
                !stats.isSchoolTenant && "flame-flicker",
                getFlameClass(stats.streak),
              )}
            />
            {stats.streak}
          </span>
        </div>

        {/* Saldo — pulsa quando balance muda */}
        <div
          className={cn(
            "inline-flex items-center gap-1.5 rounded-2xl border px-2.5 py-1",
            "backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_2px_8px_rgba(0,0,0,0.05)]",
            "transition-[transform,box-shadow,border-color,background-color] duration-300 ease-out",
            "hover:-translate-y-px",
            balancePulse
              ? "border-[rgba(234,88,12,0.30)] bg-[rgba(255,237,213,0.90)] scale-[1.04]"
              : "border-white/55 bg-white/70 hover:bg-white/80",
          )}
        >
          <span className="text-[10px] font-black uppercase tracking-[0.10em] text-[#64748B]">Saldo</span>
          <span className={cn(
            "text-[13px] font-extrabold transition-[color] duration-300",
            balancePulse ? "text-[#C2410C]" : "text-[#0F172A]",
          )}>
            {formatBRL(stats.balanceCents)}
          </span>
        </div>
      </div>

      {/* ── Controles utilitários — fantasma, fora do foco principal ─────────── */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label="Abrir modo pais"
          className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold opacity-45 transition-opacity duration-200 hover:opacity-75 axiora-subtitle focus-visible:outline-none focus-visible:opacity-80"
          onClick={onParentMode}
        >
          <Lock className="h-3 w-3 stroke-[2.6]" />
          Modo pais
        </button>
        <span className="opacity-20 axiora-subtitle text-xs">·</span>
        <button
          type="button"
          aria-label={soundEnabled ? "Desativar som" : "Ativar som"}
          className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold opacity-45 transition-opacity duration-200 hover:opacity-75 axiora-subtitle focus-visible:outline-none focus-visible:opacity-80"
          onClick={onToggleSound}
        >
          {soundEnabled ? <Volume2 className="h-3 w-3" /> : <VolumeX className="h-3 w-3" />}
          {soundEnabled ? "Som ativo" : "Som mudo"}
        </button>
      </div>
    </div>
  );
}

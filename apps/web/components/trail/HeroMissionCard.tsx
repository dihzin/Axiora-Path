"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { axioraMotionClasses } from "@/theme/motion";

type MedalTier = "none" | "bronze" | "silver" | "gold" | "diamond";

type HeroMissionCardProps = {
  subjectName: string;
  areaLabel: string;
  streakDays: number;
  medalTier: MedalTier;
  completionPercent: number;
  xpTotal: number;
  level: number;
  xpPercent: number;
  xpInLevel: number;
  xpToNextLevel: number;
  currentMission?: {
    title: string;
    xp: number;
  } | null;
  encouragementText?: string;
  onContinue?: () => void;
  onStartMission?: () => void;
  className?: string;
};

export function HeroMissionCard(props: HeroMissionCardProps) {
  const {
    subjectName,
    level,
    xpPercent,
    xpInLevel,
    xpToNextLevel,
    currentMission,
    onStartMission,
    className,
  } = props;
  const safeXpPercent = Math.max(0, Math.min(100, Math.round(xpPercent)));
  const safeLevel = Math.max(1, Math.floor(level));
  const safeInLevel = Math.max(0, Math.floor(xpInLevel));
  const safeToNext = Math.max(1, Math.floor(xpToNextLevel));
  const remainingXp = Math.max(0, safeToNext - safeInLevel);
  const nextLevel = safeLevel + 1;
  const missionsToUnlock = Math.max(1, Math.ceil(remainingXp / 30));
  const [xpPulse, setXpPulse] = useState(false);
  const [levelGlow, setLevelGlow] = useState(false);
  const previousXpRef = useRef<string | null>(null);
  const previousLevelRef = useRef<number | null>(null);

  useEffect(() => {
    const signature = `${safeXpPercent}:${safeInLevel}:${safeToNext}`;
    if (previousXpRef.current === null) {
      previousXpRef.current = signature;
      return;
    }
    if (previousXpRef.current !== signature) {
      setXpPulse(false);
      requestAnimationFrame(() => setXpPulse(true));
      previousXpRef.current = signature;
    }
  }, [safeInLevel, safeToNext, safeXpPercent]);

  useEffect(() => {
    if (previousLevelRef.current === null) {
      previousLevelRef.current = safeLevel;
      return;
    }
    if (safeLevel > previousLevelRef.current) {
      setLevelGlow(false);
      requestAnimationFrame(() => setLevelGlow(true));
    }
    previousLevelRef.current = safeLevel;
  }, [safeLevel]);

  return (
    <section
      className={cn(
        `relative z-0 mx-auto w-full max-w-[720px] overflow-hidden rounded-2xl border border-white/14 bg-[linear-gradient(160deg,rgba(15,23,42,0.86)_0%,rgba(12,25,54,0.82)_55%,rgba(10,19,46,0.92)_100%)] p-4 md:p-5 shadow-[0_10px_28px_rgba(2,12,35,0.32),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl transition-all duration-500 will-change-transform hover:-translate-y-[1px] hover:shadow-[0_14px_36px_rgba(2,12,35,0.42)] ${axioraMotionClasses.transition}`,
        levelGlow ? "hero-level-glow" : "",
        className,
      )}
      aria-label="Resumo da missão atual"
      onAnimationEnd={() => {
        if (levelGlow) setLevelGlow(false);
      }}
    >
      <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b from-white/5 via-white/[0.03] to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-[radial-gradient(70%_90%_at_50%_0%,rgba(56,189,248,0.16),transparent_65%)]" />
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-4 left-3 top-4 w-px rounded-full bg-[linear-gradient(180deg,rgba(74,106,146,0)_0%,rgba(74,106,146,0.3)_22%,rgba(74,106,146,0.18)_78%,rgba(74,106,146,0)_100%)]"
      />
      <div className="relative z-10">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="max-w-full">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/75">Trilha ativa</p>
            <h2 className="mt-1 max-w-[94%] text-[20px] font-semibold leading-[1.02] tracking-tight text-white">{subjectName}</h2>
            <p className="mt-2 text-[11px] font-medium text-white/85">Nível {safeLevel} · Explorador Analítico</p>
          </div>
          <span className="rounded-full border border-sky-300/35 bg-sky-500/10 px-2.5 py-1 text-[11px] font-semibold text-sky-100 shadow-[0_0_14px_rgba(56,189,248,0.2)]">
            {safeXpPercent}% progresso
          </span>
        </div>

        <div
          className={cn("relative z-10", xpPulse ? "xp-pulse" : "")}
          onAnimationEnd={() => {
            if (xpPulse) setXpPulse(false);
          }}
        >
          <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/70">Progresso atual</p>
            <span className="text-[11px] font-semibold text-white/90">{safeXpPercent}%</span>
          </div>
          <div className="relative h-2.5 w-full overflow-hidden rounded-full border border-[#9CC8F2]/45 bg-[linear-gradient(180deg,rgba(227,236,247,0.92)_0%,rgba(217,229,242,0.92)_100%)] shadow-[inset_0_1px_3px_rgba(41,58,86,0.12)]">
            <div aria-hidden className="pointer-events-none absolute inset-0 z-10">
              <span className="absolute left-1/4 top-0 h-full w-px bg-[#1F3552]/20" />
              <span className="absolute left-1/2 top-0 h-full w-px bg-[#1F3552]/20" />
              <span className="absolute left-3/4 top-0 h-full w-px bg-[#1F3552]/20" />
            </div>
            <div
              className="relative z-0 h-full rounded-full bg-gradient-to-r from-cyan-300 via-sky-400 to-blue-500 shadow-[0_0_12px_rgba(56,189,248,0.58)] transition-transform transition-shadow transition-opacity duration-[400ms] ease-out"
              style={{ width: `${safeXpPercent}%` }}
            />
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-[1.5fr_1fr] md:items-stretch">
            <div className="rounded-xl border border-white/12 bg-white/[0.03] px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/70">Próximo marco</p>
              <p className="mt-1 text-[13px] font-semibold text-white/90">Nível {nextLevel} · Estruturas Numéricas</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-white/15 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-white/85">
                  Faltam {remainingXp} XP
                </span>
                <span className="rounded-full border border-sky-300/30 bg-sky-500/10 px-2.5 py-1 text-[11px] font-medium text-sky-100">
                  ≈ {missionsToUnlock} missões
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-white/12 bg-[linear-gradient(160deg,rgba(7,29,63,0.48),rgba(10,28,57,0.35))] px-3 py-2.5 shadow-[inset_0_0_0_1px_rgba(125,211,252,0.08)]">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/70">Missão atual</div>
              <div className="mt-1.5 text-[13px] font-semibold text-white">{currentMission?.title ?? "Missão indisponível"}</div>
              <div className="text-[11px] text-white/85">+{currentMission?.xp ?? 0} XP</div>
              <button
                type="button"
                onClick={onStartMission}
                className="mt-2.5 inline-flex w-full items-center justify-center rounded-lg border border-cyan-200/35 bg-[linear-gradient(135deg,rgba(56,189,248,0.92),rgba(37,99,235,0.92))] px-3 py-2 text-[13px] font-semibold text-white shadow-[0_0_16px_rgba(56,189,248,0.42)] transition hover:brightness-110"
              >
                Iniciar missão
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}


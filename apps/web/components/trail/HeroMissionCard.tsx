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
        `relative z-0 mx-auto w-full max-w-[720px] overflow-visible rounded-2xl border border-white/12 bg-[rgba(15,23,42,0.72)] p-6 shadow-[0_10px_28px_rgba(2,12,35,0.32)] backdrop-blur-lg transition-all duration-500 will-change-transform hover:-translate-y-[1px] hover:shadow-[0_12px_32px_rgba(2,12,35,0.36)] ${axioraMotionClasses.transition}`,
        levelGlow ? "hero-level-glow" : "",
        className,
      )}
      aria-label="Resumo da missão atual"
      onAnimationEnd={() => {
        if (levelGlow) setLevelGlow(false);
      }}
    >
      <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b from-white/5 to-transparent" />
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-5 left-4 top-5 w-px rounded-full bg-[linear-gradient(180deg,rgba(74,106,146,0)_0%,rgba(74,106,146,0.32)_22%,rgba(74,106,146,0.2)_78%,rgba(74,106,146,0)_100%)]"
      />
      <div className="relative z-10">
        <div className="relative z-10">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="max-w-full">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-white">Trilha ativa</p>
              <h2 className="mt-1.5 ml-0.5 max-w-[94%] text-[22px] font-semibold leading-[0.96] tracking-tight text-white">{subjectName}</h2>
              <p className="mt-3 text-[11px] font-semibold uppercase tracking-widest text-white">
                Progresso atual
              </p>
              <p className="mt-1 text-[15px] font-medium text-white/85">
                Nível {safeLevel} · Explorador Analítico
              </p>
            </div>
          </div>
        </div>

        <div
          className={cn("relative z-10 mt-7", xpPulse ? "xp-pulse" : "")}
          onAnimationEnd={() => {
            if (xpPulse) setXpPulse(false);
          }}
        >
          <div className="mb-2.5 flex items-center justify-between gap-2 px-1">
            <span className="text-xs font-bold text-transparent">.</span>
            <span className="text-xs font-semibold text-white">{safeXpPercent}%</span>
          </div>
          <div className="relative h-2 w-full overflow-hidden rounded-full border border-[#CBD8E8] bg-[linear-gradient(180deg,#E4EBF5_0%,#DEE7F2_100%)] shadow-[inset_0_1px_3px_rgba(41,58,86,0.12)]">
            <div aria-hidden className="pointer-events-none absolute inset-0 z-10">
              <span className="absolute left-1/4 top-0 h-full w-px bg-[#1F3552]/20" />
              <span className="absolute left-1/2 top-0 h-full w-px bg-[#1F3552]/20" />
              <span className="absolute left-3/4 top-0 h-full w-px bg-[#1F3552]/20" />
            </div>
            <div
              className="relative z-0 h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 shadow-[0_0_10px_rgba(56,189,248,0.5)] transition-transform transition-shadow transition-opacity duration-[400ms] ease-out"
              style={{ width: `${safeXpPercent}%` }}
            />
          </div>
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-widest text-white">
            Próximo marco
          </p>
          <p className="mt-1 text-sm font-medium text-white/80">
            Nível {nextLevel} · Estruturas Numéricas
          </p>
          <p className="mt-2.5 text-sm font-medium text-white/85">
            Faltam {remainingXp} XP
          </p>
          <p className="mt-0.5 text-xs font-medium text-white">
            ≈ {missionsToUnlock} missões para desbloquear
          </p>
          <div className="mt-6 border-t border-slate-200/60 pt-5">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-white">
              Missão atual
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white">
                  {currentMission?.title ?? "Missão indisponível"}
                </div>
                <div className="text-xs text-white">
                  +{currentMission?.xp ?? 0} XP
                </div>
              </div>
              <button
                type="button"
                onClick={onStartMission}
                className="rounded-lg border border-sky-300/35 bg-sky-500/90 px-4 py-2 text-sm font-semibold text-white shadow-[0_0_10px_rgba(56,189,248,0.4)] transition hover:bg-sky-400/95"
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


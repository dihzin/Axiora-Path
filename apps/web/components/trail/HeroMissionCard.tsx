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
  compact?: boolean;
};

const TEXT_PRIMARY = "rgba(240,249,255,0.92)";
const TEXT_MUTED = "rgba(226,232,240,0.72)";

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
    compact = false,
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

  const missionTitle = currentMission?.title ?? "Missão indisponível";
  const missionXp = currentMission?.xp ?? 0;

  return (
    <section
      className={cn(
        `relative z-0 mx-auto w-full max-w-[760px] overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(155deg,rgba(9,18,42,0.86)_0%,rgba(10,28,60,0.8)_54%,rgba(8,19,47,0.88)_100%)] shadow-[0_16px_40px_rgba(2,8,28,0.32),inset_0_1px_0_rgba(255,255,255,0.08)] transition-all duration-500 will-change-transform hover:-translate-y-[1px] hover:shadow-[0_22px_48px_rgba(2,8,28,0.42)] ${axioraMotionClasses.transition}`,
        compact ? "p-3.5 md:p-4" : "p-4 md:p-5",
        levelGlow ? "hero-level-glow" : "",
        className,
      )}
      aria-label="Resumo da missão atual"
      onAnimationEnd={() => {
        if (levelGlow) setLevelGlow(false);
      }}
    >
      <div className="pointer-events-none absolute inset-0 rounded-[28px] bg-gradient-to-b from-white/5 via-white/[0.03] to-transparent" />
      <div className="pointer-events-none absolute inset-0 rounded-[28px] bg-[linear-gradient(180deg,rgba(2,6,23,0)_0%,rgba(2,6,23,0.1)_52%,rgba(2,6,23,0.3)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(70%_90%_at_50%_0%,rgba(56,189,248,0.14),transparent_64%)]" />
      <div className="pointer-events-none absolute -left-8 top-4 h-28 w-28 rounded-full bg-cyan-300/10 blur-2xl" />
      <div className="pointer-events-none absolute -right-6 bottom-2 h-24 w-24 rounded-full bg-emerald-300/10 blur-2xl" />
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-5 left-3 top-5 w-px rounded-full bg-[linear-gradient(180deg,rgba(74,106,146,0)_0%,rgba(74,106,146,0.26)_22%,rgba(74,106,146,0.14)_78%,rgba(74,106,146,0)_100%)]"
      />
      <div className="relative z-10">
        <div className={cn("flex flex-wrap items-start justify-between", compact ? "mb-3 gap-2.5" : "mb-4 gap-3")}>
          <div className="max-w-full">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-cyan-300/25 bg-cyan-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-100">
                Trilha ativa
              </span>
              <span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-100">
                Nível {safeLevel}
              </span>
            </div>
            <h2 className={cn("mt-3 max-w-[94%] font-semibold leading-[1.02] tracking-tight", compact ? "text-[21px]" : "text-[24px]")} style={{ color: TEXT_PRIMARY }}>{subjectName}</h2>
            <p className={cn("mt-2 font-medium", compact ? "text-[11px]" : "text-[12px]")} style={{ color: TEXT_MUTED }}>
              Sua próxima descoberta está logo ali. Mais {remainingXp} XP para abrir o próximo marco.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-cyan-300/16 bg-cyan-400/[0.06] px-3 py-2 text-[11px] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.7)]" />
            <span className="font-semibold text-sky-100">{safeXpPercent}% progresso</span>
          </div>
        </div>

        <div
          className={cn("relative z-10", xpPulse ? "xp-pulse" : "")}
          onAnimationEnd={() => {
            if (xpPulse) setXpPulse(false);
          }}
        >
          <div className={cn("mb-2 flex items-center justify-between gap-2 px-0.5", compact && "mb-1.5")}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: TEXT_MUTED }}>Energia da trilha</p>
            <span className="text-[11px] font-semibold" style={{ color: TEXT_PRIMARY }}>{safeInLevel}/{safeToNext} XP</span>
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

          <div className={cn("grid", compact ? "mt-3 gap-2.5" : "mt-4 gap-3 md:grid-cols-[1.25fr_auto] md:items-center")}>
            <div className={cn("grid", compact ? "gap-2.5" : "gap-3 md:grid-cols-[1.2fr_0.8fr]")}>
              <div className={cn("rounded-[22px] border border-cyan-300/14 bg-[linear-gradient(145deg,rgba(17,24,39,0.48),rgba(8,47,73,0.22))] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]", compact ? "px-3.5 py-2.5" : "px-4 py-3")}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: TEXT_MUTED }}>Missão brilhando agora</p>
                <p className={cn("mt-1 font-semibold leading-tight", compact ? "text-[14px]" : "text-[15px]")} style={{ color: TEXT_PRIMARY }}>{missionTitle}</p>
                <div className={cn("mt-2 flex flex-wrap", compact ? "gap-1.5" : "gap-2")}>
                  <span className="rounded-full border border-cyan-300/25 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-medium text-cyan-100">
                    +{missionXp} XP
                  </span>
                  <span className="rounded-full border border-white/12 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium" style={{ color: TEXT_MUTED }}>
                    Missão pronta
                  </span>
                </div>
              </div>

              <div className={cn("rounded-[22px] border border-emerald-300/12 bg-[linear-gradient(145deg,rgba(16,185,129,0.14),rgba(59,130,246,0.08))] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]", compact ? "px-3.5 py-2.5" : "px-4 py-3")}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: TEXT_MUTED }}>Próximo portal</p>
                <p className={cn("mt-1 font-semibold", compact ? "text-[13px]" : "text-[14px]")} style={{ color: TEXT_PRIMARY }}>Nível {nextLevel}</p>
                <p className={cn("mt-1 leading-snug", compact ? "text-[11px]" : "text-[12px]")} style={{ color: TEXT_MUTED }}>
                  Cerca de {missionsToUnlock} missões para desbloquear.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onStartMission}
              className={cn(
                "inline-flex items-center justify-center rounded-[20px] border border-cyan-200/35 bg-[linear-gradient(135deg,rgba(56,189,248,0.96),rgba(37,99,235,0.96))] font-semibold text-white shadow-[0_0_18px_rgba(56,189,248,0.34)] transition hover:brightness-110",
                compact ? "min-h-[50px] w-full px-4 py-2.5 text-[13px]" : "min-h-[56px] px-5 py-3 text-[14px] md:min-w-[188px]",
              )}
            >
              Iniciar missão
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}


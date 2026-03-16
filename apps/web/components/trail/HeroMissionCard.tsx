"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { axioraMotionClasses } from "@/theme/motion";
import { ParchmentCard } from "@/components/ui/ParchmentCard";

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

const TEXT_INK  = "#2C1E16";
const TEXT_GOLD = "#8B5E1A";

export function HeroMissionCard(props: HeroMissionCardProps) {
  const {
    subjectName,
    level,
    xpPercent,
    currentMission,
    onStartMission,
    className,
    compact = false,
  } = props;

  const safeXpPercent = Math.max(0, Math.min(100, Math.round(xpPercent)));
  const safeLevel     = Math.max(1, Math.floor(level));

  const [xpPulse, setXpPulse]     = useState(false);
  const [levelGlow, setLevelGlow] = useState(false);
  const previousXpRef    = useRef<string | null>(null);
  const previousLevelRef = useRef<number | null>(null);

  useEffect(() => {
    const sig = `${safeXpPercent}`;
    if (previousXpRef.current === null) { previousXpRef.current = sig; return; }
    if (previousXpRef.current !== sig) {
      setXpPulse(false);
      requestAnimationFrame(() => setXpPulse(true));
      previousXpRef.current = sig;
    }
  }, [safeXpPercent]);

  useEffect(() => {
    if (previousLevelRef.current === null) { previousLevelRef.current = safeLevel; return; }
    if (safeLevel > previousLevelRef.current) {
      setLevelGlow(false);
      requestAnimationFrame(() => setLevelGlow(true));
    }
    previousLevelRef.current = safeLevel;
  }, [safeLevel]);

  const missionTitle = currentMission?.title ?? "Missão indisponível";
  const missionXp    = currentMission?.xp ?? 0;

  return (
    <ParchmentCard
      as="section"
      variant="glass"
      ariaLabel="Resumo da missão atual"
      className={cn(
        `z-0 mx-auto w-full max-w-[760px] will-change-transform hover:-translate-y-[1px] ${axioraMotionClasses.transition}`,
        compact ? "p-3 md:p-3.5" : "p-4 md:p-5",
        levelGlow ? "hero-level-glow" : "",
        className,
      )}
    >
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-20 rounded-t-[22px] bg-[radial-gradient(70%_80%_at_50%_0%,rgba(255,183,3,0.10),transparent_70%)]"
        onAnimationEnd={() => { if (levelGlow) setLevelGlow(false); }} />

      {/* Cabeçalho: matéria + nível */}
      <div className="flex items-center justify-between gap-2">
        <h2
          className={cn("font-black leading-none tracking-tight", compact ? "text-[20px]" : "text-[24px]")}
          style={{
            background: "linear-gradient(130deg, #2C1E16 0%, #8B5E1A 52%, #C47C20 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          {subjectName}
        </h2>
        <span className="shrink-0 rounded-full border border-[#52B788]/40 bg-[rgba(82,183,136,0.12)] px-2.5 py-1 text-[11px] font-bold text-[#276245]">
          Nível {safeLevel}
        </span>
      </div>

      {/* Barra de XP — só o visual, sem labels */}
      <div
        className={cn("relative", xpPulse ? "xp-pulse" : "", compact ? "mt-2.5" : "mt-3")}
        onAnimationEnd={() => { if (xpPulse) setXpPulse(false); }}
      >
        <div className="relative h-3 w-full overflow-hidden rounded-full border-2 border-[#A07850]/50 bg-[linear-gradient(180deg,rgba(220,200,168,0.9)_0%,rgba(200,175,138,0.9)_100%)] shadow-[inset_0_2px_4px_rgba(44,30,18,0.18)]">
          <div aria-hidden className="pointer-events-none absolute inset-0 z-10">
            <span className="absolute left-1/4 top-0 h-full w-px bg-[#5C4033]/20" />
            <span className="absolute left-1/2 top-0 h-full w-px bg-[#5C4033]/20" />
            <span className="absolute left-3/4 top-0 h-full w-px bg-[#5C4033]/20" />
          </div>
          <div
            className="relative z-0 h-full rounded-full bg-gradient-to-r from-[#FFB703] via-[#FB8C00] to-[#D96C2A] shadow-[0_0_14px_rgba(255,183,3,0.55)] transition-all duration-[400ms] ease-out"
            style={{ width: `${safeXpPercent}%` }}
          />
        </div>
      </div>

      {/* Missão atual */}
      <div className={cn(
        "relative overflow-hidden rounded-[16px] border border-[#A07850]/45 bg-[linear-gradient(145deg,rgba(253,245,230,0.72),rgba(240,222,188,0.55))] shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]",
        compact ? "mt-3 px-3 py-2.5" : "mt-4 px-4 py-3",
      )}>
        <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-[3px] rounded-l-[16px] bg-gradient-to-b from-[#FFB703] to-[#FB8C00]" />
        <div className="flex items-start justify-between gap-2">
          <p
            className={cn("font-bold leading-snug", compact ? "text-[13px]" : "text-[14px]")}
            style={{ color: TEXT_INK }}
          >
            {missionTitle}
          </p>
          {missionXp > 0 && (
            <span className="shrink-0 rounded-full border border-[#FFB703]/50 bg-[rgba(255,183,3,0.15)] px-2 py-0.5 text-[11px] font-bold shadow-[0_0_8px_rgba(255,183,3,0.18)]" style={{ color: TEXT_GOLD }}>
              +{missionXp} XP
            </span>
          )}
        </div>
      </div>

      {/* Botão principal */}
      <button
        type="button"
        onClick={onStartMission}
        className={cn(
          "medieval-btn mt-3 inline-flex w-full items-center justify-center font-black",
          compact ? "min-h-[48px] text-[13px]" : "min-h-[54px] text-[15px]",
        )}
      >
        ⚔ Iniciar missão
      </button>
    </ParchmentCard>
  );
}

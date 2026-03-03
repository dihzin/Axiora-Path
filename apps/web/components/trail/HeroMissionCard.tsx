"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { BrainIcon } from "@/components/ui/icons/BrainIcon";
import { LevelUpIcon } from "@/components/ui/icons/LevelUpIcon";
import { StreakFlameIcon } from "@/components/ui/icons/StreakFlameIcon";
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
  encouragementText?: string;
  className?: string;
};

export function HeroMissionCard(props: HeroMissionCardProps) {
  const {
    subjectName,
    streakDays,
    level,
    xpPercent,
    xpInLevel,
    xpToNextLevel,
    className,
  } = props;
  const safeXpPercent = Math.max(0, Math.min(100, Math.round(xpPercent)));
  const safeLevel = Math.max(1, Math.floor(level));
  const safeStreak = Math.max(0, Math.floor(streakDays));
  const safeInLevel = Math.max(0, Math.floor(xpInLevel));
  const safeToNext = Math.max(1, Math.floor(xpToNextLevel));
  const compactStreak = `${safeStreak}d`;
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
        `relative z-0 overflow-visible rounded-[38px_18px_32px_24px] bg-[#FFEDE5] px-6 py-10 shadow-[var(--axiora-shadow-md)] transition-shadow duration-200 will-change-transform motion-safe:animate-[axiora-breathing_4s_ease-in-out_infinite] motion-reduce:animate-none before:pointer-events-none before:absolute before:inset-[-40px] before:-z-10 before:bg-[radial-gradient(circle,rgba(255,107,61,0.18),transparent_70%)] before:blur-[40px] before:content-[''] sm:px-8 sm:py-11 ${axioraMotionClasses.transition} ${axioraMotionClasses.hoverScale} ${axioraMotionClasses.clickScale}`,
        levelGlow ? "hero-level-glow" : "",
        className,
      )}
      aria-label="Resumo da missão atual"
      onAnimationEnd={() => {
        if (levelGlow) setLevelGlow(false);
      }}
    >
      <div className="relative z-10 rounded-[38px_18px_32px_24px] bg-[linear-gradient(180deg,rgba(255,255,255,0.72)_0%,rgba(255,255,255,0.55)_100%)] p-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">

        <div className="absolute right-5 top-5 z-20">
          <span
            className={cn(
              "inline-flex items-center gap-1 text-sm font-semibold text-[#F97316]",
              safeStreak >= 7 ? "relative pb-1 after:absolute after:bottom-0 after:left-0 after:h-[1.5px] after:w-full after:rounded-full after:bg-[#F97316] motion-safe:after:animate-[hero-streak-underline_1.8s_ease-in-out_infinite]" : "",
            )}
            title={`${safeStreak} dia${safeStreak === 1 ? "" : "s"} seguido${safeStreak === 1 ? "" : "s"}`}
            aria-label={`${safeStreak} dia${safeStreak === 1 ? "" : "s"} seguido${safeStreak === 1 ? "" : "s"}`}
          >
            <StreakFlameIcon className="h-[18px] w-[18px]" />
            {compactStreak}
          </span>
        </div>

        <div className="relative z-10 flex flex-col items-center text-center">
          <div className="flex h-28 w-28 items-center justify-center rounded-[28px] border border-[#FFD5C6] bg-white shadow-[0_10px_22px_rgba(43,47,66,0.12)]">
            <BrainIcon className="h-16 w-16 text-[#2B2F42]" />
          </div>

          <h2 className="mt-5 max-w-[90%] text-3xl font-extrabold leading-[0.95] tracking-[-0.01em] text-[#1E1E1E]">{subjectName}</h2>
          <p className="mt-2 inline-flex items-center gap-1.5 text-xl font-semibold leading-tight text-[#2B2F42]/85">
            <LevelUpIcon className="h-5 w-5" />
            Nível {safeLevel}
          </p>
        </div>

        <div
          className={cn("relative z-10 mt-8", xpPulse ? "xp-pulse" : "")}
          onAnimationEnd={() => {
            if (xpPulse) setXpPulse(false);
          }}
        >
          <div className="mb-2 flex items-center justify-between gap-2 px-1">
            <span className="text-xs font-bold text-transparent">.</span>
            <span className="text-xs font-semibold text-[#2B2F42]/75">{safeXpPercent}%</span>
          </div>
          <div className="h-3.5 w-full overflow-hidden rounded-full border border-[#FFD9CC] bg-[#FFF2EC]">
            <div
              className="h-full rounded-full bg-[linear-gradient(135deg,#FF6B3D_0%,#FF8A63_100%)] transition-transform transition-shadow transition-opacity duration-[400ms] ease-out"
              style={{ width: `${safeXpPercent}%` }}
            />
          </div>
          <p className="mt-2 text-center text-sm font-medium text-[#5C5C5C]/80">
            {safeInLevel} / {safeToNext} XP para subir
          </p>
        </div>
      </div>
    </section>
  );
}


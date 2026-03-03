"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
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
        `relative z-0 overflow-visible rounded-[26px] border border-[rgba(255,255,255,0.35)] bg-[rgba(248,250,255,0.92)] px-6 py-12 shadow-[0_10px_24px_rgba(26,38,60,0.08),0_2px_6px_rgba(26,38,60,0.05)] backdrop-blur-[6px] transition-[transform,box-shadow] duration-300 ease-out will-change-transform hover:-translate-y-[2px] hover:shadow-[0_12px_28px_rgba(26,38,60,0.10),0_3px_8px_rgba(26,38,60,0.06)] before:pointer-events-none before:absolute before:inset-[-60px] before:-z-10 before:bg-[radial-gradient(circle_at_20%_20%,rgba(79,126,219,0.18),transparent_60%)] before:blur-[24px] before:content-[''] sm:px-7 sm:py-12 ${axioraMotionClasses.transition}`,
        levelGlow ? "hero-level-glow" : "",
        className,
      )}
      aria-label="Resumo da missão atual"
      onAnimationEnd={() => {
        if (levelGlow) setLevelGlow(false);
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-5 left-4 top-5 w-px rounded-full bg-[linear-gradient(180deg,rgba(74,106,146,0)_0%,rgba(74,106,146,0.32)_22%,rgba(74,106,146,0.2)_78%,rgba(74,106,146,0)_100%)]"
      />
      <div className="relative z-10">
        <div className="absolute right-0 top-0 z-20">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-[16px] border border-[rgba(255,255,255,0.4)] bg-[rgba(255,255,255,0.8)] px-2 py-1 text-xs font-semibold text-[#C56437] backdrop-blur-[4px]",
              safeStreak >= 7 ? "relative pb-1 after:absolute after:bottom-0 after:left-0 after:h-[1.5px] after:w-full after:rounded-full after:bg-[#F97316] motion-safe:after:animate-[hero-streak-underline_1.8s_ease-in-out_infinite]" : "",
            )}
            title={`${safeStreak} dia${safeStreak === 1 ? "" : "s"} seguido${safeStreak === 1 ? "" : "s"}`}
            aria-label={`${safeStreak} dia${safeStreak === 1 ? "" : "s"} seguido${safeStreak === 1 ? "" : "s"}`}
          >
            <StreakFlameIcon className="h-[18px] w-[18px]" />
            {compactStreak}
          </span>
        </div>

        <div className="relative z-10">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="max-w-[76%]">
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#52698E]/82">Trilha ativa</p>
              <h2 className="mt-1.5 ml-0.5 max-w-[94%] text-[32px] font-bold leading-[0.94] tracking-[-0.02em] text-[#18263A] [text-shadow:0_2px_8px_rgba(0,0,0,0.08)]">{subjectName}</h2>
              <p className="mt-2 inline-flex items-center gap-1.5 text-lg font-semibold leading-tight text-[#2A3C56]/80">
                <LevelUpIcon className="h-5 w-5" />
                Nível {safeLevel}
              </p>
            </div>
            <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-[22px] border border-[#D3DEEC] bg-[linear-gradient(160deg,#F3F6FB_0%,#E6ECF5_100%)] shadow-[0_7px_16px_rgba(34,46,68,0.12)]">
              <svg viewBox="0 0 64 64" className="h-10 w-10 text-[#2C4566]" aria-hidden>
                <path d="M32 8 52 20 52 44 32 56 12 44 12 20Z" fill="currentColor" opacity="0.2" />
                <path d="M32 16 45 24 45 40 32 48 19 40 19 24Z" fill="none" stroke="currentColor" strokeWidth="2.6" />
                <circle cx="32" cy="32" r="4" fill="currentColor" />
              </svg>
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
            <span className="text-xs font-semibold text-[#2B3F5E]/78">{safeXpPercent}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full border border-[#CBD8E8] bg-[linear-gradient(180deg,#E4EBF5_0%,#DEE7F2_100%)] shadow-[inset_0_1px_3px_rgba(41,58,86,0.12)]">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#4F7EDB_0%,#5C8FF5_50%,#3A6ED1_100%)] shadow-[0_0_10px_rgba(79,126,219,0.35)] transition-transform transition-shadow transition-opacity duration-[400ms] ease-out"
              style={{ width: `${safeXpPercent}%` }}
            />
          </div>
          <p className="mt-2.5 text-sm font-medium text-[#435876]/80">
            {safeInLevel} / {safeToNext} XP para subir
          </p>
        </div>
      </div>
    </section>
  );
}


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

const TEXT_INK   = "#2C1E16";
const TEXT_SOFT  = "#5C4A3A";
const TEXT_GOLD  = "#8B5E1A";

export function HeroMissionCard(props: HeroMissionCardProps) {
  const {
    subjectName,
    level,
    xpPercent,
    xpInLevel,
    xpToNextLevel,
    currentMission,
    onContinue,
    onStartMission,
    className,
    compact = false,
  } = props;
  const safeXpPercent   = Math.max(0, Math.min(100, Math.round(xpPercent)));
  const safeLevel       = Math.max(1, Math.floor(level));
  const safeInLevel     = Math.max(0, Math.floor(xpInLevel));
  const safeToNext      = Math.max(1, Math.floor(xpToNextLevel));
  const remainingXp     = Math.max(0, safeToNext - safeInLevel);
  const nextLevel       = safeLevel + 1;
  const missionsToUnlock = Math.max(1, Math.ceil(remainingXp / 30));
  const [xpPulse, setXpPulse]     = useState(false);
  const [levelGlow, setLevelGlow] = useState(false);
  const previousXpRef    = useRef<string | null>(null);
  const previousLevelRef = useRef<number | null>(null);

  useEffect(() => {
    const signature = `${safeXpPercent}:${safeInLevel}:${safeToNext}`;
    if (previousXpRef.current === null) { previousXpRef.current = signature; return; }
    if (previousXpRef.current !== signature) {
      setXpPulse(false);
      requestAnimationFrame(() => setXpPulse(true));
      previousXpRef.current = signature;
    }
  }, [safeInLevel, safeToNext, safeXpPercent]);

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
      style={levelGlow ? undefined : undefined}
    >
      {/* Extra ambient glows on top of ParchmentCard overlays */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-20 rounded-t-[22px] bg-[radial-gradient(70%_80%_at_50%_0%,rgba(255,183,3,0.10),transparent_70%)]"
        onAnimationEnd={() => { if (levelGlow) setLevelGlow(false); }}
      />
      <div aria-hidden className="pointer-events-none absolute -left-6 top-4 h-24 w-24 rounded-full bg-[#FFB703]/8 blur-2xl" />
      <div aria-hidden className="pointer-events-none absolute -right-4 bottom-2 h-20 w-20 rounded-full bg-[#52B788]/8 blur-2xl" />

      <div>
        <div className={cn("flex flex-wrap items-start justify-between", compact ? "mb-3 gap-2.5" : "mb-4 gap-3")}>
          <div className="max-w-full">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-[#A07850]/50 bg-[rgba(160,120,80,0.14)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: TEXT_GOLD }}>
                ✦ Trilha ativa
              </span>
              <span className="rounded-full border border-[#52B788]/40 bg-[rgba(82,183,136,0.12)] px-2.5 py-1 text-[10px] font-semibold text-[#276245]">
                Nível {safeLevel}
              </span>
            </div>
            <h2
              className={cn("mt-3 max-w-[94%] font-black leading-[1.02] tracking-tight", compact ? "text-[22px]" : "text-[26px]")}
              style={{
                background: "linear-gradient(130deg, #2C1E16 0%, #8B5E1A 52%, #C47C20 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >{subjectName}</h2>
            {!compact && (
              <p className="mt-2 text-[12px] font-medium" style={{ color: TEXT_SOFT }}>
                Sua próxima descoberta está logo ali. Mais{" "}
                <span style={{ color: "#8B5E1A", fontWeight: 700 }}>{remainingXp} XP</span>{" "}
                para abrir o próximo marco.
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 rounded-full border border-[#A07850]/40 bg-[rgba(160,120,80,0.10)] px-3 py-2 text-[11px] shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]">
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-[#FB8C00] shadow-[0_0_8px_rgba(251,140,0,0.6)]" />
            <span className="font-semibold" style={{ color: TEXT_GOLD }}>{safeXpPercent}% progresso</span>
          </div>
        </div>

        <div
          className={cn("relative z-10", xpPulse ? "xp-pulse" : "")}
          onAnimationEnd={() => { if (xpPulse) setXpPulse(false); }}
        >
          <div className={cn("mb-2 flex items-center justify-between gap-2 px-0.5", compact && "mb-1.5")}>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: "#A07850" }}>✦ Energia da trilha</p>
            <span className="text-[11px] font-bold" style={{ color: TEXT_INK }}>{safeInLevel}/{safeToNext} XP</span>
          </div>
          {/* XP progress bar — parchment trough, gold fill */}
          <div className="relative h-3 w-full overflow-hidden rounded-full border-2 border-[#A07850]/50 bg-[linear-gradient(180deg,rgba(220,200,168,0.9)_0%,rgba(200,175,138,0.9)_100%)] shadow-[inset_0_2px_4px_rgba(44,30,18,0.18)]">
            <div aria-hidden className="pointer-events-none absolute inset-0 z-10">
              <span className="absolute left-1/4 top-0 h-full w-px bg-[#5C4033]/20" />
              <span className="absolute left-1/2 top-0 h-full w-px bg-[#5C4033]/20" />
              <span className="absolute left-3/4 top-0 h-full w-px bg-[#5C4033]/20" />
            </div>
            <div
              className="relative z-0 h-full rounded-full bg-gradient-to-r from-[#FFB703] via-[#FB8C00] to-[#D96C2A] shadow-[0_0_14px_rgba(255,183,3,0.55),0_0_5px_rgba(255,183,3,0.35)] transition-all duration-[400ms] ease-out"
              style={{ width: `${safeXpPercent}%` }}
            />
          </div>

          <div className={cn("grid", compact ? "mt-3 gap-2.5" : "mt-4 gap-3 md:grid-cols-[1.25fr_auto] md:items-center")}>
            <div className={cn("grid", compact ? "gap-2.5" : "gap-3 md:grid-cols-[1.2fr_0.8fr]")}>
              {/* Current mission sub-card */}
              <div className={cn("relative overflow-hidden rounded-[18px] border border-[#A07850]/45 bg-[linear-gradient(145deg,rgba(253,245,230,0.72),rgba(240,222,188,0.55))] shadow-[inset_0_1px_0_rgba(255,255,255,0.65),0_0_12px_rgba(255,183,3,0.08)]", compact ? "px-3.5 py-2.5" : "px-4 py-3")}>
                <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-[3px] rounded-l-[18px] bg-gradient-to-b from-[#FFB703] to-[#FB8C00]" />
                <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: "#A07850" }}>✦ Missão brilhando agora</p>
                <p className={cn("mt-1 font-bold leading-tight", compact ? "text-[14px]" : "text-[15px]")} style={{ color: TEXT_INK }}>{missionTitle}</p>
                <div className={cn("mt-2 flex flex-wrap", compact ? "gap-1.5" : "gap-2")}>
                  <span className="rounded-full border border-[#FFB703]/50 bg-[rgba(255,183,3,0.15)] px-2.5 py-1 text-[11px] font-bold shadow-[0_0_8px_rgba(255,183,3,0.18)]" style={{ color: "#7A4F10" }}>
                    +{missionXp} XP
                  </span>
                  <span className="rounded-full border border-[#A07850]/35 bg-[rgba(160,120,80,0.08)] px-2.5 py-1 text-[11px] font-medium" style={{ color: TEXT_SOFT }}>
                    Missão pronta
                  </span>
                </div>
              </div>

              {/* Next level sub-card */}
              <div className={cn("relative overflow-hidden rounded-[18px] border border-[#52B788]/35 bg-[linear-gradient(145deg,rgba(82,183,136,0.12),rgba(39,98,69,0.08))] shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]", compact ? "px-3.5 py-2.5" : "px-4 py-3")}>
                <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-[3px] rounded-l-[18px] bg-gradient-to-b from-[#52B788] to-[#276245]" />
                <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: "#276245" }}>▲ Próximo portal</p>
                <p className={cn("mt-1 font-bold", compact ? "text-[13px]" : "text-[14px]")} style={{ color: TEXT_INK }}>Nível {nextLevel}</p>
                <p className={cn("mt-1 leading-snug", compact ? "text-[11px]" : "text-[12px]")} style={{ color: TEXT_SOFT }}>
                  Cerca de <span style={{ color: "#276245", fontWeight: 600 }}>{missionsToUnlock}</span> missões para desbloquear.
                </p>
              </div>
            </div>

            <div className={cn("flex flex-col", compact ? "gap-2" : "gap-2.5")}>
              <button
                type="button"
                onClick={onStartMission}
                className={cn(
                  "medieval-btn inline-flex items-center justify-center font-black",
                  compact ? "min-h-[50px] w-full px-4 py-2.5 text-[13px]" : "min-h-[56px] px-5 py-3 text-[14px] md:min-w-[188px]",
                )}
              >
                ⚔ Iniciar missão
              </button>
              {onContinue ? (
                <button
                  type="button"
                  onClick={onContinue}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-full border-2 border-[#A07850]/50 bg-[rgba(160,120,80,0.10)] px-3 py-2 text-[11px] font-semibold transition-colors hover:border-[#A07850]/70 hover:bg-[rgba(160,120,80,0.18)]"
                  style={{ color: TEXT_GOLD }}
                >
                  <span aria-hidden className="text-[10px]">↑</span>
                  Ver na trilha
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </ParchmentCard>
  );
}

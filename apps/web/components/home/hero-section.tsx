"use client";

import type { HomeNextAction } from "@/hooks/use-home-state";
import { StatsBadges } from "./stats-badges";
import { UserIdentity } from "./user-identity";

type HeroSectionProps = {
  identity: {
    name: string;
    greeting: string;
    subtitle: string;
    avatarKey: string | null;
    avatarStage: number;
  };
  stats: {
    level: number;
    xpPercent: number;
    xpPulsing: boolean;
    streak: number;
    balanceCents: number;
    isSchoolTenant: boolean;
  };
  nextAction: HomeNextAction;
  nextStepHint: string;
  soundEnabled: boolean;
  onPrimaryAction: () => void;
  onToggleSound: () => void;
  onParentMode: () => void;
};

export function HeroSection({
  identity,
  stats,
  nextAction,
  nextStepHint,
  soundEnabled,
  onPrimaryAction,
  onToggleSound,
  onParentMode,
}: HeroSectionProps) {
  return (
    // Sem card fechado — só atmosfera e breathing room
    <section className="relative px-1 pb-1 pt-2 lg:pb-2 lg:pt-3">
      {/* Ambient glows — suaves e luminosos, dão atmosfera sem pesar */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-8 -top-8 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(251,146,60,0.18)_0%,rgba(251,146,60,0)_65%)] blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-6 bottom-0 h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(56,189,248,0.14)_0%,rgba(56,189,248,0)_68%)] blur-3xl"
      />
      {/* Glow central suave */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/3 top-1/2 h-32 w-64 -translate-y-1/2 rounded-full bg-[radial-gradient(ellipse,rgba(168,85,247,0.06)_0%,rgba(168,85,247,0)_70%)] blur-2xl"
      />

      <div className="relative z-[1] flex flex-col gap-4 md:flex-row md:items-start md:justify-between md:gap-6">
        {/* Left: heading + CTA + badges */}
        <div className="flex flex-col gap-3">
          {/* Eyebrow + título */}
          <div className="space-y-1.5">
            <p className="axiora-subtitle text-[10px] font-black uppercase tracking-[0.12em] opacity-60">
              Axiora Core Hub
            </p>
            <h1 className="axiora-title font-extrabold leading-tight text-[28px] lg:text-[32px]">
              {identity.greeting}
            </h1>
            <p className="axiora-subtitle text-sm opacity-75 lg:text-[15px]">{identity.subtitle}</p>
          </div>

          <StatsBadges
            stats={stats}
            nextStepHint={nextStepHint}
            nextAction={nextAction}
            soundEnabled={soundEnabled}
            onPrimaryAction={onPrimaryAction}
            onToggleSound={onToggleSound}
            onParentMode={onParentMode}
          />
        </div>

        {/* Right: avatar — discreto, alinhado ao topo */}
        <UserIdentity
          name={identity.name}
          avatarKey={identity.avatarKey}
          avatarStage={identity.avatarStage}
        />
      </div>
    </section>
  );
}

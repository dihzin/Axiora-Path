"use client";

import { useMemo } from "react";
import { Crown, Gift } from "lucide-react";

import { ConfettiBurst } from "@/components/confetti-burst";

type LevelUpOverlayProps = {
  level: number;
  unlockedReward?: string | null;
  onDismiss: () => void;
};

const PARTICLE_COUNT = 14;

function rewardLabel(input: string): string {
  const mapping: Record<string, string> = {
    first_win: "Conquista desbloqueada: Primeira vitória",
    wins_streak_3: "Conquista desbloqueada: Sequência de 3 vitórias",
    xp_100_reached: "Conquista desbloqueada: 100 XP alcançados",
    first_finance_master: "Conquista desbloqueada: Primeiro Finance Master",
  };
  const normalized = input.trim().toLowerCase();
  if (mapping[normalized]) return mapping[normalized];
  return `Recompensa desbloqueada: ${input.replaceAll("_", " ")}`;
}

export function LevelUpOverlay({ level, unlockedReward, onDismiss }: LevelUpOverlayProps) {
  const particles = useMemo(
    () =>
      Array.from({ length: PARTICLE_COUNT }).map((_, index) => ({
        id: index,
        left: 10 + Math.random() * 80,
        delay: Math.random() * 300,
        size: 4 + Math.random() * 5,
        drift: (Math.random() - 0.5) * 80,
      })),
    [level],
  );

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-foreground/50 px-6">
      <ConfettiBurst trigger={level} />
      <div className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center text-foreground shadow-[0_2px_0_rgba(184,200,239,0.8),0_18px_30px_rgba(34,63,107,0.2)]">
        <div className="absolute inset-0 overflow-hidden rounded-xl">
          {particles.map((particle) => (
            <span
              key={particle.id}
              className="levelup-particle"
              style={{
                left: `${particle.left}%`,
                width: `${particle.size}px`,
                height: `${particle.size}px`,
                animationDelay: `${particle.delay}ms`,
                ["--drift" as string]: `${particle.drift}px`,
              }}
            />
          ))}
        </div>
        <div className="relative mx-auto mb-3 inline-flex h-24 w-24 items-center justify-center rounded-full border-2 border-accent/45 bg-[radial-gradient(circle_at_30%_30%,#fff7e6_0%,#ffe6bf_70%)] shadow-[0_6px_0_rgba(191,136,14,0.28)] sticker-unlock-pop">
          <Crown className="h-10 w-10 text-accent-foreground" />
        </div>
        <p className="relative text-sm font-semibold uppercase tracking-[0.22em] text-secondary">Subiu de nível!</p>
        <p className="relative mt-2 text-4xl font-black leading-none">Você alcançou o nível {level}</p>
        {unlockedReward ? (
          <div className="relative mt-4 rounded-xl border border-secondary/35 bg-secondary/10 px-3 py-2 text-sm font-semibold text-secondary">
            <Gift className="mr-1.5 inline h-4 w-4" />
            {rewardLabel(unlockedReward)}
          </div>
        ) : null}
        <button
          type="button"
          aria-label="Fechar aviso de level up"
          className="relative mt-5 rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2"
          onClick={onDismiss}
        >
          Fechar
        </button>
      </div>
    </div>
  );
}

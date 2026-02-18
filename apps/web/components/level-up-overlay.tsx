"use client";

import { useMemo } from "react";

type LevelUpOverlayProps = {
  level: number;
  onDismiss: () => void;
};

const PARTICLE_COUNT = 14;

export function LevelUpOverlay({ level, onDismiss }: LevelUpOverlayProps) {
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
      <div className="relative w-full max-w-sm rounded-xl border border-border bg-card p-6 text-center text-foreground shadow-sm">
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
        <p className="relative text-sm font-semibold uppercase tracking-[0.22em] text-secondary">Subiu de nível!</p>
        <p className="relative mt-2 text-6xl font-black leading-none">Lv {level}</p>
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

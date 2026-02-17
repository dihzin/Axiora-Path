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
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/80 px-6">
      <div className="relative w-full max-w-sm rounded-2xl border border-white/20 bg-slate-900/90 p-6 text-center text-white shadow-2xl">
        <div className="absolute inset-0 overflow-hidden rounded-2xl">
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
        <p className="relative text-sm font-semibold uppercase tracking-[0.22em] text-cyan-200">Level Up!</p>
        <p className="relative mt-2 text-6xl font-black leading-none">Lv {level}</p>
        <button
          type="button"
          className="relative mt-5 rounded-md border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold transition hover:bg-white/20"
          onClick={onDismiss}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

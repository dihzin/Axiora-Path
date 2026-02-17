"use client";

import { useEffect, useRef, useState } from "react";
import { Lock } from "lucide-react";

type PiggyJarProps = {
  currentSaveAmountCents: number;
  nextGoalAmountCents: number | null;
  savePercent: number;
  isLocked: boolean;
};

function formatBRL(valueCents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valueCents / 100);
}

export function PiggyJar({ currentSaveAmountCents, nextGoalAmountCents, savePercent, isLocked }: PiggyJarProps) {
  const safePercent = Math.max(0, Math.min(100, savePercent));
  const [unlockFx, setUnlockFx] = useState(false);
  const prevLockedRef = useRef<boolean>(isLocked);

  useEffect(() => {
    const wasLocked = prevLockedRef.current;
    if (wasLocked && !isLocked && safePercent >= 100) {
      setUnlockFx(true);
      const t = window.setTimeout(() => setUnlockFx(false), 1100);
      return () => window.clearTimeout(t);
    }
    prevLockedRef.current = isLocked;
  }, [isLocked, safePercent]);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Pote SAVE</p>
          <p className="text-lg font-semibold">{formatBRL(currentSaveAmountCents)}</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-muted-foreground">Prxima meta</p>
          <p className="text-sm font-medium">
            {nextGoalAmountCents !== null ? formatBRL(nextGoalAmountCents) : "Sem meta"}
          </p>
        </div>
      </div>

      <div className="mt-4 flex justify-center">
        <div className={`relative h-28 w-20 overflow-hidden rounded-b-[1.8rem] rounded-t-[0.8rem] border-2 border-zinc-300 bg-zinc-100 ${unlockFx ? "goal-unlock-glow" : ""}`}>
          <div
            className="absolute inset-x-0 bottom-0 bg-emerald-400 transition-[height] duration-700 ease-out"
            style={{ height: `${safePercent}%` }}
          />
          {isLocked ? (
            <div className="absolute inset-x-0 top-2 flex justify-center">
              <span className="goal-lock-wiggle inline-flex rounded-full bg-white/80 p-1 text-zinc-700">
                <Lock className="h-3 w-3" />
              </span>
            </div>
          ) : null}
          {unlockFx ? (
            <>
              <span className="goal-sparkle goal-sparkle-1">✦</span>
              <span className="goal-sparkle goal-sparkle-2">✦</span>
              <span className="goal-sparkle goal-sparkle-3">✦</span>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

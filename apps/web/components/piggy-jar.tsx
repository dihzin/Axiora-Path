"use client";

import { useEffect, useRef, useState } from "react";
import { Droplets, Lock } from "lucide-react";

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
  const isEmpty = safePercent <= 0;
  const [unlockFx, setUnlockFx] = useState(false);
  const prevLockedRef = useRef<boolean>(isLocked);

  useEffect(() => {
    const wasLocked = prevLockedRef.current;
    if (wasLocked && !isLocked && safePercent >= 100) {
      setUnlockFx(true);
      prevLockedRef.current = isLocked;
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
          <p className="text-sm text-muted-foreground">Próxima meta</p>
          <p className="text-sm font-medium">
            {nextGoalAmountCents !== null ? formatBRL(nextGoalAmountCents) : "Sem meta"}
          </p>
        </div>
      </div>

      <div className="mt-4 flex justify-center">
        <div className={`relative h-28 w-20 overflow-hidden rounded-xl border-2 border-border bg-muted ${unlockFx ? "goal-unlock-glow" : ""}`}>
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.45)_0%,rgba(255,255,255,0)_45%)]" />
          <div
            className="absolute inset-x-0 bottom-0 bg-secondary transition-[height] duration-700 ease-out"
            style={{ height: `${safePercent}%` }}
          />
          {isEmpty ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
              <Droplets className="h-4 w-4 opacity-65" />
              <span className="mt-1 text-xs font-medium">0%</span>
            </div>
          ) : null}
          <div className="absolute inset-x-0 bottom-0 border-t border-border/70 bg-background/35 px-1 py-0.5 text-center text-[10px] font-semibold text-foreground">
            {safePercent.toFixed(0)}%
          </div>
          {isLocked ? (
            <div className="absolute inset-x-0 top-2 flex justify-center">
              <span className="goal-lock-wiggle inline-flex rounded-xl bg-card/90 p-1 text-foreground">
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

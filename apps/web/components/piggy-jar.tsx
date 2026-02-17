"use client";

type PiggyJarProps = {
  currentSaveAmountCents: number;
  nextGoalAmountCents: number | null;
  savePercent: number;
};

function formatBRL(valueCents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valueCents / 100);
}

export function PiggyJar({ currentSaveAmountCents, nextGoalAmountCents, savePercent }: PiggyJarProps) {
  const safePercent = Math.max(0, Math.min(100, savePercent));

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Pote SAVE</p>
          <p className="text-lg font-semibold">{formatBRL(currentSaveAmountCents)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Prxima meta</p>
          <p className="text-sm font-medium">
            {nextGoalAmountCents !== null ? formatBRL(nextGoalAmountCents) : "Sem meta"}
          </p>
        </div>
      </div>

      <div className="mt-4 flex justify-center">
        <div className="relative h-28 w-20 overflow-hidden rounded-b-[1.8rem] rounded-t-[0.8rem] border-2 border-zinc-300 bg-zinc-100">
          <div
            className="absolute inset-x-0 bottom-0 bg-emerald-400 transition-[height] duration-700 ease-out"
            style={{ height: `${safePercent}%` }}
          />
        </div>
      </div>
    </div>
  );
}


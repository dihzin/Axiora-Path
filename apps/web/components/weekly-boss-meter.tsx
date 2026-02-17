"use client";

type WeeklyBossMeterProps = {
  completionRate: number;
};

export function WeeklyBossMeter({ completionRate }: WeeklyBossMeterProps) {
  const percent = Math.max(0, Math.min(100, completionRate));
  const bossDefeated = percent >= 80;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Weekly Boss Meter</p>
        <p className="text-sm text-muted-foreground">{percent.toFixed(0)}%</p>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary transition-[width] duration-700 ease-out" style={{ width: `${percent}%` }} />
      </div>
      {bossDefeated ? (
        <span className="mt-3 inline-flex rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">
          Boss Defeated
        </span>
      ) : null}
    </div>
  );
}


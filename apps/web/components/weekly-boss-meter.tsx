"use client";

type WeeklyBossMeterProps = {
  completionRate: number;
};

export function WeeklyBossMeter({ completionRate }: WeeklyBossMeterProps) {
  const percent = Math.max(0, Math.min(100, completionRate));
  const bossDefeated = percent >= 80;

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm md:p-6">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Medidor de desafio semanal</p>
        <p className="text-sm font-medium text-muted-foreground">{percent.toFixed(0)}%</p>
      </div>
      <div className="mt-2 h-3 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-secondary transition-[width] duration-700 ease-out" style={{ width: `${percent}%` }} />
      </div>
      {bossDefeated ? (
        <span className="mt-3 inline-flex rounded-xl bg-secondary/12 px-2 py-1 text-sm font-medium text-secondary">
          Desafio concluído
        </span>
      ) : null}
    </div>
  );
}


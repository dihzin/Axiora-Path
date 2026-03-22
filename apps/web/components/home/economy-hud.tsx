"use client";

import { useChangePulse } from "@/hooks/use-change-pulse";
import { cn } from "@/lib/utils";

function formatBRL(valueCents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    valueCents / 100,
  );
}

type EconomyHudProps = {
  balance: {
    balanceCents: number;
    saveBalanceCents: number;
    savePercent: number;
  };
  goal: {
    title: string;
    targetLabel: string;
    targetCents: number | null;
    locked: boolean;
  };
};

export function EconomyHud({ balance, goal }: EconomyHudProps) {
  const hasGoal = goal.title !== "Definir objetivo";

  // Pulsa quando o saldo muda (após completar missão / ganhar recompensa)
  const balancePulse = useChangePulse(balance.balanceCents);

  return (
    <button
      type="button"
      aria-label="Ver economia — ir para loja"
      onClick={() => window.location.assign("/child/store")}
      className="w-full cursor-pointer rounded-2xl border border-white/50 bg-white/65 px-3.5 py-2.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_4px_20px_rgba(0,0,0,0.05)] backdrop-blur transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:bg-white/75 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_8px_28px_rgba(0,0,0,0.07)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A2F] focus-visible:ring-offset-2">
      <div className="flex items-center justify-between gap-2">
        <p className="axiora-subtitle text-[12px] font-black uppercase tracking-[0.08em] opacity-55">
          Economia
        </p>
        <p
          className={cn(
            "axiora-title text-sm font-extrabold opacity-80 transition-[transform,filter] duration-300 ease-out",
            balancePulse && "scale-[1.08] brightness-125 opacity-100",
          )}
        >
          {formatBRL(balance.balanceCents)}
        </p>
      </div>

      {hasGoal ? (
        <div className="mt-2 space-y-1.5">
          <div className="flex items-center justify-between gap-1">
            <p className="axiora-title text-[13px] font-bold opacity-75">{goal.title}</p>
            <p className="axiora-subtitle text-[11px] opacity-50">{goal.targetLabel}</p>
          </div>

          {balance.saveBalanceCents > 0 && (
            <div className="space-y-1">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[rgba(148,163,184,0.20)]">
                <div
                  className="h-full rounded-full bg-[#0E8F62] opacity-75 transition-[width] duration-500 ease-out"
                  style={{ width: `${Math.min(100, balance.savePercent)}%` }}
                />
              </div>
              <div className="flex items-center justify-between">
                <p className="axiora-subtitle text-[11px] opacity-45">
                  {formatBRL(balance.saveBalanceCents)} guardados
                </p>
                <p className="axiora-subtitle text-[11px] opacity-45">
                  {balance.savePercent.toFixed(0)}%
                </p>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-1.5 flex items-center justify-between">
          <p className="axiora-subtitle text-[12px] opacity-40">Sem meta ativa</p>
          <span className="axiora-subtitle inline-flex items-center gap-0.5 rounded-lg px-2 py-0.5 text-[11px] font-semibold text-[#FF9600] opacity-70">
            Definir meta →
          </span>
        </div>
      )}
    </button>
  );
}

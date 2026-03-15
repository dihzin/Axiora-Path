"use client";

import type { MapNode } from "@/components/trail/ProgressionMap";
import { ParchmentCard } from "@/components/ui/ParchmentCard";
import { cn } from "@/lib/utils";

type MissionDetailCardProps = {
  node: MapNode | null;
  onStart?: (node: MapNode) => void;
  className?: string;
};

export function MissionDetailCard({ node, onStart, className }: MissionDetailCardProps) {
  if (!node) return null;

  const description = node.subtitle ?? "Conclua esta missão para avançar na trilha.";
  const xp = typeof node.xp === "number" ? node.xp : 0;
  const isLocked = node.status === "locked";
  const isDone = node.status === "done";
  const buttonLabel = isLocked ? "Bloqueada" : isDone ? "Revisar missão" : "Iniciar missão";

  return (
    <ParchmentCard
      as="section"
      variant="light"
      ariaLabel="Detalhes da missão selecionada"
      className={cn("mx-auto w-full max-w-[760px] p-6", className)}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Missão atual</p>
      <h3 className="mt-1 text-xl font-semibold leading-tight text-slate-900">{node.title}</h3>
      <p className="mt-2 text-sm text-slate-600">{description}</p>
      <p className="mt-4 text-sm font-semibold text-slate-800">+{xp} XP</p>
      <button
        type="button"
        onClick={() => onStart?.(node)}
        disabled={isLocked}
        className={cn(
          "mt-5 inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold transition-colors",
          isLocked ? "cursor-not-allowed bg-slate-200 text-slate-500" : "bg-slate-900 text-white hover:bg-slate-800",
        )}
      >
        {buttonLabel}
      </button>
    </ParchmentCard>
  );
}

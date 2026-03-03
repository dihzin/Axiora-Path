"use client";

import type { TrailNodeType, TrailUnit } from "@/lib/trail-types";
import { TrailPath } from "@/components/trail/TrailPath";
import { cn } from "@/lib/utils";

type UnitBlockProps = {
  unit: TrailUnit;
  index: number;
  onLessonClick: (lessonId: number, state: TrailNodeType) => void;
};

export function UnitBlock({ unit, index, onLessonClick }: UnitBlockProps) {
  const organicRadius = index % 2 === 0 ? "rounded-[36px_18px_30px_24px]" : "rounded-[28px_30px_20px_34px]";
  const hasActiveLesson = unit.nodes.some((node) => node.type === "active" || node.type === "current");

  return (
    <section
      className={cn(
        "border border-black/5 bg-[#F1EAE3] p-4",
        hasActiveLesson ? "shadow-[0_20px_60px_rgba(0,0,0,0.15)]" : "shadow-[0_10px_30px_rgba(0,0,0,0.08)]",
        organicRadius,
      )}
    >
      <header className="mb-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-700/85">{unit.sectionLabel}</p>
        <h3 className="mt-1 text-lg font-black text-[#16345B]">{unit.title}</h3>
        <p className="mt-1 text-xs font-normal text-slate-700/80">Progresso da unidade: {unit.progress}%</p>
        {unit.locked ? (
          <p className="mt-2 rounded-xl border border-black/5 bg-[#EEE5DD] px-3 py-2 text-xs font-normal text-slate-700/75">
            {unit.prerequisiteText ?? "Conclua a unidade anterior para desbloquear."}
          </p>
        ) : null}
      </header>

      <div className="relative">
        <TrailPath
          nodes={unit.nodes}
          onNodeClick={(node) => {
            onLessonClick(node.lessonId, node.type);
          }}
        />
      </div>
    </section>
  );
}

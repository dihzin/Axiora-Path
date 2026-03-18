"use client";

import { type KeyboardEvent, useRef } from "react";

import type { AprenderSubjectOption } from "@/lib/api/client";
import { TopStatsBar } from "@/components/trail/TopStatsBar";
import { BrainIcon } from "@/components/ui/icons/BrainIcon";
import { axioraMotionClasses } from "@/theme/motion";
import { cn } from "@/lib/utils";

type SubjectSelectorProps = {
  streak: number;
  gems: number;
  xp: number;
  xpTotal?: number;
  energyCurrent?: number;
  energyMax?: number;
  notificationCount?: number;
  isLoading?: boolean;
  selectedSubjectName: string;
  subjects: AprenderSubjectOption[];
  selectedSubjectId: number | null;
  pathSubjectId?: number | null;
  density?: "regular" | "dense";
  className?: string;
  onSelectSubject: (subjectId: number) => void;
};

function normalizeSubjectName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

const getSubjectTextColor = (isActive: boolean) => {
  if (isActive) return "text-[var(--axiora-energy)]";
  return "text-[var(--axiora-text-secondary)]";
}

export function SubjectSelector({
  streak,
  gems,
  xp,
  xpTotal = 0,
  energyCurrent = -1,
  energyMax = 10,
  notificationCount = 0,
  isLoading = false,
  selectedSubjectName,
  subjects,
  selectedSubjectId,
  pathSubjectId,
  density = "regular",
  className,
  onSelectSubject,
}: SubjectSelectorProps) {
  const chipRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const dense = density === "dense";

  const selectedIndex = subjects.findIndex((subject) => {
    return (
      normalizeSubjectName(subject.name) === normalizeSubjectName(selectedSubjectName) ||
      subject.id === (selectedSubjectId ?? pathSubjectId ?? null)
    );
  });

  const onChipKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (subjects.length <= 1) return;
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (index + direction + subjects.length) % subjects.length;
    const nextSubject = subjects[nextIndex];
    if (!nextSubject) return;
    onSelectSubject(nextSubject.id);
    chipRefs.current[nextIndex]?.focus();
  };

  return (
    <div className="relative z-50">
      <div className="lg:hidden">
        <TopStatsBar streak={streak} gems={gems} xp={xp} energyCurrent={energyCurrent} energyMax={energyMax} isLoading={isLoading} className={className} />
      </div>
      <div className="hidden lg:block">
        <TopStatsBar streak={streak} gems={gems} xp={xp} xpTotal={xpTotal} energyCurrent={energyCurrent} energyMax={energyMax} notificationCount={notificationCount} isLoading={isLoading} variant="global" density={density} className={className} />
      </div>
      <div className={cn("overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", dense ? "mt-1.5" : "mt-2.5")}>
        <div className={cn("flex min-w-full items-center", dense ? "gap-1.5" : "gap-2.5")} role="tablist" aria-label="Selecionar matéria">
          {subjects.length === 0 ? (
            <p className="px-2 text-[12px] font-medium text-slate-300/60">Sem matérias</p>
          ) : (
            subjects.map((subject, index) => {
              const activeSubject =
                normalizeSubjectName(subject.name) === normalizeSubjectName(selectedSubjectName) ||
                subject.id === (selectedSubjectId ?? pathSubjectId ?? null);
              return (
                <button
                  key={subject.id}
                  ref={(element) => {
                    chipRefs.current[index] = element;
                  }}
                  type="button"
                  role="tab"
                  aria-selected={activeSubject}
                  tabIndex={activeSubject || (selectedIndex < 0 && index === 0) ? 0 : -1}
                  onClick={() => onSelectSubject(subject.id)}
                  onKeyDown={(event) => onChipKeyDown(event, index)}
                  className={`axiora-hover-magic inline-flex shrink-0 items-center rounded-full border font-semibold leading-none tracking-[-0.01em] shadow-[0_8px_14px_rgba(5,12,24,0.24),inset_0_1px_0_rgba(255,255,255,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8A63] focus-visible:ring-offset-2 ${dense ? "h-[28px] gap-1 px-2.5 text-[11px]" : "h-[36px] gap-2 px-4 text-[13px]"} ${axioraMotionClasses.interactive} ${
                    activeSubject
                      ? "border-[#9DD2F0]/28 bg-[linear-gradient(180deg,rgba(58,110,155,0.9),rgba(36,72,104,0.94))] text-white/95"
                      : "border-[#8EC7E6]/20 bg-[linear-gradient(180deg,rgba(18,48,72,0.9),rgba(13,34,52,0.9))] text-slate-100/90 hover:text-white"
                  }`}
                >
                  <span
                    className={`inline-flex items-center justify-center rounded-[9px] bg-white/80 ${dense ? "h-4 w-4" : "h-5 w-5"} ${getSubjectTextColor(activeSubject)}`}
                  >
                    <BrainIcon className={dense ? "h-2.5 w-2.5" : "h-3.5 w-3.5"} />
                  </span>
                  <span className={cn("truncate", dense && "max-w-[108px]")}>{subject.name}</span>
                </button>
              );
            })
          )}
        </div>
        {null}
      </div>
    </div>
  );
}

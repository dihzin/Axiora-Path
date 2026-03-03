"use client";

import { type KeyboardEvent, useRef } from "react";

import type { AprenderSubjectOption } from "@/lib/api/client";
import { TopStatsBar } from "@/components/trail/TopStatsBar";
import { BrainIcon } from "@/components/ui/icons/BrainIcon";
import { axioraMotionClasses } from "@/theme/motion";

type SubjectSelectorProps = {
  streak: number;
  gems: number;
  xp: number;
  selectedSubjectName: string;
  subjects: AprenderSubjectOption[];
  selectedSubjectId: number | null;
  pathSubjectId?: number | null;
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

const getSubjectTextColor = (normalized: string, isActive: boolean) => {
  void normalized;
  if (isActive) return "text-[var(--axiora-energy)]";
  return "text-[var(--axiora-text-secondary)]";
}

export function SubjectSelector({
  streak,
  gems,
  xp,
  selectedSubjectName,
  subjects,
  selectedSubjectId,
  pathSubjectId,
  className,
  onSelectSubject,
}: SubjectSelectorProps) {
  const chipRefs = useRef<Array<HTMLButtonElement | null>>([]);

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
      <TopStatsBar streak={streak} gems={gems} xp={xp} className={className} />
      <div className="mt-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex min-w-full items-center gap-2" role="tablist" aria-label="Selecionar matéria">
          {subjects.length === 0 ? (
            <p className="px-2 text-sm font-semibold text-[#5C5C5C]">Sem matérias</p>
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
                  className={`axiora-hover-magic inline-flex h-11 shrink-0 items-center gap-2 rounded-[24px_16px_22px_14px] px-3.5 text-sm font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8A63] focus-visible:ring-offset-2 ${axioraMotionClasses.interactive} ${
                    activeSubject
                      ? "bg-[linear-gradient(135deg,#FF6B3D_0%,#FF8A63_100%)] text-white shadow-[0_8px_14px_rgba(255,107,61,0.24)]"
                      : "bg-[#FFEDE5] text-[#2B2F42] hover:bg-[#FFE1D5]"
                  }`}
                >
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-[10px] bg-white/80 ${getSubjectTextColor(
                      normalizeSubjectName(subject.name),
                      activeSubject,
                    )}`}
                  >
                    <BrainIcon className="h-4 w-4" />
                  </span>
                  <span className="truncate">{subject.name}</span>
                </button>
              );
            })
          )}
        </div>
        {subjects.length === 1 ? (
          <p className="mt-1 px-1 text-xs font-semibold text-[#7A6E68]">Sem outras matérias disponíveis para troca.</p>
        ) : null}
      </div>
    </div>
  );
}

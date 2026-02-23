"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen } from "lucide-react";

import type { AprenderSubjectOption } from "@/lib/api/client";
import { TopStatsBar } from "@/components/trail/TopStatsBar";

type SubjectSelectorProps = {
  streak: number;
  gems: number;
  xp: number;
  selectedSubjectName: string;
  subjects: AprenderSubjectOption[];
  selectedSubjectId: number | null;
  pathSubjectId?: number | null;
  className?: string;
  menuClassName?: string;
  onSelectSubject: (subjectId: number) => void;
};

function normalizeSubjectName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
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
  menuClassName = "w-[220px] md:w-[280px]",
  onSelectSubject,
}: SubjectSelectorProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      if (!rootRef.current) return;
      const target = event.target as Node;
      if (!rootRef.current.contains(target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <TopStatsBar
        streak={streak}
        gems={gems}
        xp={xp}
        className={className}
        action={
          <button
            type="button"
            aria-label="Selecionar matéria"
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-controls="subject-selector-listbox"
            onClick={() => setOpen((prev) => !prev)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#DCE6F5] bg-[#F9FBFF] text-[#4E6992] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] transition-colors hover:bg-[#F4F8FF]"
          >
            <BookOpen className="h-[18px] w-[18px]" />
          </button>
        }
      />
      {open ? (
        <div className={`absolute right-0 top-[58px] z-40 overflow-hidden rounded-2xl border border-[#DCE5F3] bg-white shadow-[0_12px_28px_rgba(0,0,0,0.16)] ${menuClassName}`}>
          <div className="border-b border-[#EDF2FA] px-3 py-2 text-[11px] font-black uppercase tracking-[0.06em] text-[#6A7E9D]">
            {selectedSubjectName}
          </div>
          <div id="subject-selector-listbox" role="listbox" className="max-h-56 overflow-y-auto py-1">
            {subjects.length === 0 ? (
              <p className="px-3 py-2 text-sm font-semibold text-[#7A8DAA]">Sem matérias</p>
            ) : (
              subjects.map((subject) => {
                const activeSubject =
                  normalizeSubjectName(subject.name) === normalizeSubjectName(selectedSubjectName) ||
                  subject.id === (selectedSubjectId ?? pathSubjectId ?? null);
                return (
                  <button
                    key={subject.id}
                    type="button"
                    role="option"
                    aria-selected={activeSubject}
                    onClick={() => {
                      setOpen(false);
                      onSelectSubject(subject.id);
                    }}
                    className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-sm font-bold ${
                      activeSubject ? "bg-[#EAF6F3] text-[#1B7C74]" : "text-[#304B72] hover:bg-[#F4F8FF]"
                    }`}
                  >
                    <span className="truncate">{subject.name}</span>
                    {activeSubject ? <span className="text-[#1FA594]">✓</span> : null}
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

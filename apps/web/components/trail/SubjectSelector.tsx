"use client";

import { type KeyboardEvent, type ComponentType, useRef } from "react";
import {
  Atom,
  BookOpen,
  BrainCircuit,
  Calculator,
  Code2,
  FlaskConical,
  Globe2,
  Landmark,
  Languages,
  Palette,
  PenSquare,
  PiggyBank,
  Sparkles,
} from "lucide-react";

import type { AprenderSubjectOption } from "@/lib/api/client";
import { TopStatsBar } from "@/components/trail/TopStatsBar";
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

const subjectIconMap: Array<{ match: string[]; icon: ComponentType<{ className?: string }> }> = [
  { match: ["matematica"], icon: Calculator },
  { match: ["portugues", "redacao"], icon: PenSquare },
  { match: ["ingles"], icon: Languages },
  { match: ["historia"], icon: Landmark },
  { match: ["geografia"], icon: Globe2 },
  { match: ["ciencias"], icon: FlaskConical },
  { match: ["fisica"], icon: Atom },
  { match: ["quimica"], icon: FlaskConical },
  { match: ["filosofia"], icon: BrainCircuit },
  { match: ["artes"], icon: Palette },
  { match: ["educacao financeira"], icon: PiggyBank },
  { match: ["logica"], icon: Sparkles },
  { match: ["programacao"], icon: Code2 },
];

function resolveSubjectIcon(subjectName: string): ComponentType<{ className?: string }> {
  const normalized = normalizeSubjectName(subjectName);
  return subjectIconMap.find((entry) => entry.match.some((token) => normalized.includes(token)))?.icon ?? BookOpen;
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
        <TopStatsBar
          streak={streak}
          gems={gems}
          xp={xp}
          xpTotal={xpTotal}
          energyCurrent={energyCurrent}
          energyMax={energyMax}
          notificationCount={notificationCount}
          isLoading={isLoading}
          variant="global"
          density={density}
          className={className}
        />
      </div>
      <div className={cn("w-full overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", dense ? "mt-1" : "mt-1.5")}>
        <div
          className={cn(
            "flex w-max min-w-full items-center",
            subjects.length > 1 ? "justify-between" : "justify-start",
            dense ? "gap-0.5 py-0.5" : "gap-0.75 py-0.5",
          )}
          role="tablist"
          aria-label="Selecionar materia"
        >
          {subjects.length === 0 ? (
            <p className="px-2 text-[12px] font-medium text-[#8E7C69]">Sem materias</p>
          ) : (
            subjects.map((subject, index) => {
              const activeSubject =
                normalizeSubjectName(subject.name) === normalizeSubjectName(selectedSubjectName) ||
                subject.id === (selectedSubjectId ?? pathSubjectId ?? null);
              const SubjectIcon = resolveSubjectIcon(subject.name);
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
                  className={cn(
                    "axiora-hover-magic inline-flex shrink-0 items-center border-b-2 border-transparent leading-none tracking-[-0.01em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8A63] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
                    dense ? "h-[28px] gap-1.5 px-1.5 text-[12px] font-bold" : "h-[34px] gap-1.5 px-2.5 text-[13px] font-bold",
                    axioraMotionClasses.interactive,
                    activeSubject
                      ? "border-b-[#F2B94B] text-[#FFF7EC]"
                      : "text-[#E8E2D7] hover:border-b-white/20 hover:text-[#FFF7EC]",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex items-center justify-center rounded-[10px] transition-colors",
                      dense ? "h-4 w-4" : "h-4.5 w-4.5",
                      activeSubject ? "bg-[rgba(255,248,235,0.18)] text-[#FFD37A]" : "bg-transparent text-[#F5EDE0]",
                    )}
                  >
                    <SubjectIcon className={dense ? "h-2.5 w-2.5" : "h-2.75 w-2.75"} />
                  </span>
                  <span className="whitespace-nowrap">{subject.name}</span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

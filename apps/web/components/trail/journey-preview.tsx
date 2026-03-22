"use client";

import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Route, Sparkles } from "lucide-react";

import type { LearningPathNode, LearningPathResponse } from "@/lib/api/client";
import { cn } from "@/lib/utils";

type JourneyPreviewProps = {
  learningPath: LearningPathResponse | null;
  subjectOptions?: Array<{ id: number; name: string }>;
  selectedSubjectId?: number | null;
  onChangeSubject?: (subjectId: number) => void;
  loading?: boolean;
  error?: string | null;
  onContinueJourney: () => void;
};

type MiniJourneyNode = {
  id: string;
  title: string;
  subtitle: string;
  status: "done" | "current" | "available" | "locked";
  moduleNumber: number;
};

function buildMiniJourneyNodes(path: LearningPathResponse | null): {
  visibleNodes: MiniJourneyNode[];
  nextObjective: string;
} {
  if (!path) {
    return {
      visibleNodes: [],
      nextObjective: "Conectar jornada",
    };
  }

  const flattened: Array<{ raw: LearningPathNode; node: MiniJourneyNode }> = [];
  for (const unit of path.units) {
    const ordered = [...unit.nodes].sort((a, b) => a.orderIndex - b.orderIndex);
    for (const node of ordered) {
      if (node.kind === "LESSON" && node.lesson) {
        const status: MiniJourneyNode["status"] = node.lesson.completed
          ? "done"
          : node.lesson.unlocked
            ? "available"
            : "locked";
        flattened.push({
          raw: node,
          node: {
            id: `lesson-${node.lesson.id}`,
            title: node.lesson.title,
            subtitle: `Unidade ${unit.order} • Lição ${node.lesson.order}`,
            status,
            moduleNumber: 0,
          },
        });
        continue;
      }
      if (node.kind === "EVENT" && node.event) {
        const status: MiniJourneyNode["status"] =
          node.event.status === "COMPLETED" || node.event.status === "SKIPPED"
            ? "done"
            : node.event.status === "AVAILABLE"
              ? "available"
              : "locked";
        flattened.push({
          raw: node,
          node: {
            id: `event-${node.event.id}`,
            title: node.event.title,
            subtitle: `Unidade ${unit.order} • Evento`,
            status,
            moduleNumber: 0,
          },
        });
      }
    }
  }

  if (flattened.length === 0) {
    return {
      visibleNodes: [],
      nextObjective: "Concluir a primeira missão",
    };
  }

  const currentIndexRaw = flattened.findIndex((entry) => entry.node.status === "available");
  const currentIndex = currentIndexRaw >= 0 ? currentIndexRaw : flattened.findIndex((entry) => entry.node.status !== "done");
  const normalizedCurrentIndex = currentIndex >= 0 ? currentIndex : Math.max(0, flattened.length - 1);
  const withCurrent = flattened.map((entry, index) => {
    const status = index === normalizedCurrentIndex ? "current" : entry.node.status;
    return {
      ...entry.node,
      status,
      moduleNumber: index + 1,
    };
  });

  const visibleNodes = withCurrent.slice(0, 6);
  const nextObjective =
    withCurrent.find((node, index) => index >= normalizedCurrentIndex && node.status !== "done")?.title ?? "Concluir etapa atual";

  return { visibleNodes, nextObjective };
}

export function JourneyPreview({
  learningPath,
  subjectOptions = [],
  selectedSubjectId = null,
  onChangeSubject,
  loading = false,
  error = null,
  onContinueJourney,
}: JourneyPreviewProps) {
  const { visibleNodes, nextObjective } = useMemo(() => buildMiniJourneyNodes(learningPath), [learningPath]);

  return (
    <div className="space-y-3.5">
      {subjectOptions.length > 0 ? (
        <div className="space-y-1.5">
          <p className="axiora-subtitle text-[11px] font-black uppercase tracking-[0.08em]">Matéria</p>
          <div className="grid grid-cols-4 gap-2 md:grid-cols-7">
            {subjectOptions.map((subject) => {
              const active = selectedSubjectId === subject.id;
              return (
                <button
                  key={subject.id}
                  type="button"
                  onClick={() => onChangeSubject?.(subject.id)}
                  className={cn(
                    "inline-flex min-h-[32px] items-center justify-center rounded-[10px] border px-2 py-1 text-center text-[12px] font-black leading-tight tracking-[0.01em] transition-all duration-150",
                    active
                      ? "border-[#FB923C] bg-[linear-gradient(180deg,#FFB170_0%,#FF8A45_100%)] text-white shadow-[0_3px_0_rgba(180,90,45,0.42),0_7px_14px_rgba(18,39,72,0.16)]"
                      : "border-[#D7E0EC] bg-[#FFFFFF] text-[#334155] shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_2px_0_rgba(212,222,236,0.85)] hover:border-[#C4D1E2] hover:bg-[#F8FBFF]",
                  )}
                  title={subject.name}
                >
                  {subject.name}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-3">
        <div className="mb-2.5 flex items-center gap-2">
          <Route className="h-4 w-4 text-[#FB923C]" />
          <p className="axiora-subtitle text-[11px] font-black uppercase tracking-[0.08em]">Trilha ativa</p>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {loading ? (
            <motion.p
              key="journey-loading"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="axiora-subtitle text-[15px]"
            >
              Carregando trilha...
            </motion.p>
          ) : null}
          {!loading && error ? (
            <motion.p
              key="journey-error"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="text-[15px] text-[#B45309]"
            >
              {error}
            </motion.p>
          ) : null}

          {!loading && !error ? (
            <motion.div
              key="journey-content"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="overflow-x-auto pb-1"
            >
              <div className="flex min-w-max items-center gap-2">
                {visibleNodes.length > 0 ? (
                  visibleNodes.map((node, index) => (
                    <div key={node.id} className="relative flex items-center gap-2">
                      <div
                        className={cn(
                          "relative h-9 w-9 rounded-full border-2 text-[11px] font-black",
                          node.status === "done" && "border-[#22C55E] bg-[#DCFCE7] text-[#166534]",
                          node.status === "current" && "border-[#FB923C] bg-[#FFF7ED] text-[#C2410C]",
                          node.status === "available" && "border-[#93C5FD] bg-[#EFF6FF] text-[#1D4ED8]",
                          node.status === "locked" && "border-[#CBD5E1] bg-[#F1F5F9] text-[#64748B]",
                        )}
                      >
                        <div className="flex h-full items-center justify-center">{node.moduleNumber}</div>
                        {node.status === "current" ? (
                          <span className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-[#FED7AA] bg-[#FFF7ED] px-2 py-0.5 text-[10px] font-bold text-[#C2410C]">
                            Você está aqui
                          </span>
                        ) : null}
                      </div>
                      {index < visibleNodes.length - 1 ? (
                        <div
                          className={cn(
                            "h-0.5 w-7 rounded-full",
                            node.status === "done" || node.status === "current" ? "bg-[#FDBA74]" : "bg-[#E5E7EB]",
                          )}
                        />
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="axiora-subtitle text-[15px]">Nenhum node disponível ainda.</p>
                )}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2.5">
        <p className="axiora-subtitle text-[15px] font-semibold">Próximo objetivo</p>
        <p className="axiora-title text-[17px] font-bold">{nextObjective}</p>
      </div>

      <button
        type="button"
        className="axiora-chunky-btn axiora-control-btn--orange inline-flex w-full items-center justify-center gap-2 px-4 py-2 text-[15px] font-extrabold text-white"
        onClick={onContinueJourney}
      >
        <Sparkles className="h-4 w-4" />
        Continuar jornada
      </button>
    </div>
  );
}

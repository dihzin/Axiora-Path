"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { LearningPath } from "@/components/aprender/LearningPath";
import ProgressionMap, { type MapNode, type MapSection } from "@/components/trail/ProgressionMap";
import { SubjectSelector } from "@/components/trail/SubjectSelector";
import { useLearningState } from "@/hooks/useLearningState";
import type { LearningPathLessonNode } from "@/lib/api/client";

type TrailScreenProps = {
  progressionSections?: MapSection[];
  progressionActiveNodeId?: string;
};

function buildSections(pathUnits: NonNullable<ReturnType<typeof useLearningState>["path"]>["units"]): MapSection[] {
  return pathUnits.map((unit) => ({
    id: `unit-${unit.id}`,
    title: unit.title,
    nodes: unit.nodes
      .map((node) => node.lesson)
      .filter((lesson): lesson is LearningPathLessonNode => Boolean(lesson))
      .map((lesson) => ({
        id: `lesson-${lesson.id}`,
        lessonId: lesson.id,
        skill: lesson.skill ?? "unknown",
        difficulty: lesson.difficulty ?? "easy",
        completed: lesson.completed,
        stars: lesson.starsEarned,
        title: lesson.title,
        subtitle:
          lesson.prerequisiteSkill && !lesson.completed
            ? `Exige ${lesson.prerequisiteThreshold ?? 0.6} de dominio em ${lesson.prerequisiteSkill.replace(/_/g, " ")}`
            : `Licao ${lesson.order}`,
        xp: lesson.xpReward,
        status: lesson.completed
          ? "done"
          : lesson.isRecommended
            ? "current"
            : lesson.unlocked
              ? "available"
              : "locked",
      })),
  }));
}

export function TrailScreen({ progressionSections, progressionActiveNodeId }: TrailScreenProps = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSubjectId = useMemo(() => {
    const raw = searchParams.get("subjectId");
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [searchParams]);
  const {
    subjects,
    selectedSubject,
    setSelectedSubjectId,
    path,
    currentLesson,
    nextRecommendation,
    lessonSkillMap,
    loading,
    refreshing,
    error,
    startLesson,
  } = useLearningState({ initialSubjectId });
  const [selectedNode, setSelectedNode] = useState<MapNode | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!selectedSubject) return;
    router.replace(`/child/aprender?subjectId=${selectedSubject.id}`);
  }, [router, selectedSubject]);

  const sections = useMemo(() => {
    if (progressionSections && progressionSections.length > 0) return progressionSections;
    if (!path) return [];
    return buildSections(path.units);
  }, [path, progressionSections]);

  const activeNodeId = useMemo(() => {
    if (progressionActiveNodeId) return progressionActiveNodeId;
    return sections
      .flatMap((section) => section.nodes)
      .find((node) => node.status === "current" || node.status === "available")?.id;
  }, [progressionActiveNodeId, sections]);

  const xpTotal = useMemo(() => {
    if (!path) return 0;
    return path.units
      .flatMap((unit) => unit.nodes)
      .map((node) => node.lesson)
      .filter((lesson): lesson is LearningPathLessonNode => Boolean(lesson))
      .filter((lesson) => lesson.completed)
      .reduce((sum, lesson) => sum + lesson.xpReward, 0);
  }, [path]);

  const currentLessonLabel = currentLesson?.lesson ?? nextRecommendation?.lesson ?? "Sem licao pronta";
  const currentDifficulty = currentLesson?.difficulty ?? nextRecommendation?.difficulty ?? "easy";
  const currentXpReward = currentLesson?.xpReward ?? 0;
  const pathPriority = nextRecommendation?.reason.includes("review")
    ? "review-first"
    : nextRecommendation?.reason.includes("remediation")
      ? "recovery"
      : "advance-first";

  const onSelectSubject = (subjectId: number) => {
    setSelectedSubjectId(subjectId);
    setSelectedNode(null);
  };

  const onLessonPress = async (lesson: LearningPathLessonNode) => {
    const skill = lessonSkillMap[lesson.id];
    if (!skill) return;
    await startLesson(skill);
  };

  const onNodeClick = async (node: MapNode) => {
    setSelectedNode(node);
    const skill = lessonSkillMap[node.lessonId];
    if (!skill || node.status === "locked") return;
    await startLesson(skill);
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(23,54,94,0.18),transparent_35%),linear-gradient(180deg,#f4fbff_0%,#eef6ff_42%,#f8fbff_100%)]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1480px] flex-col gap-6 px-4 py-4 lg:px-6 lg:py-5">
        <SubjectSelector
          streak={path?.streakDays ?? 0}
          gems={0}
          xp={xpTotal}
          selectedSubjectName={selectedSubject?.name ?? "Materia"}
          subjects={subjects}
          selectedSubjectId={selectedSubject?.id ?? null}
          pathSubjectId={path?.subjectId ?? null}
          onSelectSubject={onSelectSubject}
        />

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_420px]">
          <div className="rounded-[32px] border border-white/70 bg-white/80 p-4 shadow-[0_22px_60px_rgba(23,54,94,0.12)] backdrop-blur md:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#6b86a6]">
                  Learn API
                </p>
                <h2 className="font-black text-[#17365E]">
                  {selectedSubject?.name ?? "Trilha de Aprendizado"}
                </h2>
              </div>
              <div className="rounded-full bg-[#eff7ff] px-3 py-1 text-[12px] font-bold text-[#2d79b0]">
                {refreshing ? "Atualizando" : currentDifficulty}
              </div>
            </div>

            {loading ? (
              <div className="flex min-h-[420px] items-center justify-center text-sm font-semibold text-[#6e7f96]">
                Carregando trilha...
              </div>
            ) : sections.length === 0 ? (
              <div className="flex min-h-[420px] items-center justify-center text-sm font-semibold text-[#6e7f96]">
                Nenhuma licao disponivel ainda.
              </div>
            ) : (
              <ProgressionMap
                nodes={sections.flatMap((section) => section.nodes)}
                activeNodeId={selectedNode?.id ?? activeNodeId}
                selectedNodeId={selectedNode?.id ?? activeNodeId}
                onNodeClick={(node) => {
                  void onNodeClick(node);
                }}
                className="min-h-[420px]"
              />
            )}
          </div>

          <aside className="flex flex-col gap-4">
            <div className="rounded-[28px] border border-[#dbe9f8] bg-white/88 p-5 shadow-[0_20px_48px_rgba(23,54,94,0.1)]">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#6b86a6]">
                Licao Atual
              </p>
              <h3 className="mt-2 text-xl font-black text-[#17365E]">{currentLessonLabel}</h3>
              <p className="mt-2 text-sm font-medium text-[#5f7693]">
                {nextRecommendation?.reason
                  ? `Motivo: ${nextRecommendation.reason.replace(/_/g, " ")}`
                  : "A recomendacao do backend define a proxima experiencia."}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-[#f5fbff] px-4 py-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[#7c94b0]">Dificuldade</p>
                  <p className="mt-1 text-base font-black text-[#17365E]">{currentDifficulty}</p>
                </div>
                <div className="rounded-2xl bg-[#f5fbff] px-4 py-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[#7c94b0]">XP</p>
                  <p className="mt-1 text-base font-black text-[#17365E]">{currentXpReward}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  void startLesson(nextRecommendation?.skill);
                }}
                className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-full bg-[#20A090] px-5 text-sm font-black uppercase tracking-[0.06em] text-white shadow-[0_12px_24px_rgba(32,160,144,0.28)] transition hover:brightness-105"
              >
                Iniciar Pela API
              </button>
            </div>

            {error ? (
              <div className="rounded-[24px] border border-[#ffd6cf] bg-[#fff5f3] px-4 py-3 text-sm font-semibold text-[#a14d36]">
                {error}
              </div>
            ) : null}
          </aside>
        </section>

        {path ? (
          <div className="rounded-[32px] border border-white/70 bg-white/82 shadow-[0_22px_60px_rgba(23,54,94,0.12)] backdrop-blur">
            <div className="px-4 pt-4">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#6b86a6]">Progressao</p>
              <h3 className="mt-1 text-lg font-black text-[#17365E]">Mapa guiado pelo backend</h3>
            </div>
            <div ref={scrollRef} className="h-[680px]">
              <LearningPath
                units={path.units}
                dueReviewsCount={path.dueReviewsCount}
                masteryAverage={path.masteryAverage}
                pathPriority={pathPriority}
                learningMode="default"
                onLessonPress={(lesson) => {
                  void onLessonPress(lesson);
                }}
                onEventPress={() => undefined}
                scrollContainerRef={scrollRef}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

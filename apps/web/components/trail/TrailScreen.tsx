"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import type { TrailDomainSectionData, TrailNodeType, TrailUnit } from "@/lib/trail-types";
import { AxionCharacter } from "@/components/axion-character";
import { BottomNav } from "@/components/trail/BottomNav";
import { DesktopNavItem } from "@/components/trail/DesktopNavItem";
import { DailyMissionsPanel } from "@/components/trail/DailyMissionsPanel";
import { DomainSection } from "@/components/trail/DomainSection";
import { HeroMissionCard } from "@/components/trail/HeroMissionCard";
import ProgressionMap, { type MapNode, type MapSection, type NodeStatus } from "@/components/trail/ProgressionMap";
import { SubjectSelector } from "@/components/trail/SubjectSelector";
import { WeeklyGoalCard } from "@/components/trail/WeeklyGoalCard";
import { useMeasuredViewportContainer } from "@/hooks/useMeasuredViewportContainer";
import { cn } from "@/lib/utils";
import type { LearningPathResponse } from "@/lib/api/client";
import { useTrailData, type SubjectAreaLabel } from "@/hooks/useTrailData";

function getDomainData(path: LearningPathResponse, areaLabel: SubjectAreaLabel): TrailDomainSectionData {
  let currentAssigned = false;
  const units: TrailUnit[] = path.units.map((unit) => {
    const lessons = [...unit.nodes]
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((node) => node.lesson)
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    const mappedLessons = lessons.map((lesson) => {
      let type: TrailNodeType = "locked";
      if (lesson.completed) {
        type = "completed";
      } else if (lesson.unlocked && !currentAssigned) {
        type = "current";
        currentAssigned = true;
      } else if (lesson.unlocked && currentAssigned) {
        type = "future";
      } else if (currentAssigned) {
        type = "future";
      }
      return {
        id: `lesson-${lesson.id}`,
        lessonId: lesson.id,
        title: lesson.title,
        order: lesson.order,
        unlocked: lesson.unlocked,
        completed: lesson.completed,
        type,
      };
    });

    const hasUnlockedLesson = mappedLessons.some((item) => item.unlocked);
    const isCompleted = mappedLessons.length > 0 && mappedLessons.every((item) => item.completed);
    const unitLocked = !hasUnlockedLesson && !isCompleted;

    return {
      id: String(unit.id),
      order: unit.order,
      sectionLabel: `UNIDADE ${unit.order}`,
      title: unit.title,
      progress: Math.round(Math.max(0, Math.min(100, unit.completionRate * 100))),
      locked: unitLocked,
      prerequisiteText: unitLocked
        ? unit.description?.trim() || "Conclua a unidade anterior para desbloquear."
        : null,
      nodes: mappedLessons,
    };
  });

  return {
    id: `domain-${path.subjectId}`,
    name: path.subjectName,
    areaLabel,
    units,
  };
}

function buildProgressionSectionsFromPath(path: LearningPathResponse | null): MapSection[] {
  if (!path) return [];

  let currentAssigned = false;
  const sections = path.units.map((unit) => {
    const lessons = [...unit.nodes]
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((node) => node.lesson)
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    const nodes = lessons.map((lesson) => {
      let status: NodeStatus = "locked";
      if (lesson.completed) {
        status = "done";
      } else if (lesson.unlocked && !currentAssigned) {
        status = "current";
        currentAssigned = true;
      }

      return {
        id: `lesson-${lesson.id}`,
        lessonId: lesson.id,
        skill: lesson.skill ?? "unknown",
        difficulty: lesson.difficulty ?? "easy",
        completed: lesson.completed,
        stars: lesson.starsEarned ?? 0,
        title: lesson.title,
        subtitle: `Lição ${lesson.order}`,
        xp: lesson.xpReward ?? 30,
        status,
      } satisfies MapNode;
    });

    return {
      id: `unit-${unit.id}`,
      title: unit.title,
      nodes,
    } satisfies MapSection;
  });

  const currentSection =
    sections.find((section) => section.nodes.some((node) => node.status === "current")) ??
    sections.find((section) => section.nodes.some((node) => node.status !== "done")) ??
    sections[0];

  return currentSection ? [currentSection] : [];
}

type TrailScreenProps = {
  progressionSections?: MapSection[];
  progressionActiveNodeId?: string;
};

export function TrailScreen({ progressionSections, progressionActiveNodeId }: TrailScreenProps = {}) {
  const DESKTOP_LAYOUT_MIN_WIDTH = 1500;
  const router = useRouter();
  const pathname = usePathname();
  const {
    path,
    pathRefreshing,
    error,
    retryPath,
    selectedSubjectId,
    selectedSubjectName,
    visibleSubjects,
    selectedArea,
    onSelectSubject,
    coins,
    xpPercent,
    xpTotal,
    xpLevel,
    xpInLevel,
    xpToNextLevel,
    subjectStreakDays,
    missions,
    missionsLoading,
    claimingMissionId,
    onClaimMission,
    domainCompletion,
    weeklyGoal,
    encouragementText,
  } = useTrailData();

  const [selectedNode, setSelectedNode] = useState<MapNode | null>(null);
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const { width: layoutWidth } = useMeasuredViewportContainer(layoutRef, {
    initialWidth: 1024,
    minWidth: 320,
  });
  const mapViewportRef = useRef<HTMLDivElement | null>(null);
  const { height: mapViewportHeight } = useMeasuredViewportContainer(mapViewportRef, {
    initialHeight: 700,
    minHeight: 1,
  });

  const domainData = useMemo(() => {
    if (!path) return null;
    return getDomainData(path, selectedArea);
  }, [path, selectedArea]);

  const resolvedProgressionSections = useMemo(
    () => (progressionSections && progressionSections.length > 0 ? progressionSections : buildProgressionSectionsFromPath(path)),
    [path, progressionSections],
  );
  const progressionNodes = useMemo(() => resolvedProgressionSections.flatMap((section) => section.nodes), [resolvedProgressionSections]);
  const hasProgressionMap = resolvedProgressionSections.length > 0;
  const resolvedActiveMapNodeId = useMemo(() => {
    if (!hasProgressionMap) return undefined;
    if (progressionActiveNodeId) return progressionActiveNodeId;
    return progressionNodes.find((node) => node.status === "current")?.id;
  }, [hasProgressionMap, progressionActiveNodeId, progressionNodes]);
  const currentMapNode = useMemo(() => {
    if (progressionNodes.length === 0) return null;
    if (resolvedActiveMapNodeId) {
      return progressionNodes.find((node) => node.id === resolvedActiveMapNodeId) ?? progressionNodes[0];
    }
    return progressionNodes.find((node) => node.status === "current") ?? progressionNodes[0];
  }, [progressionNodes, resolvedActiveMapNodeId]);
  const nodeForHeroMission = selectedNode ?? currentMapNode;
  const mapHighlightedNodeId = selectedNode?.id ?? resolvedActiveMapNodeId;
  const isDesktop = layoutWidth >= DESKTOP_LAYOUT_MIN_WIDTH;
  const weeklyRemaining = Math.max(0, weeklyGoal.target - weeklyGoal.completed);
  const compactDesktop = isDesktop && mapViewportHeight <= 700;


  useEffect(() => {
    if (!selectedNode) return;
    if (progressionNodes.some((node) => node.id === selectedNode.id)) return;
    setSelectedNode(null);
  }, [progressionNodes, selectedNode]);

  const openMapNode = useCallback((node: MapNode | null) => {
    if (!node || node.status === "locked") return;
    setSelectedNode(node);
    if (node.id.startsWith("lesson-")) {
      const lessonId = Number(node.id.replace("lesson-", ""));
      if (Number.isFinite(lessonId) && lessonId > 0) {
        const activeSubjectId = selectedSubjectId ?? path?.subjectId ?? null;
        if (activeSubjectId && Number.isFinite(activeSubjectId)) {
          router.push(`/child/aprender/lesson/${lessonId}?subjectId=${activeSubjectId}`);
          return;
        }
        router.push(`/child/aprender/lesson/${lessonId}`);
        return;
      }
    }
    document.getElementById(`map-node-${node.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [path?.subjectId, router, selectedSubjectId]);

  const handleContinueLearning = useCallback(() => {
    if (!resolvedActiveMapNodeId) return;
    document.getElementById(`map-node-${resolvedActiveMapNodeId}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [resolvedActiveMapNodeId]);

  const handleStartMission = useCallback(() => {
    openMapNode(nodeForHeroMission);
  }, [nodeForHeroMission, openMapNode]);

  const onLessonClick = useCallback((lessonId: number, state: TrailNodeType) => {
    if (state === "locked" || state === "future") return;
    const activeSubjectId = selectedSubjectId ?? path?.subjectId ?? null;
    if (activeSubjectId && Number.isFinite(activeSubjectId)) {
      router.push(`/child/aprender/lesson/${lessonId}?subjectId=${activeSubjectId}`);
      return;
    }
    router.push(`/child/aprender/lesson/${lessonId}`);
  }, [path?.subjectId, router, selectedSubjectId]);

  return (
    <div ref={layoutRef} className="relative min-h-screen overflow-hidden bg-transparent lg:flex lg:h-screen lg:min-h-0 lg:min-w-0 lg:flex-col">
      <div className={cn("w-full lg:flex lg:min-h-0 lg:min-w-0 lg:flex-1 lg:overflow-hidden lg:pl-[208px]", !isDesktop && "lg:!pl-0")}>
        <aside className={cn("hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-20 lg:flex lg:w-[208px] lg:flex-col lg:gap-1 lg:border-r lg:border-t lg:border-white/8 lg:border-t-white/8 lg:bg-[linear-gradient(180deg,rgba(6,18,39,0.46)_0%,rgba(4,13,30,0.42)_100%)] lg:backdrop-blur-md lg:px-3 lg:py-5", !isDesktop && "lg:!hidden")}>
          <div className="mb-0.5 flex justify-center">
            <div className="rounded-2xl bg-[#12213D]/80 p-1.5 shadow-[inset_0_1px_12px_rgba(0,0,0,0.35)]">
              <div className="scale-90">
                <AxionCharacter stage={1} moodState="NEUTRAL" reducedMotion={false} />
              </div>
            </div>
          </div>
          <DesktopNavItem href="/child" active={pathname === "/child"} iconName="inicio" label="Início" />
          <DesktopNavItem href="/child/aprender" active={pathname.startsWith("/child/aprender")} iconName="aprender" label="Aprender" />
          <DesktopNavItem href="/child/stickers" active={pathname.startsWith("/child/stickers")} iconName="figurinhas" label="Figurinhas" />
          <DesktopNavItem href="/child/games" active={pathname.startsWith("/child/games")} iconName="jogos" label="Jogos" />
          <DesktopNavItem href="/child/store" active={pathname.startsWith("/child/store")} iconName="loja" label="Loja" />
          <DesktopNavItem href="/child/axion" active={pathname.startsWith("/child/axion")} iconName="axion" label="Axion" />
        </aside>

        <div className="mx-auto w-full lg:flex lg:h-full lg:min-h-0 lg:min-w-0 lg:flex-1 lg:max-w-[1680px] lg:px-6 xl:max-w-[1840px] xl:px-8 2xl:max-w-[1960px] 2xl:px-10">
          <div className="mx-auto flex w-full max-w-sm flex-col pb-24 pt-1 md:max-w-4xl md:pb-8 lg:h-full lg:max-w-[1620px] lg:min-h-0 lg:min-w-0 lg:flex-1 lg:overflow-hidden lg:pb-0 lg:pt-4 xl:max-w-[1760px] 2xl:max-w-[1880px]">
            <div className="mx-auto flex w-full max-w-[760px] flex-col px-4 sm:px-6 lg:min-h-0 lg:min-w-0 lg:flex-1 lg:max-w-none lg:px-2">
              <header className="relative z-50 space-y-2 bg-[rgba(15,23,42,0.08)] pb-2 [backdrop-filter:blur(2px)] lg:flex-none lg:space-y-2 lg:bg-transparent lg:pb-2">
                <div className="motion-safe:animate-[fade-in-up_280ms_ease-out]">
                  <SubjectSelector
                    streak={subjectStreakDays}
                    gems={coins}
                    xp={xpPercent}
                    selectedSubjectName={selectedSubjectName}
                    subjects={visibleSubjects}
                    selectedSubjectId={selectedSubjectId}
                    pathSubjectId={path?.subjectId ?? null}
                    className="w-full"
                    onSelectSubject={onSelectSubject}
                  />
                </div>
                {path ? (
                  <div className="flex items-center gap-4 text-xs font-medium text-slate-300">
                    <span className="flex items-center gap-1">
                      <span aria-hidden>🔥</span>
                      {weeklyRemaining} missões restantes esta semana
                    </span>
                  </div>
                ) : null}
              </header>

              <main className={cn("lg:flex lg:min-h-0 lg:min-w-0 lg:flex-1 lg:overflow-hidden lg:pt-1", !isDesktop && "lg:!overflow-visible")}>
                {path && <div className={cn("flex w-full min-w-0 flex-col gap-5 lg:flex-1 lg:min-h-0 lg:min-w-0", compactDesktop ? "lg:gap-4" : "lg:gap-5")}>
                    {hasProgressionMap ? (
                      // Single responsive layout: CSS grid on desktop, flex column on mobile.
                        // ProgressionMap stays mounted across screen changes — no unmount/remount on resize.
                        // Height is CSS-driven (lg:flex-1) — ResizeObserver on mapViewportRef reads the actual
                        // rendered height so ProgressionMap always gets the correct viewportHeight.
                        <section className="relative w-full motion-safe:animate-[fade-in-up_340ms_ease-out] lg:flex-1 lg:min-h-0">
                          <div
                            aria-hidden
                            className="pointer-events-none absolute inset-0 -z-10 rounded-[40px]"
                            style={{
                              background:
                                "radial-gradient(ellipse at 38% 22%, rgba(103,232,249,0.14), rgba(37,99,235,0.08) 34%, rgba(2,6,23,0) 72%), radial-gradient(ellipse at 78% 86%, rgba(250,204,21,0.08), transparent 22%)",
                              filter: "blur(22px)",
                            }}
                          />
                          <div className={cn("relative z-10 flex flex-col gap-5 lg:grid lg:h-full lg:min-h-0 lg:min-w-0 lg:grid-cols-[minmax(0,1fr)_minmax(280px,32vw)] xl:grid-cols-[minmax(0,1fr)_368px]", !isDesktop && "lg:!grid-cols-1")}>
                            <div
                              ref={mapViewportRef}
                              className={cn("relative h-[700px] min-w-0 overflow-hidden lg:h-full lg:min-h-0 lg:min-w-0", !isDesktop && "lg:!h-[700px]")}
                            >
                              <ProgressionMap
                                nodes={progressionNodes}
                                activeNodeId={resolvedActiveMapNodeId}
                                selectedNodeId={mapHighlightedNodeId}
                                onNodeClick={openMapNode}
                                viewportHeight={mapViewportHeight}
                                className="mx-auto w-full max-w-none"
                              />
                            </div>
                            <div className={cn("flex min-w-0 flex-col gap-4 lg:min-h-0 lg:min-w-0 lg:gap-3 lg:overflow-hidden", !isDesktop && "lg:!overflow-visible")}>
                              <HeroMissionCard
                                className="max-w-none"
                                compact={isDesktop || compactDesktop}
                                subjectName={selectedSubjectName}
                                areaLabel={selectedArea}
                                streakDays={subjectStreakDays}
                                medalTier={domainCompletion.medal}
                                completionPercent={domainCompletion.completionPercent}
                                xpTotal={xpTotal}
                                level={xpLevel}
                                xpPercent={xpPercent}
                                xpInLevel={xpInLevel}
                                xpToNextLevel={xpToNextLevel}
                                currentMission={{
                                  title: nodeForHeroMission?.title ?? "Adição no Cotidiano",
                                  xp: nodeForHeroMission?.xp ?? 30,
                                }}
                                encouragementText={encouragementText}
                                onContinue={handleContinueLearning}
                                onStartMission={handleStartMission}
                              />
                              <WeeklyGoalCard
                                compact={isDesktop || compactDesktop}
                                completed={weeklyGoal.completed}
                                target={weeklyGoal.target}
                                weekLabel={weeklyGoal.weekLabel}
                              />
                              <div className="lg:min-h-0 lg:flex-1 lg:overflow-auto lg:pr-1">
                                <DailyMissionsPanel
                                  compact={isDesktop || compactDesktop}
                                  missions={missions}
                                  missionsLoading={missionsLoading}
                                  claimingMissionId={claimingMissionId}
                                  onClaimMission={(missionId) => void onClaimMission(missionId)}
                                />
                              </div>
                            </div>
                          </div>
                        </section>
                    ) : (
                      <div className="w-full motion-safe:animate-[fade-in-up_340ms_ease-out]">
                        <HeroMissionCard
                          className="max-w-none"
                          compact={compactDesktop}
                          subjectName={selectedSubjectName}
                          areaLabel={selectedArea}
                          streakDays={subjectStreakDays}
                          medalTier={domainCompletion.medal}
                          completionPercent={domainCompletion.completionPercent}
                          xpTotal={xpTotal}
                          level={xpLevel}
                          xpPercent={xpPercent}
                          xpInLevel={xpInLevel}
                          xpToNextLevel={xpToNextLevel}
                          currentMission={{
                            title: nodeForHeroMission?.title ?? "Adição no Cotidiano",
                            xp: nodeForHeroMission?.xp ?? 30,
                          }}
                          encouragementText={encouragementText}
                          onContinue={handleContinueLearning}
                          onStartMission={handleStartMission}
                        />
                      </div>
                    )}
                  </div>}
                {/* aria-live region: announces loading/error state changes to screen readers */}
                <div aria-live="polite" aria-atomic="true" className="sr-only">
                  {pathRefreshing ? "Atualizando trilha de aprendizado..." : ""}
                  {error ? `Erro: ${error}` : ""}
                </div>

                {pathRefreshing ? (
                  <div
                    aria-hidden
                    className="mt-4 inline-flex items-center rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-semibold uppercase tracking-[0.04em] text-slate-200/80"
                  >
                    Atualizando...
                  </div>
                ) : null}
                {error ? (
                  <div role="alert" className="mt-6 rounded-2xl border border-black/5 bg-[#F1EAE3] p-3">
                    <p className="text-sm font-semibold text-slate-700/85">{error}</p>
                    <button
                      type="button"
                      className="mt-2 inline-flex rounded-xl border border-black/5 bg-[#E8DFD6] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.04em] text-slate-700/80 transition-colors hover:bg-[#DFD4CA]"
                      onClick={retryPath}
                    >
                      Tentar novamente
                    </button>
                  </div>
                ) : null}
                {!hasProgressionMap && domainData ? (
                  <div className="pt-4">
                    <DomainSection
                      domain={domainData}
                      onLessonClick={onLessonClick}
                    />
                  </div>
                ) : null}
              </main>
            </div>
          </div>
        </div>
      </div>
      <BottomNav forceMobile={!isDesktop} />

    </div>
  );
}

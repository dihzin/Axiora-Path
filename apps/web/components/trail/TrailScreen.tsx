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
import { cn } from "@/lib/utils";
import type { LearningPathResponse } from "@/lib/api/client";
import { useIsDesktop } from "@/hooks/useIsDesktop";
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
  const router = useRouter();
  const pathname = usePathname();
  const {
    path,
    loading,
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
  const [desktopStageHeight, setDesktopStageHeight] = useState(760);
  const headerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateDesktopViewport = () => {
      const isDesktopVp = window.matchMedia("(min-width: 1024px)").matches;
      if (!isDesktopVp) {
        setDesktopStageHeight(760);
        return;
      }
      const headerHeight = headerRef.current?.getBoundingClientRect().height ?? 92;
      const chromeAllowance = 28;
      const nextHeight = Math.max(540, Math.round(window.innerHeight - headerHeight - chromeAllowance));
      setDesktopStageHeight(nextHeight);
    };
    const frame = window.requestAnimationFrame(updateDesktopViewport);
    window.addEventListener("resize", updateDesktopViewport);
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && headerRef.current) {
      observer = new ResizeObserver(() => updateDesktopViewport());
      observer.observe(headerRef.current);
    }
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateDesktopViewport);
      observer?.disconnect();
    };
  }, []);

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
  const isDesktop = useIsDesktop();
  const weeklyRemaining = Math.max(0, weeklyGoal.target - weeklyGoal.completed);
  const compactDesktop = desktopStageHeight <= 700;
  const progressionViewportHeight = hasProgressionMap ? desktopStageHeight - 8 : 980;
  const initialPathLoading = loading && !path;

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
    <div className="relative overflow-hidden min-h-screen bg-transparent lg:h-screen">
      <div className="w-full lg:h-screen lg:overflow-hidden lg:pl-[208px]">
        <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-20 lg:flex lg:w-[208px] lg:flex-col lg:gap-1 lg:border-r lg:border-t lg:border-white/8 lg:border-t-white/8 lg:bg-[linear-gradient(180deg,rgba(6,18,39,0.46)_0%,rgba(4,13,30,0.42)_100%)] lg:backdrop-blur-md lg:px-3 lg:py-5">
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

        <div className="mx-auto w-full lg:h-screen lg:max-w-[1680px] lg:px-6 xl:max-w-[1840px] xl:px-8 2xl:max-w-[1960px] 2xl:px-10">
          <div className="mx-auto w-full max-w-sm pb-24 pt-1 md:max-w-4xl md:pb-8 lg:flex lg:h-screen lg:max-w-[1620px] lg:flex-col lg:overflow-hidden lg:pb-0 lg:pt-4 xl:max-w-[1760px] 2xl:max-w-[1880px]">
            <div className="mx-auto w-full max-w-[760px] px-4 sm:px-6 lg:max-w-none lg:px-2">
              <header ref={headerRef} className="relative z-50 space-y-2 bg-[rgba(15,23,42,0.08)] pb-2 [backdrop-filter:blur(2px)] lg:flex-none lg:space-y-2 lg:bg-transparent lg:pb-2">
                {initialPathLoading ? (
                  <div className="space-y-2">
                    <div className="h-[38px] w-full animate-pulse rounded-full border border-white/8 bg-[linear-gradient(180deg,rgba(14,24,52,0.82),rgba(10,19,42,0.76))]" />
                    <div className="h-4 w-48 animate-pulse rounded-full bg-white/10" />
                  </div>
                ) : (
                  <>
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
                    <div className="flex items-center gap-4 text-xs font-medium text-slate-300">
                      <span className="flex items-center gap-1">
                        <span aria-hidden>🔥</span>
                        {weeklyRemaining} missões restantes esta semana
                      </span>
                    </div>
                  </>
                )}
              </header>

              <main className="lg:flex lg:min-h-0 lg:flex-1 lg:overflow-hidden lg:pt-1">
                {initialPathLoading ? (
                  <section className="relative w-full">
                    <div className="hidden lg:grid lg:grid-cols-[minmax(0,1fr)_368px] lg:gap-5" style={{ height: `${desktopStageHeight}px` }}>
                      <div className="overflow-hidden rounded-[34px] border border-white/8 bg-[linear-gradient(180deg,rgba(10,22,48,0.82),rgba(9,20,43,0.74))]">
                        <div className="h-full w-full animate-pulse bg-[radial-gradient(ellipse_at_50%_35%,rgba(96,165,250,0.22),rgba(37,99,235,0.08)_36%,rgba(2,6,23,0)_72%)]" />
                      </div>
                      <div className="flex min-h-0 flex-col gap-3">
                        <div className="h-[292px] animate-pulse rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(14,24,52,0.84),rgba(10,19,42,0.8))]" />
                        <div className="h-[148px] animate-pulse rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(14,24,52,0.82),rgba(10,19,42,0.76))]" />
                        <div className="flex-1 animate-pulse rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(14,24,52,0.8),rgba(10,19,42,0.74))]" />
                      </div>
                    </div>
                    <div className="space-y-4 lg:hidden">
                      <div className="h-[360px] animate-pulse rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(10,22,48,0.82),rgba(9,20,43,0.74))]" />
                      <div className="h-[220px] animate-pulse rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(14,24,52,0.84),rgba(10,19,42,0.8))]" />
                    </div>
                  </section>
                ) : (
                  <div className={cn("flex w-full flex-col gap-5", compactDesktop ? "lg:gap-4" : "lg:gap-5")}>
                    {hasProgressionMap ? (
                      isDesktop ? (
                        // Desktop: single two-column layout — one ProgressionMap + one HeroMissionCard
                        <section
                          className="relative w-full grid h-full min-h-0 grid-cols-[minmax(0,1fr)_368px] gap-5 motion-safe:animate-[fade-in-up_340ms_ease-out]"
                          style={{ height: `${desktopStageHeight}px` }}
                        >
                          <div
                            aria-hidden
                            className="pointer-events-none absolute inset-0 -z-10 rounded-[40px]"
                            style={{
                              background:
                                "radial-gradient(ellipse at 38% 22%, rgba(103,232,249,0.14), rgba(37,99,235,0.08) 34%, rgba(2,6,23,0) 72%), radial-gradient(ellipse at 78% 86%, rgba(250,204,21,0.08), transparent 22%)",
                              filter: "blur(22px)",
                            }}
                          />
                          <div className="relative z-10 min-w-0 min-h-0">
                            <ProgressionMap
                              nodes={progressionNodes}
                              activeNodeId={resolvedActiveMapNodeId}
                              selectedNodeId={mapHighlightedNodeId}
                              onNodeClick={openMapNode}
                              viewportHeight={progressionViewportHeight}
                              className="mx-auto w-full max-w-none"
                            />
                          </div>
                          <div className="relative z-10 flex min-h-0 flex-col gap-3 overflow-hidden">
                            <HeroMissionCard
                              className="max-w-none"
                              compact
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
                              compact
                              completed={weeklyGoal.completed}
                              target={weeklyGoal.target}
                              weekLabel={weeklyGoal.weekLabel}
                            />
                            <div className="min-h-0 flex-1 overflow-auto pr-1">
                              <DailyMissionsPanel
                                compact
                                missions={missions}
                                missionsLoading={missionsLoading}
                                claimingMissionId={claimingMissionId}
                                onClaimMission={(missionId) => void onClaimMission(missionId)}
                              />
                            </div>
                          </div>
                        </section>
                      ) : (
                        // Mobile: stacked — one ProgressionMap + one HeroMissionCard
                        <>
                          <section className="relative isolate w-full motion-safe:animate-[fade-in-up_340ms_ease-out]">
                            <div
                              aria-hidden
                              className="pointer-events-none absolute inset-x-0 top-10 z-0 h-[760px]"
                              style={{
                                background:
                                  "radial-gradient(ellipse at 50% 24%, rgba(103,232,249,0.12), rgba(37,99,235,0.07) 34%, rgba(2,6,23,0) 72%)",
                                filter: "blur(22px)",
                              }}
                            />
                            <div className="relative z-10 w-full">
                              <ProgressionMap
                                nodes={progressionNodes}
                                activeNodeId={resolvedActiveMapNodeId}
                                selectedNodeId={mapHighlightedNodeId}
                                onNodeClick={openMapNode}
                                viewportHeight={980}
                                className="mx-auto w-full max-w-[1560px]"
                              />
                            </div>
                          </section>

                          <section className="relative w-full motion-safe:animate-[fade-in-up_380ms_ease-out]">
                            <div
                              aria-hidden
                              className="pointer-events-none absolute inset-0 -z-10 rounded-[40px] opacity-80"
                              style={{
                                background:
                                  "radial-gradient(ellipse at 18% 14%, rgba(103,232,249,0.1), transparent 28%), radial-gradient(ellipse at 82% 80%, rgba(250,204,21,0.08), transparent 24%)",
                                filter: "blur(18px)",
                              }}
                            />
                            <div className="grid gap-4">
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
                              <DailyMissionsPanel
                                className="h-full"
                                compact={compactDesktop}
                                missions={missions}
                                missionsLoading={missionsLoading}
                                claimingMissionId={claimingMissionId}
                                onClaimMission={(missionId) => void onClaimMission(missionId)}
                              />
                              <WeeklyGoalCard
                                compact={compactDesktop}
                                completed={weeklyGoal.completed}
                                target={weeklyGoal.target}
                                weekLabel={weeklyGoal.weekLabel}
                              />
                            </div>
                          </section>
                        </>
                      )
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
                  </div>
                )}
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
      <BottomNav />

    </div>
  );
}


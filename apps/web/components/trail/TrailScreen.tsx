"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { TrailDomainSectionData, TrailNodeType, TrailUnit } from "@/lib/trail-types";
import { AxionCharacter } from "@/components/axion-character";
import { ChildNavIcon, type ChildNavIconKey } from "@/components/child-bottom-nav";
import { BottomNav } from "@/components/trail/BottomNav";
import { DailyMissionsPanel } from "@/components/trail/DailyMissionsPanel";
import { DomainSection } from "@/components/trail/DomainSection";
import { HeroMissionCard } from "@/components/trail/HeroMissionCard";
import ProgressionMap, { type MapNode, type MapSection } from "@/components/trail/ProgressionMap";
import { SubjectSelector } from "@/components/trail/SubjectSelector";
import { WeeklyGoalCard } from "@/components/trail/WeeklyGoalCard";
import {
  ApiError,
  claimMission,
  getApiErrorMessage,
  getAprenderLearningStreak,
  getAprenderLearningProfile,
  getAprenderSubjects,
  getCurrentMissions,
  getLearningInsights,
  getLearningPath,
  type AprenderSubjectOption,
  type LearningInsightsResponse,
  type LearningPathResponse,
  type MissionsCurrentResponse,
} from "@/lib/api/client";
import { resolveDomainCompletion, resolveWeeklyGoalProgress } from "@/lib/gamification-derivations";
import { readRecentLearningReward } from "@/lib/learning/reward-cache";

const AREA_LABELS = ["Exatas", "Humanas", "Linguagens"] as const;
type SubjectAreaLabel = (typeof AREA_LABELS)[number];
// Keep explicit subject vocabulary visible in this module to guarantee UI/domain sync checks.
const SUBJECT_VOCABULARY_CANONICAL = [
  "matematica",
  "portugues",
  "ingles",
  "historia",
  "geografia",
  "ciencias",
  "fisica",
  "quimica",
  "filosofia",
  "artes",
  "educacao financeira",
  "logica",
  "programacao basica",
  "redacao",
] as const;

function normalizeSubjectName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function resolveSubjectStorageKey(): string {
  if (typeof window === "undefined") return "axiora_learning_selected_subject:anonymous";
  const rawChildId = window.localStorage.getItem("axiora_child_id");
  const childId = rawChildId ? Number(rawChildId) : NaN;
  const scope = Number.isFinite(childId) && childId > 0 ? String(childId) : "anonymous";
  return `axiora_learning_selected_subject:${scope}`;
}

function resolvePathCacheKey(subjectId: number | null): string {
  return `axiora_learning_path_cache:${subjectId ?? "default"}`;
}

function distributeSubjectsByArea(subjects: AprenderSubjectOption[], currentSubjectId: number | null): Record<SubjectAreaLabel, AprenderSubjectOption[]> {
  const sorted = [...subjects].sort((a, b) => a.order - b.order || a.id - b.id);
  if (sorted.length === 0) {
    return { Exatas: [], Humanas: [], Linguagens: [] };
  }

  const currentIndex = sorted.findIndex((item) => item.id === currentSubjectId);
  const pivot = currentIndex >= 0 ? currentIndex : 0;
  const rotated = [...sorted.slice(pivot), ...sorted.slice(0, pivot)];

  const base = Math.floor(rotated.length / AREA_LABELS.length);
  const remainder = rotated.length % AREA_LABELS.length;
  const chunks: AprenderSubjectOption[][] = [];
  let offset = 0;
  for (let i = 0; i < AREA_LABELS.length; i += 1) {
    const size = base + (i < remainder ? 1 : 0);
    chunks.push(rotated.slice(offset, offset + size));
    offset += size;
  }

  return {
    Exatas: chunks[0] ?? [],
    Humanas: chunks[1] ?? [],
    Linguagens: chunks[2] ?? [],
  };
}

function resolveAreaForSubject(
  grouped: Record<SubjectAreaLabel, AprenderSubjectOption[]>,
  subjectId: number | null,
): SubjectAreaLabel {
  if (subjectId !== null) {
    for (const area of AREA_LABELS) {
      if (grouped[area].some((item) => item.id === subjectId)) return area;
    }
  }
  for (const area of AREA_LABELS) {
    if (grouped[area].length > 0) return area;
  }
  return "Exatas";
}

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

type TrailScreenProps = {
  progressionSections?: MapSection[];
  progressionActiveNodeId?: string;
};

export function TrailScreen({ progressionSections, progressionActiveNodeId }: TrailScreenProps = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [path, setPath] = useState<LearningPathResponse | null>(null);
  const [subjects, setSubjects] = useState<AprenderSubjectOption[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(resolveSubjectStorageKey());
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  });
  const [selectedArea, setSelectedArea] = useState<SubjectAreaLabel>("Exatas");
  const [coins, setCoins] = useState(0);
  const [xpPercent, setXpPercent] = useState(0);
  const [xpTotal, setXpTotal] = useState(0);
  const [xpLevel, setXpLevel] = useState(1);
  const [xpInLevel, setXpInLevel] = useState(0);
  const [xpToNextLevel, setXpToNextLevel] = useState(100);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pathRefreshing, setPathRefreshing] = useState(false);
  const [insights, setInsights] = useState<LearningInsightsResponse | null>(null);
  const [missions, setMissions] = useState<MissionsCurrentResponse | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [missionsLoading, setMissionsLoading] = useState(true);
  const [claimingMissionId, setClaimingMissionId] = useState<string | null>(null);
  const [subjectStreakDays, setSubjectStreakDays] = useState(0);
  const [selectedNode, setSelectedNode] = useState<MapNode | null>(null);
  const [pathRetryToken, setPathRetryToken] = useState(0);
  const hasLoadedPathRef = useRef(false);

  const completedLessonSignal = searchParams.get("completedLessonId") ?? "";
  const subjectIdFromQueryRaw = searchParams.get("subjectId");
  const subjectIdFromQuery = useMemo(() => {
    const parsed = Number(subjectIdFromQueryRaw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [subjectIdFromQueryRaw]);

  const subjectsForUi = useMemo(() => {
    if (subjects.length > 0) return subjects;
    if (!path) return [];
    return [
      {
        id: path.subjectId,
        name: path.subjectName || "Matéria",
        ageGroup: "9-12",
        order: 1,
      },
    ] as AprenderSubjectOption[];
  }, [path, subjects]);
  const groupedByArea = useMemo(
    () => distributeSubjectsByArea(subjectsForUi, selectedSubjectId),
    [selectedSubjectId, subjectsForUi],
  );
  const visibleSubjects = subjectsForUi;

  useEffect(() => {
    if (subjectIdFromQuery === null) return;
    setSelectedSubjectId((prev) => (prev === subjectIdFromQuery ? prev : subjectIdFromQuery));
  }, [subjectIdFromQuery]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = resolveSubjectStorageKey();
    if (selectedSubjectId === null) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, String(selectedSubjectId));
  }, [selectedSubjectId]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const rawChildId = typeof window !== "undefined" ? window.localStorage.getItem("axiora_child_id") : null;
        const parsedChildId = rawChildId ? Number(rawChildId) : NaN;
        const childId = Number.isFinite(parsedChildId) && parsedChildId > 0 ? parsedChildId : undefined;
        let list: AprenderSubjectOption[] = [];
        try {
          list = await getAprenderSubjects(childId ? { childId } : undefined);
        } catch {
          // Fallback when a stale/invalid child id breaks filtered subject loading.
          list = await getAprenderSubjects();
        }
        if (!active) return;
        setSubjects([...list].sort((a, b) => a.order - b.order || normalizeSubjectName(a.name).localeCompare(normalizeSubjectName(b.name))));
      } catch {
        if (active) setSubjects([]);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (subjectsForUi.length === 0) return;
    const preferredArea = resolveAreaForSubject(groupedByArea, selectedSubjectId);
    setSelectedArea((prev) => (prev === preferredArea ? prev : preferredArea));
  }, [groupedByArea, selectedSubjectId, subjectsForUi.length]);

  useEffect(() => {
    if (subjectsForUi.length === 0) return;
    if (subjectIdFromQuery !== null && !subjectsForUi.some((item) => item.id === subjectIdFromQuery)) {
      const fallback = subjectsForUi[0]?.id ?? null;
      if (fallback !== null) {
        setSelectedSubjectId(fallback);
        router.replace(`/child/aprender?subjectId=${fallback}`);
      }
      return;
    }
    if (selectedSubjectId !== null && !subjectsForUi.some((item) => item.id === selectedSubjectId)) {
      setSelectedSubjectId(subjectsForUi[0]?.id ?? null);
    }
  }, [router, selectedSubjectId, subjectIdFromQuery, subjectsForUi]);

  useEffect(() => {
    if (visibleSubjects.length === 0) return;
    if (selectedSubjectId !== null && visibleSubjects.some((item) => item.id === selectedSubjectId)) return;
    const nextSubjectId = visibleSubjects[0]?.id ?? null;
    if (nextSubjectId !== null) {
      setSelectedSubjectId(nextSubjectId);
      router.replace(`/child/aprender?subjectId=${nextSubjectId}`);
    }
  }, [router, selectedSubjectId, visibleSubjects]);

  const onSelectSubject = (subjectId: number) => {
    setSelectedSubjectId((prev) => (prev === subjectId ? prev : subjectId));
    router.replace(`/child/aprender?subjectId=${subjectId}`);
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (hasLoadedPathRef.current) setPathRefreshing(true);
        else setLoading(true);
        let data: LearningPathResponse;
        try {
          data = await getLearningPath(selectedSubjectId ?? undefined);
        } catch (primaryErr) {
          if (selectedSubjectId === null) throw primaryErr;
          // Fallback when stored subjectId is no longer valid for the child.
          data = await getLearningPath();
          if (!active) return;
          setSelectedSubjectId(data.subjectId);
          router.replace(`/child/aprender?subjectId=${data.subjectId}`);
        }
        if (!active) return;
        setPath(data);
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem(resolvePathCacheKey(data.subjectId), JSON.stringify(data));
          window.sessionStorage.setItem(resolvePathCacheKey(null), JSON.stringify(data));
        }
        setError(null);
        hasLoadedPathRef.current = true;
      } catch (err: unknown) {
        if (!active) return;
        if (typeof window !== "undefined") {
          const cachedRaw =
            window.sessionStorage.getItem(resolvePathCacheKey(selectedSubjectId)) ??
            window.sessionStorage.getItem(resolvePathCacheKey(null));
          if (cachedRaw) {
            try {
              const cached = JSON.parse(cachedRaw) as LearningPathResponse;
              setPath(cached);
              setError("Conexão instável. Exibindo trilha salva.");
              hasLoadedPathRef.current = true;
              return;
            } catch {
              // ignore corrupted cache
            }
          }
        }
        const message =
          err instanceof ApiError
            ? getApiErrorMessage(err, "Nao foi possivel carregar a trilha.")
            : "Nao foi possivel carregar a trilha.";
        setError(message);
      } finally {
        if (active) {
          setLoading(false);
          setPathRefreshing(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [router, selectedSubjectId, completedLessonSignal, pathRetryToken]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const rawChildId = window.localStorage.getItem("axiora_child_id");
    const childId = rawChildId ? Number(rawChildId) : NaN;
    if (!Number.isFinite(childId) || childId <= 0) return;

    let active = true;
    const rewardBonus = readRecentLearningReward(childId);
    const cacheBuster = completedLessonSignal.length > 0 ? `${completedLessonSignal}-${Date.now()}` : undefined;
    void getAprenderLearningProfile(cacheBuster ? { cacheBuster } : undefined)
      .then((profile) => {
        if (!active) return;
        setCoins(Math.max(0, Math.round(profile.axionCoins ?? rewardBonus.coins)));
        setXpPercent(Math.max(0, Math.min(100, Math.round(profile.xpLevelPercent ?? 0))));
        setXpTotal(Math.max(0, Math.floor(profile.xp ?? 0)));
        setXpLevel(Math.max(1, Math.floor(profile.level ?? 1)));
        setXpInLevel(Math.max(0, Math.floor(profile.xpInLevel ?? 0)));
        setXpToNextLevel(Math.max(1, Math.floor(profile.xpToNextLevel ?? 100)));
      })
      .catch(() => {
        if (!active) return;
      });

    return () => {
      active = false;
    };
  }, [completedLessonSignal]);

  useEffect(() => {
    let active = true;
    void getAprenderLearningStreak()
      .then((streak) => {
        if (!active) return;
        setSubjectStreakDays(Math.max(0, Math.floor(streak.currentStreak ?? 0)));
      })
      .catch(() => {
        if (!active) return;
        setSubjectStreakDays(Math.max(0, Math.floor(path?.streakDays ?? 0)));
      });
    return () => {
      active = false;
    };
  }, [completedLessonSignal, path?.streakDays, selectedSubjectId]);

  useEffect(() => {
    let active = true;
    (async () => {
      setInsightsLoading(true);
      setMissionsLoading(true);
      const [insightsResult, missionsResult] = await Promise.allSettled([getLearningInsights(), getCurrentMissions()]);
      if (!active) return;
      if (insightsResult.status === "fulfilled") setInsights(insightsResult.value);
      if (missionsResult.status === "fulfilled") setMissions(missionsResult.value);
      setInsightsLoading(false);
      setMissionsLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [selectedSubjectId]);

  const selectedSubjectName = useMemo(() => {
    const selectedFromList = subjectsForUi.find((item) => item.id === selectedSubjectId)?.name;
    if (selectedFromList) return selectedFromList;
    if (path?.subjectName) return path.subjectName;
    return "Matéria";
  }, [path?.subjectName, selectedSubjectId, subjectsForUi]);

  const domainData = useMemo(() => {
    if (!path) return null;
    return getDomainData(path, selectedArea);
  }, [path, selectedArea]);
  const domainCompletion = useMemo(() => resolveDomainCompletion(path), [path]);
  const weeklyGoal = useMemo(() => resolveWeeklyGoalProgress(missions, 3), [missions]);
  const encouragementText = useMemo(() => {
    if (insightsLoading) return "Preparando sua próxima conquista...";
    if (!insights) return "Continue assim!";
    if (insights.dueReviewsCount > 0) return "Mais um passo e você desbloqueia novidades!";
    return "Continue assim!";
  }, [insights, insightsLoading]);
  const progressionNodes = useMemo(() => progressionSections?.flatMap((section) => section.nodes) ?? [], [progressionSections]);
  const hasProgressionMap = (progressionSections?.length ?? 0) > 0;
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
  const weeklyRemaining = Math.max(0, weeklyGoal.target - weeklyGoal.completed);

  useEffect(() => {
    if (!selectedNode) return;
    if (progressionNodes.some((node) => node.id === selectedNode.id)) return;
    setSelectedNode(null);
  }, [progressionNodes, selectedNode]);

  const handleContinueLearning = () => {
    if (!resolvedActiveMapNodeId) return;
    document.getElementById(`map-node-${resolvedActiveMapNodeId}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  };
  const handleStartMission = () => {
    const missionNode = nodeForHeroMission;
    if (!missionNode || missionNode.status === "locked") return;
    setSelectedNode(missionNode);
    if (missionNode.id.startsWith("lesson-")) {
      const lessonId = Number(missionNode.id.replace("lesson-", ""));
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
    document.getElementById(`map-node-${missionNode.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  const onLessonClick = (lessonId: number, state: TrailNodeType) => {
    if (state === "locked" || state === "future") return;
    const activeSubjectId = selectedSubjectId ?? path?.subjectId ?? null;
    if (activeSubjectId && Number.isFinite(activeSubjectId)) {
      router.push(`/child/aprender/lesson/${lessonId}?subjectId=${activeSubjectId}`);
      return;
    }
    router.push(`/child/aprender/lesson/${lessonId}`);
  };

  const onClaimMission = async (missionId: string) => {
    if (!missionId || claimingMissionId) return;
    setClaimingMissionId(missionId);
    try {
      await claimMission(missionId);
      setMissions((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          missions: prev.missions.map((mission) =>
            mission.missionId === missionId
              ? {
                  ...mission,
                  completed: true,
                  rewardGranted: true,
                  completedAt: mission.completedAt ?? new Date().toISOString(),
                  currentValue: Math.max(mission.currentValue, mission.targetValue),
                  progressPercent: 100,
                }
              : mission,
          ),
        };
      });
    } catch {
      // noop
    } finally {
      setClaimingMissionId(null);
    }
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-transparent">
      <div className="w-full lg:pl-[208px]">
        <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-20 lg:flex lg:w-[208px] lg:flex-col lg:gap-1 lg:border-r lg:border-t lg:border-white/5 lg:border-t-white/5 lg:bg-[linear-gradient(180deg,#0F172A_0%,#0D1626_100%)] lg:px-3 lg:py-5">
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

        <div className="mx-auto w-full lg:max-w-[980px] lg:px-5 xl:px-8">
          <div className="mx-auto w-full max-w-sm pb-4 pt-1 md:max-w-4xl lg:max-w-3xl lg:pb-12 lg:pt-6">
            <div className="mx-auto w-full max-w-[760px] px-6">
              <header className="relative z-50 space-y-2 bg-[rgba(15,23,42,0.08)] pb-2 [backdrop-filter:blur(2px)] lg:bg-transparent lg:pb-0">
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
                    🔥 {weeklyRemaining} missões restantes esta semana
                  </span>
                </div>
              </header>

              <main className="lg:pt-4">
                <div className="flex w-full flex-col">
                  <div className="w-full motion-safe:animate-[fade-in-up_340ms_ease-out]">
                    <HeroMissionCard
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
                  {hasProgressionMap ? (
                    <div className="mt-6 w-full motion-safe:animate-[fade-in-up_360ms_ease-out]">
                      <ProgressionMap
                        nodes={progressionNodes}
                        activeNodeId={resolvedActiveMapNodeId}
                        selectedNodeId={mapHighlightedNodeId}
                        onNodeClick={(node) => setSelectedNode(node)}
                        className="mx-auto w-full max-w-[1400px]"
                      />
                    </div>
                  ) : null}
                  <div className="mt-10 w-full motion-safe:animate-[fade-in-up_380ms_ease-out]">
                    <DailyMissionsPanel
                      missions={missions}
                      missionsLoading={missionsLoading}
                      claimingMissionId={claimingMissionId}
                      onClaimMission={(missionId) => void onClaimMission(missionId)}
                    />
                  </div>
                  <div className="mt-10 w-full motion-safe:animate-[fade-in-up_320ms_ease-out]">
                    <WeeklyGoalCard completed={weeklyGoal.completed} target={weeklyGoal.target} weekLabel={weeklyGoal.weekLabel} />
                  </div>
                </div>

                {loading && !path ? (
                  <div className="mt-6 rounded-2xl border border-black/5 bg-[#F1EAE3] p-3 text-sm font-semibold text-slate-700/80">Carregando trilha...</div>
                ) : null}
                {pathRefreshing ? (
                  <div className="mt-6 inline-flex items-center rounded-full border border-black/5 bg-[#ECE4DC] px-3 py-1 text-xs font-semibold uppercase tracking-[0.04em] text-slate-700/75">
                    Atualizando...
                  </div>
                ) : null}
                {error ? (
                  <div className="mt-6 rounded-2xl border border-black/5 bg-[#F1EAE3] p-3">
                    <p className="text-sm font-semibold text-slate-700/85">{error}</p>
                    <button
                      type="button"
                      className="mt-2 inline-flex rounded-xl border border-black/5 bg-[#E8DFD6] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.04em] text-slate-700/80 transition-colors hover:bg-[#DFD4CA]"
                      onClick={() => setPathRetryToken((prev) => prev + 1)}
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

      <style jsx global>{`
        @keyframes fade-in-up {
          0% {
            opacity: 0;
            transform: translateY(6px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes hero-scale-in {
          0% {
            opacity: 0;
            transform: scale(0.86);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }
        @keyframes hero-bounce-in {
          0% {
            opacity: 0;
            transform: translateY(-8px) scale(0.9);
          }
          55% {
            opacity: 1;
            transform: translateY(3px) scale(1.04);
          }
          100% {
            transform: translateY(0) scale(1);
          }
        }
        @keyframes hero-streak-underline {
          0%,
          100% {
            opacity: 0.45;
            transform: scaleX(0.7);
          }
          50% {
            opacity: 1;
            transform: scaleX(1);
          }
        }
      `}</style>
    </div>
  );
}

function DesktopNavItem({ href, iconName, label, active }: { href: string; iconName: ChildNavIconKey; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`mx-1.5 inline-flex items-center gap-2.5 rounded-2xl px-4 py-[7px] text-[15px] font-semibold uppercase tracking-[0.04em] text-slate-200/85 transition-all duration-200 ${
        active
          ? "border-l-[3px] border-l-orange-400/90 bg-white/5 text-slate-100/90"
          : "text-slate-300/80 hover:bg-white/5 hover:text-slate-100/90"
      }`}
    >
      <span className="opacity-85 grayscale-[80%]">
        <ChildNavIcon name={iconName} active={active} size={42} />
      </span>
      {label}
    </Link>
  );
}

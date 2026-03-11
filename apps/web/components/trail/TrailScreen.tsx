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
import ProgressionMap, { type MapNode, type MapSection, type NodeStatus } from "@/components/trail/ProgressionMap";
import { SubjectSelector } from "@/components/trail/SubjectSelector";
import { WeeklyGoalCard } from "@/components/trail/WeeklyGoalCard";
import { cn } from "@/lib/utils";
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

function readCachedPath(subjectId: number | null): LearningPathResponse | null {
  if (typeof window === "undefined") return null;
  const keys = [resolvePathCacheKey(subjectId), resolvePathCacheKey(null)];

  for (const key of keys) {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) continue;
    try {
      return JSON.parse(raw) as LearningPathResponse;
    } catch {
      window.sessionStorage.removeItem(key);
    }
  }

  return null;
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
        title: lesson.title,
        subtitle: `Lição ${lesson.order}`,
        xp: 30,
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
  const searchParams = useSearchParams();
  const [isHydrated, setIsHydrated] = useState(false);
  const [path, setPath] = useState<LearningPathResponse | null>(null);
  const [subjects, setSubjects] = useState<AprenderSubjectOption[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null);
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
  const [desktopStageHeight, setDesktopStageHeight] = useState(760);
  const hasLoadedPathRef = useRef(false);
  const headerRef = useRef<HTMLElement | null>(null);

  const completedLessonSignal = searchParams.get("completedLessonId") ?? "";
  const subjectIdFromQueryRaw = searchParams.get("subjectId");
  const subjectIdFromQuery = useMemo(() => {
    const parsed = Number(subjectIdFromQueryRaw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [subjectIdFromQueryRaw]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const rawFromQuery = new URLSearchParams(window.location.search).get("subjectId");
    const parsedFromQuery = Number(rawFromQuery);
    const querySubjectId = Number.isFinite(parsedFromQuery) && parsedFromQuery > 0 ? parsedFromQuery : null;
    const rawStoredSubjectId = window.localStorage.getItem(resolveSubjectStorageKey());
    const parsedStoredSubjectId = Number(rawStoredSubjectId);
    const storedSubjectId = Number.isFinite(parsedStoredSubjectId) && parsedStoredSubjectId > 0 ? parsedStoredSubjectId : null;
    const initialSubjectId = querySubjectId ?? storedSubjectId;
    const cachedPath = readCachedPath(initialSubjectId);

    if (cachedPath) {
      setPath(cachedPath);
      hasLoadedPathRef.current = true;
    }

    if (initialSubjectId !== null) {
      setSelectedSubjectId(initialSubjectId);
    } else if (cachedPath?.subjectId) {
      setSelectedSubjectId(cachedPath.subjectId);
    }

    setLoading(cachedPath === null);
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (path) {
      hasLoadedPathRef.current = true;
    }
  }, [path]);

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
    if (!isHydrated) return;
    if (subjectIdFromQuery === null) return;
    setSelectedSubjectId((prev) => (prev === subjectIdFromQuery ? prev : subjectIdFromQuery));
  }, [isHydrated, subjectIdFromQuery]);

  useEffect(() => {
    if (!isHydrated) return;
    if (typeof window === "undefined") return;
    const key = resolveSubjectStorageKey();
    if (selectedSubjectId === null) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, String(selectedSubjectId));
  }, [isHydrated, selectedSubjectId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateDesktopViewport = () => {
      const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
      if (!isDesktop) {
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

  useEffect(() => {
    if (!isHydrated) return;
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
  }, [isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    if (subjectsForUi.length === 0) return;
    const preferredArea = resolveAreaForSubject(groupedByArea, selectedSubjectId);
    setSelectedArea((prev) => (prev === preferredArea ? prev : preferredArea));
  }, [groupedByArea, isHydrated, selectedSubjectId, subjectsForUi.length]);

  useEffect(() => {
    if (!isHydrated) return;
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
  }, [isHydrated, router, selectedSubjectId, subjectIdFromQuery, subjectsForUi]);

  useEffect(() => {
    if (!isHydrated) return;
    if (visibleSubjects.length === 0) return;
    if (selectedSubjectId !== null && visibleSubjects.some((item) => item.id === selectedSubjectId)) return;
    const nextSubjectId = visibleSubjects[0]?.id ?? null;
    if (nextSubjectId !== null) {
      setSelectedSubjectId(nextSubjectId);
      router.replace(`/child/aprender?subjectId=${nextSubjectId}`);
    }
  }, [isHydrated, router, selectedSubjectId, visibleSubjects]);

  const onSelectSubject = (subjectId: number) => {
    setSelectedSubjectId((prev) => (prev === subjectId ? prev : subjectId));
    router.replace(`/child/aprender?subjectId=${subjectId}`);
  };

  useEffect(() => {
    if (!isHydrated) return;
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
  }, [completedLessonSignal, isHydrated, pathRetryToken, router, selectedSubjectId]);

  useEffect(() => {
    if (!isHydrated) return;
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
  }, [completedLessonSignal, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
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
  }, [completedLessonSignal, isHydrated, path?.streakDays, selectedSubjectId]);

  useEffect(() => {
    if (!isHydrated) return;
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
  }, [isHydrated, selectedSubjectId]);

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
  const weeklyRemaining = Math.max(0, weeklyGoal.target - weeklyGoal.completed);
  const compactDesktop = desktopStageHeight <= 700;
  const progressionViewportHeight = hasProgressionMap ? desktopStageHeight - 8 : 980;
  const initialPathLoading = loading && !path;

  useEffect(() => {
    if (!selectedNode) return;
    if (progressionNodes.some((node) => node.id === selectedNode.id)) return;
    setSelectedNode(null);
  }, [progressionNodes, selectedNode]);

  const openMapNode = (node: MapNode | null) => {
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
  };

  const handleContinueLearning = () => {
    if (!resolvedActiveMapNodeId) return;
    document.getElementById(`map-node-${resolvedActiveMapNodeId}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  };
  const handleStartMission = () => {
    openMapNode(nodeForHeroMission);
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
    <div className="relative overflow-hidden min-h-screen bg-transparent lg:h-screen">
      <div className="w-full lg:h-screen lg:overflow-hidden lg:pl-[208px]">
        <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-20 lg:flex lg:w-[208px] lg:flex-col lg:gap-1 lg:border-r lg:border-t lg:border-white/5 lg:border-t-white/5 lg:bg-[linear-gradient(180deg,#17322F_0%,#112825_100%)] lg:px-3 lg:py-5">
          <div className="mb-0.5 flex justify-center">
            <div className="rounded-2xl bg-[#1C3A36]/82 p-1.5 shadow-[inset_0_1px_12px_rgba(0,0,0,0.3)]">
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

        <div className="mx-auto w-full lg:h-screen lg:max-w-[1420px] lg:px-8 xl:max-w-[1560px] xl:px-12 2xl:px-16">
          <div className="mx-auto w-full max-w-sm pb-24 pt-1 md:max-w-4xl md:pb-8 lg:flex lg:h-screen lg:max-w-[1360px] lg:flex-col lg:overflow-hidden lg:pb-0 lg:pt-4 xl:max-w-[1480px]">
            <div className="mx-auto w-full max-w-[760px] px-4 sm:px-6 lg:max-w-none lg:px-2">
              <header ref={headerRef} className="relative z-50 space-y-2 bg-[rgba(24,49,46,0.08)] pb-2 [backdrop-filter:blur(2px)] lg:flex-none lg:space-y-2 lg:bg-transparent lg:pb-2">
                {initialPathLoading ? (
                  <div className="space-y-3 rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(25,53,48,0.82),rgba(18,37,34,0.76))] p-3 shadow-[0_24px_80px_rgba(6,18,16,0.28)]">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="h-10 w-[196px] animate-pulse rounded-full border border-white/8 bg-[linear-gradient(90deg,rgba(248,225,195,0.08),rgba(79,157,138,0.18),rgba(255,163,94,0.14))]" />
                        <div className="h-10 w-[132px] animate-pulse rounded-full border border-white/8 bg-white/[0.06]" />
                      </div>
                      <div className="hidden h-9 w-[92px] animate-pulse rounded-full bg-white/[0.08] lg:block" />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="h-3 w-44 animate-pulse rounded-full bg-[#F0E3D2]/10" />
                      <div className="h-3 w-28 animate-pulse rounded-full bg-[#F0E3D2]/8" />
                    </div>
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
                    <div className="flex items-center gap-4 text-xs font-medium text-[#E4D8C9]">
                      <span className="flex items-center gap-1">
                        🔥 {weeklyRemaining} missões restantes esta semana
                      </span>
                    </div>
                  </>
                )}
              </header>

              <main className="lg:flex lg:min-h-0 lg:flex-1 lg:overflow-hidden lg:pt-1">
                {initialPathLoading ? (
                  <section className="relative w-full">
                    <div className="hidden lg:grid lg:grid-cols-[minmax(0,1fr)_356px] lg:gap-4" style={{ height: `${desktopStageHeight}px` }}>
                      <div className="overflow-hidden rounded-[34px] border border-white/8 bg-[linear-gradient(180deg,rgba(23,47,43,0.88),rgba(16,31,28,0.82))] shadow-[0_30px_90px_rgba(5,16,14,0.24)]">
                        <div className="relative h-full w-full overflow-hidden">
                          <div className="absolute inset-x-10 top-10 h-16 animate-pulse rounded-[24px] bg-[linear-gradient(90deg,rgba(240,227,210,0.06),rgba(255,163,94,0.14),rgba(79,157,138,0.16))]" />
                          <div className="absolute left-[12%] top-[22%] h-20 w-20 animate-pulse rounded-[28px] bg-[#4F9D8A]/18 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]" />
                          <div className="absolute left-[26%] top-[34%] h-16 w-16 animate-pulse rounded-[24px] bg-[#FF9A5C]/16 shadow-[0_0_0_1px_rgba(255,255,255,0.05)]" />
                          <div className="absolute left-[44%] top-[19%] h-24 w-24 animate-pulse rounded-[32px] bg-[#F0C779]/14 shadow-[0_0_0_1px_rgba(255,255,255,0.05)]" />
                          <div className="absolute left-[56%] top-[41%] h-16 w-16 animate-pulse rounded-[24px] bg-[#4F9D8A]/16 shadow-[0_0_0_1px_rgba(255,255,255,0.05)]" />
                          <div className="absolute left-[70%] top-[27%] h-20 w-20 animate-pulse rounded-[28px] bg-[#FF9A5C]/15 shadow-[0_0_0_1px_rgba(255,255,255,0.05)]" />
                          <div className="absolute inset-x-[14%] bottom-14 h-28 animate-pulse rounded-[32px] border border-white/6 bg-[linear-gradient(180deg,rgba(14,30,27,0.62),rgba(14,30,27,0.22))]" />
                          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_34%,rgba(255,163,94,0.12),rgba(79,157,138,0.1)_34%,rgba(2,6,23,0)_72%)]" />
                        </div>
                      </div>
                      <div className="flex min-h-0 flex-col gap-3">
                        <div className="rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(24,49,45,0.9),rgba(18,35,31,0.82))] p-5 shadow-[0_22px_60px_rgba(5,16,14,0.22)]">
                          <div className="h-3 w-24 animate-pulse rounded-full bg-[#F0E3D2]/12" />
                          <div className="mt-4 h-8 w-[68%] animate-pulse rounded-full bg-[linear-gradient(90deg,rgba(255,163,94,0.16),rgba(79,157,138,0.18))]" />
                          <div className="mt-3 h-3 w-full animate-pulse rounded-full bg-white/[0.07]" />
                          <div className="mt-2 h-3 w-[84%] animate-pulse rounded-full bg-white/[0.06]" />
                          <div className="mt-6 grid grid-cols-2 gap-3">
                            <div className="h-24 animate-pulse rounded-[22px] bg-white/[0.05]" />
                            <div className="h-24 animate-pulse rounded-[22px] bg-white/[0.05]" />
                          </div>
                        </div>
                        <div className="rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(23,46,42,0.86),rgba(17,34,30,0.78))] p-4 shadow-[0_18px_46px_rgba(5,16,14,0.18)]">
                          <div className="flex items-center justify-between gap-3">
                            <div className="h-3 w-28 animate-pulse rounded-full bg-[#F0E3D2]/12" />
                            <div className="h-8 w-16 animate-pulse rounded-full bg-white/[0.06]" />
                          </div>
                          <div className="mt-4 h-16 animate-pulse rounded-[20px] bg-[linear-gradient(90deg,rgba(79,157,138,0.14),rgba(255,163,94,0.12))]" />
                        </div>
                        <div className="flex-1 rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(22,44,40,0.84),rgba(16,31,28,0.76))] p-4 shadow-[0_18px_46px_rgba(5,16,14,0.18)]">
                          <div className="h-3 w-32 animate-pulse rounded-full bg-[#F0E3D2]/12" />
                          <div className="mt-4 space-y-3">
                            <div className="h-14 animate-pulse rounded-[18px] bg-white/[0.05]" />
                            <div className="h-14 animate-pulse rounded-[18px] bg-white/[0.05]" />
                            <div className="h-14 animate-pulse rounded-[18px] bg-white/[0.05]" />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-4 lg:hidden">
                      <div className="rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(23,47,43,0.88),rgba(16,31,28,0.82))] p-4 shadow-[0_24px_70px_rgba(5,16,14,0.22)]">
                        <div className="h-6 w-40 animate-pulse rounded-full bg-[linear-gradient(90deg,rgba(255,163,94,0.14),rgba(79,157,138,0.18))]" />
                        <div className="mt-4 h-[280px] animate-pulse rounded-[26px] bg-[radial-gradient(ellipse_at_50%_30%,rgba(255,163,94,0.14),rgba(79,157,138,0.1)_36%,rgba(2,6,23,0)_74%)]" />
                      </div>
                      <div className="rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(24,49,45,0.88),rgba(18,35,31,0.8))] p-4 shadow-[0_18px_46px_rgba(5,16,14,0.18)]">
                        <div className="h-3 w-28 animate-pulse rounded-full bg-[#F0E3D2]/12" />
                        <div className="mt-4 h-20 animate-pulse rounded-[20px] bg-white/[0.05]" />
                        <div className="mt-3 h-20 animate-pulse rounded-[20px] bg-white/[0.05]" />
                      </div>
                    </div>
                  </section>
                ) : (
                  <div className={cn("flex w-full flex-col gap-5", compactDesktop ? "lg:gap-4" : "lg:gap-5")}>
                    {hasProgressionMap ? (
                    <>
                      <section className="relative isolate w-full motion-safe:animate-[fade-in-up_340ms_ease-out] lg:hidden">
                        <div
                          aria-hidden
                          className="pointer-events-none absolute inset-x-0 top-10 z-0 h-[760px]"
                          style={{
                            background:
                              "radial-gradient(ellipse at 50% 24%, rgba(255,163,94,0.12), rgba(79,157,138,0.08) 34%, rgba(2,6,23,0) 72%)",
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

                      <section
                        className="relative hidden w-full lg:grid lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_356px] lg:gap-4 motion-safe:animate-[fade-in-up_340ms_ease-out]"
                        style={{ height: `${desktopStageHeight}px` }}
                      >
                        <div
                          aria-hidden
                          className="pointer-events-none absolute inset-0 -z-10 rounded-[40px]"
                          style={{
                            background:
                              "radial-gradient(ellipse at 38% 22%, rgba(255,163,94,0.14), rgba(79,157,138,0.08) 34%, rgba(2,6,23,0) 72%), radial-gradient(ellipse at 78% 86%, rgba(241,197,107,0.08), transparent 22%)",
                            filter: "blur(22px)",
                          }}
                        />
                        <div className="relative z-10 min-w-0 lg:min-h-0">
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
                    </>
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
                  {hasProgressionMap ? (
                    <section className="relative w-full motion-safe:animate-[fade-in-up_380ms_ease-out] lg:hidden">
                      <div
                        aria-hidden
                        className="pointer-events-none absolute inset-0 -z-10 rounded-[40px] opacity-80"
                        style={{
                          background:
                            "radial-gradient(ellipse at 18% 14%, rgba(255,163,94,0.1), transparent 28%), radial-gradient(ellipse at 82% 80%, rgba(241,197,107,0.08), transparent 24%)",
                          filter: "blur(18px)",
                        }}
                      />
                      <div className={cn("grid gap-4 lg:grid-cols-[1.15fr_0.85fr] lg:grid-rows-[auto_auto]", compactDesktop ? "lg:gap-4" : "lg:gap-5")}>
                        <div className="lg:col-span-2">
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
                        <div className="grid gap-4">
                          <DailyMissionsPanel
                            className="h-full"
                            compact={compactDesktop}
                            missions={missions}
                            missionsLoading={missionsLoading}
                            claimingMissionId={claimingMissionId}
                            onClaimMission={(missionId) => void onClaimMission(missionId)}
                          />
                        </div>
                        <div className="grid content-start gap-4">
                          <WeeklyGoalCard
                            compact={compactDesktop}
                            completed={weeklyGoal.completed}
                            target={weeklyGoal.target}
                            weekLabel={weeklyGoal.weekLabel}
                          />
                        </div>
                      </div>
                    </section>
                  ) : null}
                  </div>
                )}
                {pathRefreshing ? (
                  <div className="mt-4 inline-flex items-center rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-semibold uppercase tracking-[0.04em] text-slate-200/80">
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

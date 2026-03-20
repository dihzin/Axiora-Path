"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import {
  ApiError,
  claimMission,
  getApiErrorMessage,
  getAprenderLearningEnergy,
  getAprenderLearningProfile,
  getAprenderLearningStreak,
  getAprenderSubjects,
  getCurrentMissions,
  getLearningInsights,
  getLearningPath,
  getRecommendations,
  type AprenderSubjectOption,
  type LearningInsightsResponse,
  type LearningPathResponse,
  type MissionsCurrentResponse,
} from "@/lib/api/client";
import { resolveDomainCompletion, resolveWeeklyGoalProgress } from "@/lib/gamification-derivations";
import { readRecentLearningReward } from "@/lib/learning/reward-cache";
import type { MapSection } from "@/components/trail/ProgressionMap";

// -- Storage helpers -----------------------------------------------------------

function resolveSubjectStorageKey(): string {
  if (typeof window === "undefined") return "axiora_learning_selected_subject:anonymous";
  const rawChildId = window.sessionStorage.getItem("axiora_child_id");
  const childId = rawChildId ? Number(rawChildId) : NaN;
  const scope = Number.isFinite(childId) && childId > 0 ? String(childId) : "anonymous";
  return `axiora_learning_selected_subject:${scope}`;
}

function readActiveChildId(): number | null {
  if (typeof window === "undefined") return null;
  const rawChildId = window.sessionStorage.getItem("axiora_child_id");
  const childId = rawChildId ? Number(rawChildId) : NaN;
  return Number.isFinite(childId) && childId > 0 ? childId : null;
}

function resolvePathCacheKey(subjectId: number | null, childId: number | null = readActiveChildId()): string {
  return `axiora_learning_path_cache:${childId ?? "anonymous"}:${subjectId ?? "default"}`;
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

// -- Subject distribution helpers ----------------------------------------------

const AREA_LABELS = ["Exatas", "Humanas", "Linguagens"] as const;
export type SubjectAreaLabel = (typeof AREA_LABELS)[number];

function normalizeSubjectName(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

export function distributeSubjectsByArea(
  subjects: AprenderSubjectOption[],
  currentSubjectId: number | null,
): Record<SubjectAreaLabel, AprenderSubjectOption[]> {
  const sorted = [...subjects].sort((a, b) => a.order - b.order || a.id - b.id);
  if (sorted.length === 0) return { Exatas: [], Humanas: [], Linguagens: [] };

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
  return { Exatas: chunks[0] ?? [], Humanas: chunks[1] ?? [], Linguagens: chunks[2] ?? [] };
}

export function resolveAreaForSubject(
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

// -- Hook return type ----------------------------------------------------------

export type TrailData = {
  // Path
  path: LearningPathResponse | null;
  loading: boolean;
  pathRefreshing: boolean;
  error: string | null;
  retryPath: () => void;
  // Subjects
  subjects: AprenderSubjectOption[];
  selectedSubjectId: number | null;
  selectedSubjectName: string;
  subjectsForUi: AprenderSubjectOption[];
  visibleSubjects: AprenderSubjectOption[];
  groupedByArea: Record<SubjectAreaLabel, AprenderSubjectOption[]>;
  selectedArea: SubjectAreaLabel;
  onSelectSubject: (subjectId: number) => void;
  // Profile
  coins: number;
  xpPercent: number;
  xpTotal: number;
  xpLevel: number;
  xpInLevel: number;
  xpToNextLevel: number;
  subjectStreakDays: number;
  // Energy (-1 = não carregado / indisponível)
  energyCurrent: number;
  energyMax: number;
  // Notifications
  notificationCount: number;
  // Missions & insights
  insights: LearningInsightsResponse | null;
  missions: MissionsCurrentResponse | null;
  insightsLoading: boolean;
  missionsLoading: boolean;
  claimingMissionId: string | null;
  onClaimMission: (missionId: string) => Promise<void>;
  // Derived gamification
  domainCompletion: ReturnType<typeof resolveDomainCompletion>;
  weeklyGoal: ReturnType<typeof resolveWeeklyGoalProgress>;
  encouragementText: string;
  // Query params
  completedLessonSignal: string;
};

// -- Hook ----------------------------------------------------------------------

export function useTrailData(): TrailData {
  const router = useRouter();
  const searchParams = useSearchParams();

  const completedLessonSignal = useMemo(() => {
    const completedLessonId = searchParams.get("completedLessonId") ?? "";
    const completedAt = searchParams.get("completedAt") ?? "";
    const xp = searchParams.get("xp") ?? "";
    const coins = searchParams.get("coins") ?? "";
    const profileXp = searchParams.get("profileXp") ?? "";
    const profileCoins = searchParams.get("profileCoins") ?? "";
    return [completedLessonId, completedAt, xp, coins, profileXp, profileCoins].join(":");
  }, [searchParams]);
  const subjectIdFromQueryRaw = searchParams.get("subjectId");
  const subjectIdFromQuery = useMemo(() => {
    const parsed = Number(subjectIdFromQueryRaw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [subjectIdFromQueryRaw]);

  // -- State ------------------------------------------------------------------

  // SSR-safe: always start null/true so server and client first render match.
  // Cache is restored synchronously in useLayoutEffect below (before browser paint).
  const [path, setPath] = useState<LearningPathResponse | null>(null);
  const [subjects, setSubjects] = useState<AprenderSubjectOption[]>([]);
  const [subjectsLoaded, setSubjectsLoaded] = useState(false);
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
  const [energyCurrent, setEnergyCurrent] = useState(-1);
  const [energyMax, setEnergyMax] = useState(10);
  const [notificationCount, setNotificationCount] = useState(0);
  const [pathRetryToken, setPathRetryToken] = useState(0);
  const hasLoadedPathRef = useRef(false);

  // -- Derived ----------------------------------------------------------------

  const subjectsForUi = useMemo(() => {
    if (subjects.length > 0) return subjects;
    if (!path) return [];
    return [{ id: path.subjectId, name: path.subjectName || "Matéria", ageGroup: "9-12", order: 1 }] as AprenderSubjectOption[];
  }, [path, subjects]);

  const groupedByArea = useMemo(
    () => distributeSubjectsByArea(subjectsForUi, selectedSubjectId),
    [selectedSubjectId, subjectsForUi],
  );

  const visibleSubjects = subjectsForUi;

  const selectedSubjectName = useMemo(() => {
    const selectedFromList = subjectsForUi.find((item) => item.id === selectedSubjectId)?.name;
    if (selectedFromList) return selectedFromList;
    if (path?.subjectName) return path.subjectName;
    return "Matéria";
  }, [path?.subjectName, selectedSubjectId, subjectsForUi]);

  const domainCompletion = useMemo(() => resolveDomainCompletion(path), [path]);
  const weeklyGoal = useMemo(() => resolveWeeklyGoalProgress(missions, 3), [missions]);
  const encouragementText = useMemo(() => {
    if (!insights) return "Continue assim!";
    if (insights.dueReviewsCount > 0) return "Mais um passo e você desbloqueia novidades!";
    return "Continue assim!";
  }, [insights]);

  // -- Effects ----------------------------------------------------------------

  // Restore from browser storage BEFORE first paint so the user never sees the
  // loading skeleton when cached data is available. useLayoutEffect runs
  // synchronously after DOM mutation but before the browser paints.
  useLayoutEffect(() => {
    const rawFromQuery = new URLSearchParams(window.location.search).get("subjectId");
    const parsedFromQuery = Number(rawFromQuery);
    let resolvedSubjectId: number | null = null;
    if (Number.isFinite(parsedFromQuery) && parsedFromQuery > 0) {
      resolvedSubjectId = parsedFromQuery;
    } else {
      const raw = window.localStorage.getItem(resolveSubjectStorageKey());
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed > 0) resolvedSubjectId = parsed;
    }
    if (resolvedSubjectId !== null) setSelectedSubjectId(resolvedSubjectId);

    const cached = readCachedPath(resolvedSubjectId);
    if (cached) {
      setPath(cached);
      setLoading(false);
      // Mark as loaded so the fetch effect uses setPathRefreshing instead of setLoading(true)
      hasLoadedPathRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (path) hasLoadedPathRef.current = true;
  }, [path]);

  // Sync subject id from URL query
  useEffect(() => {
    if (subjectIdFromQuery === null) return;
    setSelectedSubjectId((prev) => (prev === subjectIdFromQuery ? prev : subjectIdFromQuery));
  }, [subjectIdFromQuery]);

  // Persist selected subject to localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = resolveSubjectStorageKey();
    if (selectedSubjectId === null) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, String(selectedSubjectId));
  }, [selectedSubjectId, completedLessonSignal]);

  // Derive selected area from subjects
  useEffect(() => {
    if (subjectsForUi.length === 0) return;
    const preferredArea = resolveAreaForSubject(groupedByArea, selectedSubjectId);
    setSelectedArea((prev) => (prev === preferredArea ? prev : preferredArea));
  }, [groupedByArea, selectedSubjectId, subjectsForUi.length]);

  // Guard: if query subject no longer valid, fall back to first
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

  // Guard: if no selected subject but subjects exist, auto-select first
  useEffect(() => {
    if (visibleSubjects.length === 0) return;
    if (selectedSubjectId !== null && visibleSubjects.some((item) => item.id === selectedSubjectId)) return;
    const nextSubjectId = visibleSubjects[0]?.id ?? null;
    if (nextSubjectId !== null) {
      setSelectedSubjectId(nextSubjectId);
      router.replace(`/child/aprender?subjectId=${nextSubjectId}`);
    }
  }, [router, selectedSubjectId, visibleSubjects]);

  // Fetch subjects list
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const childId = readActiveChildId();
        if (childId === null) {
          if (active) {
            setSubjects([]);
            setSubjectsLoaded(true);
            setError("Selecione uma crianca antes de abrir o Aprender.");
          }
          return;
        }
        const list = await getAprenderSubjects({ childId });
        if (!active) return;
        setSubjects([...list].sort((a, b) => a.order - b.order || normalizeSubjectName(a.name).localeCompare(normalizeSubjectName(b.name))));
        setSubjectsLoaded(true);
        if (list.length === 0) {
          setPath(null);
          setError("Ainda não há missões disponíveis para a idade desta criança.");
        }
      } catch {
        if (active) {
          setSubjects([]);
          setSubjectsLoaded(true);
        }
      }
    })();
    return () => { active = false; };
  }, []);

  // Fetch learning path
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        if (hasLoadedPathRef.current) setPathRefreshing(true);
        else setLoading(true);
        const childId = readActiveChildId();
        if (childId === null) {
          throw new Error("Selecione uma crianca antes de abrir o Aprender.");
        }
        if (subjectsLoaded && subjects.length === 0) {
          setPath(null);
          hasLoadedPathRef.current = false;
          return;
        }
        let data: LearningPathResponse;
        try {
          data = await getLearningPath(selectedSubjectId ?? undefined, childId);
        } catch (primaryErr) {
          if (selectedSubjectId === null) throw primaryErr;
          // Fallback when stored subjectId is no longer valid for the child.
          data = await getLearningPath(undefined, childId);
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
    return () => { active = false; };
  }, [router, selectedSubjectId, completedLessonSignal, pathRetryToken, subjectsLoaded, subjects.length]);

  // Fetch profile (XP, coins)
  useEffect(() => {
    const profileXpFromQuery = Number(searchParams.get("profileXp"));
    const profileXpPercentFromQuery = Number(searchParams.get("profileXpPercent"));
    const profileCoinsFromQuery = Number(searchParams.get("profileCoins"));
    if (Number.isFinite(profileCoinsFromQuery) && profileCoinsFromQuery >= 0) {
      setCoins(Math.max(0, Math.floor(profileCoinsFromQuery)));
    }
    if (Number.isFinite(profileXpFromQuery) && profileXpFromQuery >= 0) {
      const safeXp = Math.max(0, Math.floor(profileXpFromQuery));
      setXpTotal(safeXp);
      setXpLevel(Math.max(1, Math.floor(safeXp / 100) + 1));
      setXpInLevel(Math.max(0, safeXp % 100));
      setXpToNextLevel(Math.max(1, 100 - (safeXp % 100)));
    }
    if (Number.isFinite(profileXpPercentFromQuery) && profileXpPercentFromQuery >= 0) {
      setXpPercent(Math.max(0, Math.min(100, Math.round(profileXpPercentFromQuery))));
    }
  }, [searchParams]);

  // Fetch profile (XP, coins)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const rawChildId = window.sessionStorage.getItem("axiora_child_id");
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
      .catch(() => { if (!active) return; });
    return () => { active = false; };
  }, [completedLessonSignal]);

  // Fetch streak
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
    return () => { active = false; };
  }, [completedLessonSignal, path?.streakDays, selectedSubjectId]);

  // Fetch energy
  useEffect(() => {
    let active = true;
    void getAprenderLearningEnergy()
      .then((status) => {
        if (!active) return;
        setEnergyCurrent(Math.max(0, status.energy));
        setEnergyMax(Math.max(1, status.maxEnergy));
      })
      .catch(() => { /* mantém -1 = indisponível */ });
    return () => { active = false; };
  }, [completedLessonSignal]);

  // Fetch notification count (recomendações não descartadas)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const rawChildId = window.sessionStorage.getItem("axiora_child_id");
    const childId = rawChildId ? Number(rawChildId) : NaN;
    if (!Number.isFinite(childId) || childId <= 0) return;
    let active = true;
    void getRecommendations(childId)
      .then((recs) => {
        if (!active) return;
        setNotificationCount(recs.filter((r) => r.dismissed_at === null).length);
      })
      .catch(() => { /* mantém 0 */ });
    return () => { active = false; };
  }, []);

  // Fetch insights + missions
  useEffect(() => {
    let active = true;
    void (async () => {
      setInsightsLoading(true);
      setMissionsLoading(true);
      const [insightsResult, missionsResult] = await Promise.allSettled([getLearningInsights(), getCurrentMissions()]);
      if (!active) return;
      if (insightsResult.status === "fulfilled") setInsights(insightsResult.value);
      if (missionsResult.status === "fulfilled") setMissions(missionsResult.value);
      setInsightsLoading(false);
      setMissionsLoading(false);
    })();
    return () => { active = false; };
  }, [selectedSubjectId]);

  // -- Actions ----------------------------------------------------------------

  const onSelectSubject = useCallback((subjectId: number) => {
    setSelectedSubjectId((prev) => (prev === subjectId ? prev : subjectId));
    router.replace(`/child/aprender?subjectId=${subjectId}`);
  }, [router]);

  const onClaimMission = useCallback(async (missionId: string) => {
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
  }, [claimingMissionId]);

  const retryPath = useCallback(() => setPathRetryToken((prev) => prev + 1), []);

  return {
    path,
    loading,
    pathRefreshing,
    error,
    retryPath,
    subjects,
    selectedSubjectId,
    selectedSubjectName,
    subjectsForUi,
    visibleSubjects,
    groupedByArea,
    selectedArea,
    onSelectSubject,
    coins,
    xpPercent,
    xpTotal,
    xpLevel,
    xpInLevel,
    xpToNextLevel,
    subjectStreakDays,
    energyCurrent,
    energyMax,
    notificationCount,
    insights,
    missions,
    insightsLoading,
    missionsLoading,
    claimingMissionId,
    onClaimMission,
    domainCompletion,
    weeklyGoal,
    encouragementText,
    completedLessonSignal,
  };
}

// -- Re-exported utilities used by TrailScreen ---------------------------------

export { readCachedPath, resolvePathCacheKey };
export type { MapSection };

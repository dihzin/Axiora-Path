"use client";
/* eslint-disable react-hooks/exhaustive-deps */

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Flame, Lock, Volume2, VolumeX, X } from "lucide-react";

import type { ActionFeedbackState } from "@/components/action-feedback";
import { AxionCompanion } from "@/components/axion-companion";
import { AvatarEvolution } from "@/components/avatar-evolution";
import { ChildAvatar } from "@/components/child-avatar";
import { ChildBottomNav } from "@/components/child-bottom-nav";
import { ChildDesktopShell } from "@/components/child-desktop-shell";
import { PageShell } from "@/components/layout/page-shell";
import { LevelUpOverlay } from "@/components/level-up-overlay";
import { MissionCardV2, type MissionLoopState } from "@/components/mission-card-v2";
import { PrimaryAction } from "@/components/primary-action";
import { ProgressHUD } from "@/components/progress-hud";
import { JourneyPreview } from "@/components/trail/journey-preview";
import { useTheme } from "@/components/theme-provider";
import { PiggyJar } from "@/components/piggy-jar";
import { WeeklyBossMeter } from "@/components/weekly-boss-meter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { useMeasuredViewportContainer } from "@/hooks/useMeasuredViewportContainer";
import {
  ApiError,
  completeDailyMission,
  getDailyMission,
  getAprenderSubjects,
  getAprenderLearningProfile,
  getApiErrorMessage,
  getMe,
  getAxionState,
  getLearningPath,
  getGoals,
  getLevels,
  getMood,
  getRoutineWeek,
  getStreak,
  getTasks,
  getWeeklyMetrics,
  getWalletSummary,
  markRoutine,
  postMood,
  useAiCoach as requestAiCoach,
  type DailyMissionResponse,
  type AprenderSubjectOption,
  type GoalOut,
  type LearningPathResponse,
  type LevelResponse,
  type MoodType,
  type RoutineTaskProgress,
  type RoutineWeekLog,
  type StreakResponse,
  type AxionStateResponse,
  type WeeklyMetricsResponse,
  type WalletSummaryResponse,
} from "@/lib/api/client";
import { enqueueDailyMissionComplete } from "@/lib/offline-queue";
import { readRecentLearningReward } from "@/lib/learning/reward-cache";
import { getSoundEnabled as getChildSoundEnabled, playSound, setSoundEnabled as setChildSoundEnabled } from "@/lib/sound-manager";
import type { Mood } from "@/lib/types/mood";
import { cn } from "@/lib/utils";
import { useChangePulse } from "@/hooks/use-change-pulse";
import { useDailyEngagement } from "@/hooks/use-daily-engagement";
import { useEconomyFeedbackEvents } from "@/hooks/use-economy-feedback-events";
import { useHomeState } from "@/hooks/use-home-state";
import { enforceProfileCompletionRedirect } from "@/lib/profile-completion-middleware";

function formatBRL(valueCents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valueCents / 100);
}

function getFlameIntensityClass(streakCount: number): string {
  if (streakCount >= 8) return "flame-strong";
  if (streakCount >= 4) return "flame-medium";
  return "flame-small";
}

function moodToAxionMoodState(mood: MoodType): string {
  if (mood === "HAPPY") return "HAPPY";
  if (mood === "SAD") return "SAD";
  if (mood === "ANGRY") return "ANGRY";
  if (mood === "TIRED") return "TIRED";
  return "NEUTRAL";
}

function apiMoodToMood(mood: MoodType): Mood {
  if (mood === "HAPPY") return "happy";
  if (mood === "OK") return "neutral";
  if (mood === "SAD") return "sad";
  if (mood === "ANGRY") return "angry";
  return "tired";
}

function moodToApiMood(mood: Mood): MoodType {
  if (mood === "happy") return "HAPPY";
  if (mood === "neutral") return "OK";
  if (mood === "sad") return "SAD";
  if (mood === "angry") return "ANGRY";
  return "TIRED";
}

type ChildTask = {
  id: number;
  title: string;
  difficulty: string;
  weight: number;
  is_active: boolean;
};

type AxionCelebrationType = "streak_7" | "streak_30" | "level_up" | "goal_completed";

const AXION_CELEBRATION_PHRASES: Record<AxionCelebrationType, string> = {
  streak_7: "Sete dias seguidos! Axion está em modo lenda!",
  streak_30: "Trinta dias! Axion desbloqueou energia máxima!",
  level_up: "Subiu de nível! Axion evoluiu junto com você!",
  goal_completed: "Meta concluída! Axion está comemorando essa conquista!",
};
const TASK_XP_PER_WEIGHT = 10;

function taskDifficultyLabel(value: string): string {
  if (value === "EASY") return "Fácil";
  if (value === "MEDIUM") return "Média";
  if (value === "HARD") return "Difícil";
  if (value === "LEGENDARY") return "Lendária";
  return value;
}

export default function ChildPage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const { width: layoutWidth, height: layoutHeight } = useMeasuredViewportContainer(layoutRef, {
    initialWidth: 1366,
    initialHeight: 768,
    minWidth: 320,
    minHeight: 1,
  });
  const [viewportHeight, setViewportHeight] = useState(768);
  const [viewportWidth, setViewportWidth] = useState(1366);
  const missionSectionRef = useRef<HTMLElement | null>(null);
  const [childId, setChildId] = useState<number | null>(null);
  const [childName, setChildName] = useState<string>("");
  const [isSchoolTenant, setIsSchoolTenant] = useState(false);
  const [tasks, setTasks] = useState<ChildTask[]>([]);
  const [allTasks, setAllTasks] = useState<ChildTask[]>([]);
  const [streak, setStreak] = useState<StreakResponse | null>(null);
  const [walletSummary, setWalletSummary] = useState<WalletSummaryResponse | null>(null);
  const [goals, setGoals] = useState<GoalOut[]>([]);
  const [level, setLevel] = useState<LevelResponse | null>(null);
  const [weeklyMetrics, setWeeklyMetrics] = useState<WeeklyMetricsResponse | null>(null);
  const [routineLogs, setRoutineLogs] = useState<RoutineWeekLog[]>([]);
  const [taskProgress, setTaskProgress] = useState<RoutineTaskProgress[]>([]);
  const [todayMood, setTodayMood] = useState<Mood | null>(null);
  const [moodError, setMoodError] = useState<string | null>(null);
  const [xpBarPercent, setXpBarPercent] = useState(0);
  const [recentXpBonus, setRecentXpBonus] = useState(0);
  const [learningLevel, setLearningLevel] = useState<number | null>(null);
  const [learningXpPercent, setLearningXpPercent] = useState<number | null>(null);
  const [moodFeedback, setMoodFeedback] = useState<ActionFeedbackState>("idle");
  const [missionFeedback, setMissionFeedback] = useState<ActionFeedbackState>("idle");
  const [taskFeedback, setTaskFeedback] = useState<Record<number, ActionFeedbackState>>({});
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [levelUpOverlayLevel, setLevelUpOverlayLevel] = useState<number | null>(null);
  const [avatarStage, setAvatarStage] = useState(1);
  const [childAvatarKey, setChildAvatarKey] = useState<string | null>(null);
  const [taskView, setTaskView] = useState<"list" | "journey">("list");
  const [learningPath, setLearningPath] = useState<LearningPathResponse | null>(null);
  const [learningPathLoading, setLearningPathLoading] = useState(false);
  const [learningPathError, setLearningPathError] = useState<string | null>(null);
  const [journeySubjects, setJourneySubjects] = useState<AprenderSubjectOption[]>([]);
  const [selectedJourneySubjectId, setSelectedJourneySubjectId] = useState<number | null>(null);
  const [showDailyWelcome, setShowDailyWelcome] = useState(false);
  const [dailyMission, setDailyMission] = useState<DailyMissionResponse | null>(null);
  const [missionRewardClaimed, setMissionRewardClaimed] = useState(false);
  const [missionLoadError, setMissionLoadError] = useState(false);
  const [tasksLoadError, setTasksLoadError] = useState(false);
  const [missionCompleting, setMissionCompleting] = useState(false);
  const [pulseOpen, setPulseOpen] = useState(false);
  const [markingTaskIds, setMarkingTaskIds] = useState<number[]>([]);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [axionState, setAxionState] = useState<AxionStateResponse | null>(null);
  const [axionDialogue, setAxionDialogue] = useState<{ message: string; visible: boolean }>({ message: "", visible: false });
  const [axionCelebration, setAxionCelebration] = useState<AxionCelebrationType | null>(null);
  const lastKnownLevelRef = useRef<number | null>(null);
  const lastKnownStreakRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const moodFeedbackTimerRef = useRef<number | null>(null);
  const missionFeedbackTimerRef = useRef<number | null>(null);
  const taskFeedbackTimerRef = useRef<Record<number, number>>({});
  const goalNearShownRef = useRef(false);
  const celebrationTimerRef = useRef<number | null>(null);
  const previousGoalRef = useRef<{ id: number; isLocked: boolean } | null>(null);
  const missionResetSyncRef = useRef<string | null>(null);
  const todayIso = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    const rawChildId = sessionStorage.getItem("axiora_child_id");
    const parsedChildId = rawChildId ? Number(rawChildId) : NaN;
    const childId = Number.isFinite(parsedChildId) && parsedChildId > 0 ? parsedChildId : null;
    void enforceProfileCompletionRedirect({
      childId,
      redirect: (target) => router.replace(target),
    });
  }, [router]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const rawChildId = sessionStorage.getItem("axiora_child_id");
    if (!rawChildId) {
      router.push("/select-child");
      return;
    }
    const parsedChildId = Number(rawChildId);
    if (!Number.isFinite(parsedChildId)) {
      router.push("/select-child");
      return;
    }
    const rawChildName = sessionStorage.getItem("axiora_child_name");
    if (rawChildName) {
      setChildName(rawChildName);
    }
    setChildId(parsedChildId);
    const rewardBonus = readRecentLearningReward(parsedChildId);
    setRecentXpBonus(Math.max(0, rewardBonus.xp));
    setSoundEnabled(getChildSoundEnabled(parsedChildId));
    const savedTaskView = localStorage.getItem("axiora_task_view");
    if (savedTaskView === "journey" || savedTaskView === "list") {
      setTaskView(savedTaskView);
    }
    const welcomeKey = `axiora_daily_welcome_${parsedChildId}_${todayIso}`;
    setShowDailyWelcome(localStorage.getItem(welcomeKey) !== "1");
    getTasks()
      .then((data) => {
        setAllTasks(data);
        setTasks(data.filter((task) => task.is_active));
        setTasksLoadError(false);
      })
      .catch(() => {
        setAllTasks([]);
        setTasks([]);
        setTasksLoadError(true);
      });
    getAxionState(parsedChildId)
      .then((data) => setAxionState(data))
      .catch(() => {
        setAxionState(null);
      });
    getMe()
      .then((data) => {
        setIsSchoolTenant(data.membership.tenant_type === "SCHOOL");
        const child = data.child_profiles.find((item) => item.id === parsedChildId);
        if (!child) {
          if (data.child_profiles.length === 0) {
            router.push("/select-child");
            return;
          }
          const fallbackChild = data.child_profiles[0];
          sessionStorage.setItem("axiora_child_id", String(fallbackChild.id));
          sessionStorage.setItem("axiora_child_name", fallbackChild.display_name);
          setChildId(fallbackChild.id);
          setChildName(fallbackChild.display_name);
          setTheme(fallbackChild.theme);
          setAvatarStage(fallbackChild.avatar_stage);
          setChildAvatarKey(fallbackChild.avatar_key ?? null);
          return;
        }
        if (child) {
          sessionStorage.setItem("axiora_child_name", child.display_name);
          setChildName(child.display_name);
          setTheme(child.theme);
          setAvatarStage(child.avatar_stage);
          setChildAvatarKey(child.avatar_key ?? null);
        }
      })
      .catch(() => {
        // no-op for theme bootstrap
      });

    getStreak(parsedChildId)
      .then((data) => {
        lastKnownStreakRef.current = data.current;
        setStreak(data);
      })
      .catch(() => {
        setStreak(null);
      });
    getWalletSummary(parsedChildId)
      .then((data) => setWalletSummary(data))
      .catch(() => {
        setWalletSummary(null);
      });
    getGoals(parsedChildId)
      .then((data) => setGoals(data))
      .catch(() => {
        setGoals([]);
      });
    getLevels(parsedChildId)
      .then((data) => {
        lastKnownLevelRef.current = data.level;
        setLevel(data);
        setAvatarStage(data.avatar_stage);
      })
      .catch(() => {
        setLevel(null);
      });
    getAprenderLearningProfile()
      .then((data) => {
        setLearningLevel(Math.max(1, Math.round(data.level ?? 1)));
        setLearningXpPercent(Math.max(0, Math.min(100, Math.round(data.xpLevelPercent ?? 0))));
      })
      .catch(() => {
        setLearningLevel(null);
        setLearningXpPercent(null);
      });
    getWeeklyMetrics(parsedChildId)
      .then((data) => setWeeklyMetrics(data))
      .catch(() => {
        setWeeklyMetrics(null);
      });
    getRoutineWeek(parsedChildId, todayIso)
      .then((data) => {
        setRoutineLogs(data.logs);
        setTaskProgress(data.task_progress);
      })
      .catch(() => {
        setRoutineLogs([]);
        setTaskProgress([]);
      });
    getMood(parsedChildId)
      .then((data) => {
        const found = data.find((item) => item.date === todayIso);
        setTodayMood(found ? apiMoodToMood(found.mood) : null);
      })
      .catch(() => {
        setTodayMood(null);
      });
    getDailyMission(parsedChildId)
      .then((data) => {
        setDailyMission(data);
        setMissionLoadError(false);
      })
      .catch(() => {
        setDailyMission(null);
        setMissionLoadError(true);
      });
  }, [router, setTheme, todayIso]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => {
      setViewportHeight(window.innerHeight || 768);
      setViewportWidth(window.innerWidth || 1366);
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (childId === null) return;
    let cancelled = false;
    getAprenderSubjects({ childId })
      .then((subjects) => {
        if (cancelled) return;
        const ordered = [...subjects].sort((a, b) => a.order - b.order);
        setJourneySubjects(ordered);
        if (ordered.length === 0) {
          setSelectedJourneySubjectId(null);
          return;
        }
        setSelectedJourneySubjectId((prev) => {
          if (prev && ordered.some((item) => item.id === prev)) return prev;
          return ordered[0].id;
        });
      })
      .catch(() => {
        if (cancelled) return;
        setJourneySubjects([]);
        setSelectedJourneySubjectId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [childId]);

  useEffect(() => {
    if (childId === null) return;
    let cancelled = false;
    setLearningPathLoading(true);
    setLearningPathError(null);
    getLearningPath(selectedJourneySubjectId ?? undefined, childId)
      .then((data) => {
        if (cancelled) return;
        setLearningPath(data);
      })
      .catch(() => {
        if (cancelled) return;
        setLearningPath(null);
        setLearningPathError("Não foi possível carregar sua trilha agora.");
      })
      .finally(() => {
        if (!cancelled) {
          setLearningPathLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [childId, selectedJourneySubjectId]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (childId === null) return;

    const refreshLevel = async () => {
      try {
        const data = await getLevels(childId);
        const previous = lastKnownLevelRef.current;
        if (previous !== null && data.level > previous) {
          setLevelUpOverlayLevel(data.level);
        }
        lastKnownLevelRef.current = data.level;
        setLevel(data);
        setAvatarStage(data.avatar_stage);
        const profile = await getAprenderLearningProfile();
        setLearningLevel(Math.max(1, Math.round(profile.level ?? 1)));
        setLearningXpPercent(Math.max(0, Math.min(100, Math.round(profile.xpLevelPercent ?? 0))));
      } catch {
        // ignore poll errors in MVP
      }
    };

    const interval = window.setInterval(() => {
      void refreshLevel();
    }, 20000);
    return () => window.clearInterval(interval);
  }, [childId]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (childId === null || streak === null) return;
    const previous = lastKnownStreakRef.current;
    const current = streak.current;
    if (previous !== null && current > previous && (current === 7 || current === 14 || current === 21 || current === 30)) {
      if (soundEnabled) {
        playSound("streak_milestone", { childId, theme });
      }
      if (current === 7) {
        triggerAxionCelebration("streak_7");
      } else if (current === 30) {
        triggerAxionCelebration("streak_30");
      } else {
        void fetchCoachDialogue("streak_milestone");
      }
    }
    lastKnownStreakRef.current = current;
  }, [childId, soundEnabled, streak?.current, theme]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (childId === null || levelUpOverlayLevel === null || !soundEnabled) return;
    playSound("level_up", { childId, theme });
  }, [childId, levelUpOverlayLevel, soundEnabled, theme]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (childId === null || levelUpOverlayLevel === null) return;
    triggerAxionCelebration("level_up");
  }, [childId, levelUpOverlayLevel]);

  useEffect(() => {
    const hasLearningSnapshot = learningXpPercent !== null;
    const basePercent = hasLearningSnapshot ? learningXpPercent : (level?.level_progress_percent ?? 0);
    const optimisticBonus = hasLearningSnapshot ? 0 : recentXpBonus;
    const next = Math.max(0, Math.min(100, basePercent + optimisticBonus));
    const timer = window.setTimeout(() => {
      setXpBarPercent(next);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [learningXpPercent, level?.xp_total, level?.level_progress_percent, recentXpBonus]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
      if (celebrationTimerRef.current !== null) {
        window.clearTimeout(celebrationTimerRef.current);
      }
    };
  }, []);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
    }, 1800);
  };

  const showAxionDialogue = (message: string) => {
    const trimmed = message.trim();
    if (!trimmed) return;
    setAxionDialogue({ message: trimmed, visible: true });
  };

  const triggerAxionCelebration = (type: AxionCelebrationType) => {
    setAxionCelebration(type);
    showAxionDialogue(AXION_CELEBRATION_PHRASES[type]);
    if (celebrationTimerRef.current !== null) {
      window.clearTimeout(celebrationTimerRef.current);
    }
    celebrationTimerRef.current = window.setTimeout(() => {
      setAxionCelebration(null);
    }, 2400);
  };

  const setTransientFeedback = (
    setState: (value: ActionFeedbackState) => void,
    timerRef: { current: number | null },
    state: Exclude<ActionFeedbackState, "loading">,
  ) => {
    setState(state);
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      setState("idle");
    }, 650);
  };

  const setTaskFeedbackState = (taskId: number, state: ActionFeedbackState) => {
    setTaskFeedback((prev) => ({ ...prev, [taskId]: state }));
    if (state === "loading") return;
    const activeTimer = taskFeedbackTimerRef.current[taskId];
    if (activeTimer !== undefined) {
      window.clearTimeout(activeTimer);
    }
    taskFeedbackTimerRef.current[taskId] = window.setTimeout(() => {
      setTaskFeedback((prev) => ({ ...prev, [taskId]: "idle" }));
    }, 650);
  };

  const fetchCoachDialogue = async (reason: "first_login" | "streak_milestone" | "level_up" | "goal_near") => {
    if (childId === null) return;
    try {
      const response = await requestAiCoach(childId, "CHILD", `context:${reason}`);
      showAxionDialogue(response.reply);
    } catch {
      // no-op in MVP if coach request fails
    }
  };

  const currentSave = walletSummary?.pot_balances_cents.SAVE ?? 0;
  const activeGoal = goals[0] ?? null;
  const nextGoal = activeGoal?.target_cents ?? null;
  const savePercent = nextGoal && nextGoal > 0 ? (currentSave / nextGoal) * 100 : 0;
  const goalLocked = activeGoal?.is_locked ?? false;
  const streakCount = streak?.current ?? 0;
  const flameClassName = getFlameIntensityClass(streakCount);
  const heroXpPulsing = useChangePulse(Math.round(xpBarPercent));
  const dailyEngagement = useDailyEngagement({
    childId,
    todayIso,
    streak,
    mission: dailyMission,
  });
  const currentMission = dailyEngagement.effectiveMission;

  useEffect(() => {
    if (childId === null || !showDailyWelcome) return;
    const dailyKey = `axiora_axion_dialogue_first_login_${childId}_${todayIso}`;
    if (localStorage.getItem(dailyKey) === "1") return;
    localStorage.setItem(dailyKey, "1");
    void fetchCoachDialogue("first_login");
  }, [childId, showDailyWelcome, todayIso]);

  useEffect(() => {
    if (childId === null) return;
    if (!dailyEngagement.missionResetApplied) {
      missionResetSyncRef.current = null;
      return;
    }
    const syncKey = `${childId}-${todayIso}`;
    if (missionResetSyncRef.current === syncKey) return;
    missionResetSyncRef.current = syncKey;
    void getDailyMission(childId)
      .then((nextMission) => {
        setDailyMission(nextMission);
      })
      .catch(() => {
        // keep current stale-safe state until next poll/navigation
      });
  }, [childId, dailyEngagement.missionResetApplied, todayIso]);

  useEffect(() => {
    if (!currentMission || currentMission.status !== "completed") {
      setMissionRewardClaimed(false);
    }
  }, [currentMission?.id, currentMission?.status]);

  useEffect(() => {
    if (childId === null) return;
    const nearCompletion = savePercent >= 80 && savePercent < 100;
    if (nearCompletion && !goalNearShownRef.current) {
      goalNearShownRef.current = true;
      void fetchCoachDialogue("goal_near");
      return;
    }
    if (!nearCompletion) {
      goalNearShownRef.current = false;
    }
  }, [childId, savePercent]);

  useEffect(() => {
    if (!activeGoal) {
      previousGoalRef.current = null;
      return;
    }

    const previous = previousGoalRef.current;
    if (previous === null) {
      previousGoalRef.current = { id: activeGoal.id, isLocked: activeGoal.is_locked };
      return;
    }

    if (previous.id !== activeGoal.id) {
      previousGoalRef.current = { id: activeGoal.id, isLocked: activeGoal.is_locked };
      return;
    }

    if (previous.isLocked && !activeGoal.is_locked) {
      triggerAxionCelebration("goal_completed");
    }

    previousGoalRef.current = { id: activeGoal.id, isLocked: activeGoal.is_locked };
  }, [activeGoal?.id, activeGoal?.is_locked]);

  const onSelectMood = async (mood: Mood): Promise<boolean> => {
    if (childId === null) {
      setMoodError("Selecione um perfil infantil para registrar humor.");
      showToast("Selecione a criança primeiro", "error");
      return false;
    }

    const apiMood = moodToApiMood(mood);
    setMoodError(null);
    setMoodFeedback("loading");
    try {
      await postMood(childId, apiMood);
      setTodayMood(mood);
      setAxionState((prev) =>
        prev
          ? { ...prev, mood_state: moodToAxionMoodState(apiMood) }
          : { stage: 1, mood_state: moodToAxionMoodState(apiMood), personality_traits: [] },
      );
      setTransientFeedback(setMoodFeedback, moodFeedbackTimerRef, "success");
      showToast("Humor atualizado", "success");
      return true;
    } catch {
      setMoodError("Não foi possível salvar humor agora.");
      setTransientFeedback(setMoodFeedback, moodFeedbackTimerRef, "error");
      return false;
    }
  };

  const onToggleSound = () => {
    if (childId === null) return;
    setSoundEnabled((prev) => {
      const next = !prev;
      setChildSoundEnabled(childId, next);
      showToast(`Som ${next ? "ativado" : "desativado"}`, "success");
      return next;
    });
  };

  const onToggleTaskView = (next: "list" | "journey") => {
    setTaskView(next);
    localStorage.setItem("axiora_task_view", next);
    showToast(next === "list" ? "Modo lista ativo" : "Modo jornada ativo", "success");
  };

  const dismissDailyWelcome = () => {
    setShowDailyWelcome(false);
  };

  const restoreDailyWelcome = () => {
    setShowDailyWelcome(true);
  };

  const onQuickMood = async (mood: Mood) => {
    await onSelectMood(mood);
  };

  const onMarkTask = async (taskId: number) => {
    if (childId === null || markingTaskIds.includes(taskId)) return;
    if (routineLogs.some((log) => log.task_id === taskId && log.date === todayIso)) return;
    const task = allTasks.find((item) => item.id === taskId);

    const optimisticId = -Date.now() - taskId;
    const optimisticLog: RoutineWeekLog = {
      id: optimisticId,
      child_id: childId,
      task_id: taskId,
      task_title: task?.title ?? `#${taskId}`,
      task_weight: task?.weight ?? 0,
      date: todayIso,
      status: "PENDING",
      created_at: new Date().toISOString(),
      decided_at: null,
      decided_by_user_id: null,
      parent_comment: null,
      xp_awarded: 0,
      xp_source: null,
    };

    setMarkingTaskIds((prev) => [...prev, taskId]);
    setTaskFeedbackState(taskId, "loading");
    setRoutineLogs((prev) => [optimisticLog, ...prev]);
    setTaskProgress((prev) => {
      const existing = prev.find((item) => item.task_id === taskId);
      if (!existing) {
        const taskWeight = task?.weight ?? 0;
        return [
          ...prev,
          {
            task_id: taskId,
            task_title: task?.title ?? `#${taskId}`,
            task_weight: taskWeight,
            xp_per_approval: taskWeight * TASK_XP_PER_WEIGHT,
            marked_count_week: 1,
            approved_count_week: 0,
            pending_count_week: 1,
            rejected_count_week: 0,
            completion_percent_week: 0,
            completed_today: false,
            xp_gained_week: 0,
          },
        ];
      }
      const marked_count_week = existing.marked_count_week + 1;
      const approved_count_week = existing.approved_count_week;
      const completion_percent_week = marked_count_week > 0 ? (approved_count_week / marked_count_week) * 100 : 0;
      return prev.map((item) =>
        item.task_id === taskId
          ? {
              ...item,
              marked_count_week,
              pending_count_week: item.pending_count_week + 1,
              completion_percent_week,
            }
          : item,
      );
    });
    try {
      const created = await markRoutine(childId, taskId, todayIso);
      setRoutineLogs((prev) => prev.map((log) => (log.id === optimisticId ? created : log)));
      setTaskFeedbackState(taskId, "success");
      showToast("Tarefa marcada", "success");
    } catch {
      setRoutineLogs((prev) => prev.filter((log) => log.id !== optimisticId));
      setTaskProgress((prev) =>
        prev
          .map((item) => {
            if (item.task_id !== taskId) return item;
            const marked_count_week = Math.max(0, item.marked_count_week - 1);
            const pending_count_week = Math.max(0, item.pending_count_week - 1);
            const completion_percent_week = marked_count_week > 0 ? (item.approved_count_week / marked_count_week) * 100 : 0;
            return {
              ...item,
              marked_count_week,
              pending_count_week,
              completion_percent_week,
            };
          })
          .filter((item) => item.marked_count_week > 0 || item.approved_count_week > 0 || item.rejected_count_week > 0),
      );
      setTaskFeedbackState(taskId, "error");
      showToast("Falha ao marcar tarefa", "error");
    } finally {
      setMarkingTaskIds((prev) => prev.filter((id) => id !== taskId));
    }
  };

  const onCompleteDailyMission = async () => {
    if (!currentMission || missionCompleting) return;
    if (currentMission.status === "completed") return;

    setMissionCompleting(true);
    setMissionFeedback("loading");
    if (!navigator.onLine) {
      await enqueueDailyMissionComplete({ mission_id: currentMission.id });
      setDailyMission((prev) => (prev ? { ...prev, status: "completed" } : prev));
      setMissionRewardClaimed(true);
      setTransientFeedback(setMissionFeedback, missionFeedbackTimerRef, "success");
      showToast("Missão concluída offline. Vai sincronizar ao reconectar.", "success");
      economyEvents.emitXp(currentMission.xp_reward);
      economyEvents.emitCoins(currentMission.coin_reward);
      setMissionCompleting(false);
      return;
    }

    try {
      await completeDailyMission(currentMission.id);
      setDailyMission((prev) => (prev ? { ...prev, status: "completed" } : prev));
      setMissionRewardClaimed(true);
      setTransientFeedback(setMissionFeedback, missionFeedbackTimerRef, "success");
      showToast("Missão concluída!", "success");
      economyEvents.emitXp(currentMission.xp_reward);
      economyEvents.emitCoins(currentMission.coin_reward);
      if (childId !== null) {
        void getLevels(childId).then((data) => {
          lastKnownLevelRef.current = data.level;
          setLevel(data);
          setAvatarStage(data.avatar_stage);
        });
        void getStreak(childId).then((data) => {
          lastKnownStreakRef.current = data.current;
          setStreak(data);
        });
        void getWalletSummary(childId).then((data) => setWalletSummary(data));
      }
    } catch (err) {
      if (!(err instanceof ApiError)) {
        await enqueueDailyMissionComplete({ mission_id: currentMission.id });
        setDailyMission((prev) => (prev ? { ...prev, status: "completed" } : prev));
        setMissionRewardClaimed(true);
        setTransientFeedback(setMissionFeedback, missionFeedbackTimerRef, "success");
        showToast("Sem conexao. Missão enfileirada para sincronizar.", "success");
        economyEvents.emitXp(currentMission.xp_reward);
        economyEvents.emitCoins(currentMission.coin_reward);
      } else {
        setTransientFeedback(setMissionFeedback, missionFeedbackTimerRef, "error");
        showToast(getApiErrorMessage(err, "Não foi possível concluir a missão."), "error");
      }
    } finally {
      setMissionCompleting(false);
    }
  };

  const statusBadgeClass = (status: RoutineWeekLog["status"]) => {
    if (status === "APPROVED") return "bg-secondary/15 text-secondary";
    if (status === "REJECTED") return "bg-destructive/15 text-destructive";
    return "bg-accent/15 text-accent-foreground";
  };

  const checkpointClass = (status: RoutineWeekLog["status"]) => {
    if (status === "APPROVED") return "border-secondary bg-secondary";
    if (status === "REJECTED") return "border-destructive bg-destructive";
    return "border-accent bg-accent";
  };

  const taskStatusById = routineLogs
    .filter((log) => log.date === todayIso)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .reduce<Record<number, RoutineWeekLog["status"]>>((acc, log) => {
      if (!(log.task_id in acc)) {
        acc[log.task_id] = log.status;
      }
      return acc;
    }, {});

  const taskLabelById = allTasks.reduce<Record<number, string>>((acc, task) => {
    acc[task.id] = task.title;
    return acc;
  }, {});
  const taskProgressById = taskProgress.reduce<Record<number, RoutineTaskProgress>>((acc, progress) => {
    acc[progress.task_id] = progress;
    return acc;
  }, {});

  const weeklyLogs = [...routineLogs].sort((a, b) => {
    const byDate = b.date.localeCompare(a.date);
    if (byDate !== 0) return byDate;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const groupedWeeklyLogs = (
    [
      { title: "Pendentes", status: "PENDING", items: weeklyLogs.filter((log) => log.status === "PENDING") },
      { title: "Aprovadas", status: "APPROVED", items: weeklyLogs.filter((log) => log.status === "APPROVED") },
      { title: "Rejeitadas", status: "REJECTED", items: weeklyLogs.filter((log) => log.status === "REJECTED") },
    ] satisfies Array<{ title: string; status: RoutineWeekLog["status"]; items: RoutineWeekLog[] }>
  ).filter((group) => group.items.length > 0);

  const taskRowClass = (status: RoutineWeekLog["status"] | undefined) => {
    if (status === "APPROVED") return "border-secondary/35 bg-secondary/10";
    if (status === "REJECTED") return "border-destructive/35 bg-destructive/10";
    if (status === "PENDING") return "border-accent/35 bg-accent/10";
    return "border-border bg-background";
  };

  const missionRarityLabel = (rarity: DailyMissionResponse["rarity"]) => {
    if (rarity === "epic") return "Épica";
    if (rarity === "special") return "Especial";
    return "Normal";
  };

  const routineStatusLabel = (status: RoutineWeekLog["status"]) => {
    if (status === "APPROVED") return "Aprovada";
    if (status === "REJECTED") return "Rejeitada";
    return "Pendente";
  };

  const missionProgressPercent =
    currentMission?.status === "completed"
      ? 100
      : tasks.length > 0
        ? Math.min(90, Math.round((Object.keys(taskStatusById).length / Math.max(1, tasks.length)) * 100))
        : 10;

  const hasJourneyNodes = (learningPath?.units ?? []).some((unit) => unit.nodes.length > 0);
  const missionSubtitle = currentMission
    ? "Complete a missão central para manter o ritmo e acelerar sua evolução."
    : dailyEngagement.missionResetApplied
      ? "Nova missão diária será liberada automaticamente."
    : missionLoadError
      ? "Não foi possível carregar a missão de hoje."
      : "Missão ainda não foi gerada para este perfil.";
  const missionRarity = currentMission ? missionRarityLabel(currentMission.rarity) : "Sem missão";
  const activeGoalTitle = activeGoal ? activeGoal.title : "Definir objetivo";
  const activeGoalTargetLabel = activeGoal ? formatBRL(activeGoal.target_cents) : "Sem objetivo ativo";
  const logsTodayCount = routineLogs.filter((log) => log.date === todayIso).length;
  const todayStatusCounts = Object.values(taskStatusById).reduce(
    (acc, status) => {
      if (status === "APPROVED") acc.approved += 1;
      else if (status === "PENDING") acc.pending += 1;
      else if (status === "REJECTED") acc.rejected += 1;
      return acc;
    },
    { approved: 0, pending: 0, rejected: 0 },
  );
  const latestActivityTimestamp = routineLogs.reduce<number>((latest, log) => {
    const parsed = Date.parse(log.created_at);
    if (Number.isNaN(parsed)) return latest;
    return Math.max(latest, parsed);
  }, 0);
  const offlineHours = latestActivityTimestamp > 0 ? (Date.now() - latestActivityTimestamp) / (1000 * 60 * 60) : 72;
  const missionsCompletedCount =
    routineLogs.filter((log) => log.status === "APPROVED").length + (currentMission?.status === "completed" ? 1 : 0);
  const usageFrequencyScore = Math.min(10, routineLogs.length);
  const homeState = useHomeState({
    childName,
    learningLevel,
    fallbackLevel: level?.level ?? null,
    xpPercent: xpBarPercent,
    streakCount,
    routineLogsCount: routineLogs.length,
    logsTodayCount,
    dailyMission: currentMission,
    missionRewardClaimed,
    hasJourneyNodes,
    learningPath,
    progressionError: learningPathError,
    progressionLoading: learningPathLoading,
    axionStage: axionState?.stage ?? 1,
    usageFrequencyScore,
    missionsCompletedCount,
    offlineHours,
    loopBroken: dailyEngagement.loopBroken,
    axionDialogueMessage: axionDialogue.message,
    axionDialogueVisible: axionDialogue.visible,
    axionCelebrating: axionCelebration !== null,
    walletBalanceCents: walletSummary?.total_balance_cents ?? 0,
    missionSubtitle,
    missionRarityLabel: missionRarity,
    missionProgressPercent,
    activeGoalTitle,
    activeGoalTargetLabel,
    streakFreezeUsedToday: Boolean(streak?.freeze_used_today),
  });
  const effectiveViewportHeight = Math.min(layoutHeight, viewportHeight);
  const effectiveViewportWidth = Math.min(layoutWidth, viewportWidth);
  const shouldAutoFitDesktop = effectiveViewportWidth >= 1024;
  const desktopScale = (() => {
    if (!shouldAutoFitDesktop) return 1;
    const widthScale = Math.min(1, effectiveViewportWidth / 1720);
    const heightScale = Math.min(1, Math.max(0.74, (effectiveViewportHeight - 22) / 980));
    return Math.max(0.74, Math.min(widthScale, heightScale));
  })();
  const denseDesktop = shouldAutoFitDesktop && (desktopScale < 0.93 || effectiveViewportWidth <= 1600 || effectiveViewportHeight <= 980);
  const ultraDenseDesktop = denseDesktop && (desktopScale < 0.86 || effectiveViewportHeight <= 900);
  const economyEvents = useEconomyFeedbackEvents({
    xpPercent: homeState.user.xpPercent,
    balanceCents: homeState.economy.balanceCents,
  });

  const onMissionCardAction = async (state: MissionLoopState) => {
    if (state === "active") {
      await onCompleteDailyMission();
      return;
    }
    if (state === "completed") {
      setMissionRewardClaimed(true);
      setTransientFeedback(setMissionFeedback, missionFeedbackTimerRef, "success");
      showToast("Recompensa resgatada!", "success");
      economyEvents.emitXp(homeState.mission.reward.xp);
      economyEvents.emitCoins(homeState.mission.reward.coins);
      if (childId !== null && soundEnabled) {
        playSound("level_up", { childId, theme });
      }
    }
  };

  const onPrimaryHomeAction = () => {
    if (homeState.nextAction.type === "progress") {
      router.push("/child/aprender");
      return;
    }
    if (homeState.nextAction.type === "claim") {
      void onMissionCardAction("completed");
      return;
    }
    if (homeState.nextAction.type === "mission") {
      missionSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
  };

  return (
    <div ref={layoutRef} className="relative h-screen overflow-x-hidden">
      {levelUpOverlayLevel !== null ? (
        <LevelUpOverlay level={levelUpOverlayLevel} onDismiss={() => setLevelUpOverlayLevel(null)} />
      ) : null}
      <ChildDesktopShell activeNav="inicio" menuSkin="trail" density={denseDesktop ? "dense" : "regular"} contentScale={desktopScale}>
        <PageShell
          tone="child"
          width="full"
          className={cn(
            "axiora-core-bg flex flex-col",
            shouldAutoFitDesktop
              ? cn(
                  "gap-3 pt-3 !pb-2 md:!pb-2 lg:!h-full lg:!min-h-0 lg:!overflow-y-auto lg:!pb-2",
                  ultraDenseDesktop && "gap-2 pt-2",
                  !denseDesktop && "gap-4 pt-4",
                )
              : "gap-5 pt-5",
          )}
        >
          <ProgressHUD
            level={homeState.user.level}
            xpPercent={homeState.user.xpPercent}
            nextObjective={homeState.progression.nextStepIdeal}
            recentProgressLabel={homeState.progression.recentProgressLabel}
            levelUpSignal={levelUpOverlayLevel}
            className={cn(ultraDenseDesktop && "lg:!p-2.5")}
          />
          <section className={cn("axiora-surface-glass relative overflow-hidden", "p-2.5 lg:p-3")}>
            <div
              aria-hidden
              className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(251,146,60,0.25)_0%,rgba(251,146,60,0)_70%)] blur-2xl"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -left-10 bottom-0 h-32 w-32 rounded-full bg-[radial-gradient(circle,rgba(56,189,248,0.20)_0%,rgba(56,189,248,0)_72%)] blur-2xl"
            />
            <div className="relative z-[1] flex flex-col gap-2.5 md:flex-row md:items-start md:justify-between">
              <div className="space-y-2.5">
                <p className="axiora-subtitle text-[11px] font-black uppercase tracking-[0.08em]">Axiora Core Hub</p>
                <h1 className={cn("axiora-title font-extrabold leading-tight", "text-[22px] lg:text-[24px]")}>
                  {homeState.user.greeting}
                </h1>
                <p className="axiora-subtitle text-sm lg:text-[15px]">{homeState.user.subtitle}</p>
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <div className="axiora-surface-soft inline-flex items-center gap-2 rounded-2xl px-2.5 py-1.5">
                    <span className="axiora-subtitle text-[11px] font-black uppercase tracking-[0.08em]">Economia</span>
                    <span className="axiora-title text-base font-extrabold">{formatBRL(homeState.economy.balanceCents)}</span>
                  </div>
                  <div className="axiora-surface-soft inline-flex items-center gap-2 rounded-2xl px-2.5 py-1.5">
                    <span className="axiora-subtitle text-[11px] font-black uppercase tracking-[0.08em]">Nível</span>
                    <span className="axiora-title text-base font-extrabold">{homeState.user.level}</span>
                  </div>
                  <div className="axiora-surface-soft inline-flex items-center gap-2 rounded-2xl px-2.5 py-1.5">
                    <span className="axiora-subtitle text-[11px] font-black uppercase tracking-[0.08em]">XP</span>
                    <span
                      className={cn(
                        "axiora-title font-extrabold transition-[transform,filter] duration-300 ease-out",
                        "text-base",
                        heroXpPulsing && "scale-[1.06] brightness-125",
                      )}
                    >
                      {homeState.user.xpPercent.toFixed(0)}%
                    </span>
                  </div>
                  <div className="axiora-surface-soft inline-flex items-center gap-2 rounded-2xl px-2.5 py-1.5">
                    <span className="axiora-subtitle text-[11px] font-black uppercase tracking-[0.08em]">Streak</span>
                    <span className="axiora-title inline-flex items-center gap-1 text-base font-extrabold">
                      <Flame className={`${isSchoolTenant ? "" : "flame-flicker"} ${flameClassName} h-3.5 w-3.5 text-[#FB923C]`} />
                      {homeState.user.streak}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  <PrimaryAction label={homeState.nextAction.label} onClick={onPrimaryHomeAction} compact />
                  <button
                    type="button"
                    aria-label="Abrir modo pais"
                    className="axiora-chunky-btn axiora-control-btn inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs"
                    onClick={() => router.push("/parent-pin")}
                  >
                    <Lock className="h-3.5 w-3.5 stroke-[2.6]" />
                    Modo pais
                  </button>
                </div>
                <p className="axiora-subtitle pt-0.5 text-sm">
                  <span className="font-black uppercase tracking-[0.08em] text-[11px]">Próximo passo:</span>{" "}
                  <span className="font-semibold text-[#334155]">{homeState.progression.nextStepIdeal}</span>
                </p>
              </div>
              <div className="axiora-surface-soft mx-auto flex w-full max-w-[170px] flex-col items-center rounded-2xl p-2 md:mx-0">
                {childAvatarKey ? (
                  <ChildAvatar name={childName || "Criança"} avatarKey={childAvatarKey} size={56} />
                ) : (
                  <AvatarEvolution stage={avatarStage} />
                )}
                <p className="axiora-subtitle mt-1 text-center text-[11px] font-semibold">{childName || "Perfil infantil"}</p>
              </div>
            </div>
          </section>

          <section
            ref={missionSectionRef}
            className={cn(
              "grid items-start lg:flex-1 lg:min-h-0",
              ultraDenseDesktop ? "gap-2" : denseDesktop ? "gap-3" : "gap-4",
              isSchoolTenant ? "xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]" : "lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]",
            )}
          >
            <div className={cn("flex flex-col", ultraDenseDesktop ? "gap-2" : denseDesktop ? "gap-3" : "gap-4")}>
              <MissionCardV2
                state={homeState.mission.loopState}
                title={homeState.mission.title}
                subtitle={homeState.mission.subtitle}
                progress={homeState.mission.progressPercent}
                xpReward={homeState.mission.reward.xp}
                coinReward={homeState.mission.reward.coins}
                rarityLabel={homeState.mission.rarityLabel}
                loading={missionCompleting}
                disabled={homeState.mission.loopState === "locked"}
                soundEnabled={soundEnabled}
                onPlayRewardSound={() => {
                  if (childId !== null) {
                    playSound("level_up", { childId, theme });
                  }
                }}
                onAction={(state) => {
                  void onMissionCardAction(state);
                }}
              />
              <AxionCompanion
                stage={homeState.axion.stage}
                visualMoodState={homeState.axion.visualMoodState}
                behaviorState={homeState.axion.behaviorState}
                idleMotion={homeState.axion.idleMotion}
                headline={homeState.axion.headline}
                message={homeState.axion.message}
                dialogueMessage={homeState.axion.dialogueMessage}
                dialogueVisible={homeState.axion.dialogueVisible}
                todayMood={todayMood}
                moodError={moodError}
                moodFeedback={moodFeedback}
                reducedMotion={isSchoolTenant}
                celebrating={homeState.axion.celebrating}
                compact
                onDismissDialogue={() => setAxionDialogue((prev) => ({ ...prev, visible: false }))}
                onChangeMood={(mood) => void onQuickMood(mood)}
              />
            </div>

            <div className={cn("flex h-full flex-col", ultraDenseDesktop ? "gap-2" : denseDesktop ? "gap-3" : "gap-4")}>
              <Card variant="subtle" className="axiora-surface-glass rounded-2xl">
                <CardHeader className={cn(ultraDenseDesktop ? "pb-1" : denseDesktop ? "pb-1.5" : "pb-2")}>
                  <CardTitle className="axiora-title text-[22px] font-extrabold">Caminho de Progressão</CardTitle>
                  <p className="axiora-subtitle text-[15px]">Prévia da sua trilha</p>
                </CardHeader>
                <CardContent className={cn(ultraDenseDesktop ? "pb-2.5" : denseDesktop ? "pb-3" : "pb-4")}>
                  <JourneyPreview
                    learningPath={homeState.progression.learningPath}
                    subjectOptions={journeySubjects.map((subject) => ({ id: subject.id, name: subject.name }))}
                    selectedSubjectId={selectedJourneySubjectId}
                    onChangeSubject={setSelectedJourneySubjectId}
                    loading={homeState.progression.loading}
                    error={homeState.progression.error}
                    onContinueJourney={() => router.push("/child/aprender")}
                  />
                </CardContent>
              </Card>

              <div className="axiora-surface-glass rounded-2xl border border-[rgba(148,163,184,0.26)] px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="axiora-title text-[18px] font-extrabold">Pulso da Semana</p>
                    <p className="axiora-subtitle mt-0.5 text-sm">Resumo rápido para manter seu ritmo</p>
                  </div>
                  <button
                    type="button"
                    className="axiora-chunky-btn axiora-control-btn axiora-chunky-btn--compact px-3 py-1.5 text-xs"
                    onClick={() => setPulseOpen((prev) => !prev)}
                  >
                    {pulseOpen ? "Ocultar" : "Expandir"}
                  </button>
                </div>
                {pulseOpen ? (
                  <div className="mt-3 space-y-3">
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="axiora-surface-soft rounded-xl px-3 py-2.5">
                        <p className="axiora-subtitle text-[11px] font-black uppercase tracking-[0.08em]">Ações hoje</p>
                        <p className="axiora-title mt-1 text-xl font-extrabold">{logsTodayCount}</p>
                      </div>
                      <div className="axiora-surface-soft rounded-xl px-3 py-2.5">
                        <p className="axiora-subtitle text-[11px] font-black uppercase tracking-[0.08em]">Missão</p>
                        <p className="axiora-title mt-1 text-xl font-extrabold">{missionProgressPercent}%</p>
                      </div>
                    </div>

                    <div className="axiora-surface-soft rounded-xl px-3 py-2.5">
                      <p className="axiora-subtitle text-[11px] font-black uppercase tracking-[0.08em]">Status das tarefas</p>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p className="axiora-title text-base font-extrabold text-[#0E8F62]">{todayStatusCounts.approved}</p>
                          <p className="axiora-subtitle text-[12px]">Aprovadas</p>
                        </div>
                        <div>
                          <p className="axiora-title text-base font-extrabold text-[#B87400]">{todayStatusCounts.pending}</p>
                          <p className="axiora-subtitle text-[12px]">Pendentes</p>
                        </div>
                        <div>
                          <p className="axiora-title text-base font-extrabold text-[#B23B3B]">{todayStatusCounts.rejected}</p>
                          <p className="axiora-subtitle text-[12px]">Rejeitadas</p>
                        </div>
                      </div>
                    </div>

                    <div className="axiora-surface-soft rounded-xl px-3 py-2.5">
                      <p className="axiora-subtitle text-[11px] font-black uppercase tracking-[0.08em]">Meta ativa</p>
                      <p className="axiora-title mt-1 text-base font-extrabold">{homeState.economy.activeGoalTitle}</p>
                      <p className="axiora-subtitle mt-0.5 text-[14px]">Alvo: {homeState.economy.activeGoalTargetLabel}</p>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <ChildBottomNav />
          {toast ? (
            <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-4">
              <div className={`rounded-xl px-3 py-2 text-xs font-semibold text-white shadow-sm ${toast.type === "success" ? "bg-secondary" : "bg-destructive"}`}>
                {toast.message}
              </div>
            </div>
          ) : null}
        </PageShell>
      </ChildDesktopShell>
    </div>
  );
}

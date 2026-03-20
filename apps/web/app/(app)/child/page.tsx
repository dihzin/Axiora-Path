"use client";
/* eslint-disable react-hooks/exhaustive-deps */

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Coins, Flame, Lock, Snowflake, Sparkles, Volume2, VolumeX, X } from "lucide-react";

import { ActionFeedback, type ActionFeedbackState } from "@/components/action-feedback";
import { MoodSelector } from "@/components/axiora/MoodSelector";
import { AxionCharacter } from "@/components/axion-character";
import { AxionDialogue } from "@/components/axion-dialogue";
import { AvatarEvolution } from "@/components/avatar-evolution";
import { ChildAvatar } from "@/components/child-avatar";
import { ChildBottomNav } from "@/components/child-bottom-nav";
import { ChildDesktopShell } from "@/components/child-desktop-shell";
import { PageShell } from "@/components/layout/page-shell";
import { LevelUpOverlay } from "@/components/level-up-overlay";
import { useTheme } from "@/components/theme-provider";
import { PiggyJar } from "@/components/piggy-jar";
import { RecommendationsPanel } from "@/components/recommendations-panel";
import { WeeklyBossMeter } from "@/components/weekly-boss-meter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import {
  ApiError,
  completeDailyMission,
  getDailyMission,
  getAprenderLearningProfile,
  getApiErrorMessage,
  getMe,
  getAxionState,
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
  type GoalOut,
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

const AXION_CELEBRATION_BADGES: Record<AxionCelebrationType, string> = {
  streak_7: "Sequência 7",
  streak_30: "Sequência 30",
  level_up: "Subiu de nível",
  goal_completed: "Meta concluída",
};
const TASK_XP_PER_WEIGHT = 10;

function taskDifficultyLabel(value: string): string {
  if (value === "EASY") return "Fácil";
  if (value === "MEDIUM") return "Média";
  if (value === "HARD") return "Difícil";
  if (value === "LEGENDARY") return "Lendária";
  return value;
}

function axionMoodStateLabel(value: string): string {
  if (value === "NEUTRAL") return "Neutro";
  if (value === "HAPPY") return "Feliz";
  if (value === "SAD") return "Triste";
  if (value === "ANGRY") return "Bravo";
  if (value === "TIRED") return "Cansado";
  if (value === "CELEBRATING") return "Comemorando";
  if (value === "CONCERNED") return "Atento";
  if (value === "EXCITED") return "Animado";
  if (value === "PROUD") return "Orgulhoso";
  return value;
}

function childMoodLabel(value: Mood | null): string | null {
  if (value === "happy") return "Feliz";
  if (value === "neutral") return "Neutro";
  if (value === "sad") return "Triste";
  if (value === "angry") return "Bravo";
  if (value === "tired") return "Cansado";
  return null;
}

function moodToAxionVisualState(value: Mood | null): string | null {
  if (value === "happy") return "HAPPY";
  if (value === "neutral") return "NEUTRAL";
  if (value === "sad") return "SAD";
  if (value === "angry") return "ANGRY";
  if (value === "tired") return "TIRED";
  return null;
}

export default function ChildPage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
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
  const [showDailyWelcome, setShowDailyWelcome] = useState(false);
  const [dailyMission, setDailyMission] = useState<DailyMissionResponse | null>(null);
  const [missionLoadError, setMissionLoadError] = useState(false);
  const [tasksLoadError, setTasksLoadError] = useState(false);
  const [missionCompleting, setMissionCompleting] = useState(false);
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
  const effectiveAxionMoodState = moodToAxionVisualState(todayMood) ?? (axionState?.mood_state ?? "NEUTRAL");
  const flameClassName = getFlameIntensityClass(streakCount);

  useEffect(() => {
    if (childId === null || !showDailyWelcome) return;
    const dailyKey = `axiora_axion_dialogue_first_login_${childId}_${todayIso}`;
    if (localStorage.getItem(dailyKey) === "1") return;
    localStorage.setItem(dailyKey, "1");
    void fetchCoachDialogue("first_login");
  }, [childId, showDailyWelcome, todayIso]);

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
    if (!dailyMission || missionCompleting) return;
    if (dailyMission.status === "completed") return;

    setMissionCompleting(true);
    setMissionFeedback("loading");
    if (!navigator.onLine) {
      await enqueueDailyMissionComplete({ mission_id: dailyMission.id });
      setDailyMission((prev) => (prev ? { ...prev, status: "completed" } : prev));
      setTransientFeedback(setMissionFeedback, missionFeedbackTimerRef, "success");
      showToast("Missão concluída offline. Vai sincronizar ao reconectar.", "success");
      setMissionCompleting(false);
      return;
    }

    try {
      await completeDailyMission(dailyMission.id);
      setDailyMission((prev) => (prev ? { ...prev, status: "completed" } : prev));
      setTransientFeedback(setMissionFeedback, missionFeedbackTimerRef, "success");
      showToast("Missão concluída!", "success");
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
        await enqueueDailyMissionComplete({ mission_id: dailyMission.id });
        setDailyMission((prev) => (prev ? { ...prev, status: "completed" } : prev));
        setTransientFeedback(setMissionFeedback, missionFeedbackTimerRef, "success");
        showToast("Sem conexao. Missão enfileirada para sincronizar.", "success");
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

  const missionCardClass = (status: DailyMissionResponse["status"]) => {
    if (status === "completed") {
      return "border-secondary/35 bg-secondary/10";
    }
    return "border-border bg-card shadow-sm";
  };

  return (
    <>
      {levelUpOverlayLevel !== null ? (
        <LevelUpOverlay level={levelUpOverlayLevel} onDismiss={() => setLevelUpOverlayLevel(null)} />
      ) : null}
      <ChildDesktopShell activeNav="inicio">
        <PageShell
          tone="child"
          width={isSchoolTenant ? "wide" : "content"}
          className={cn(
            "flex flex-col pt-5",
          )}
        >
        <div className="mb-3 flex flex-wrap items-center gap-2 sm:flex-nowrap sm:justify-between">
          <p className="order-2 min-w-0 flex-1 basis-full truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:order-1 sm:basis-auto">
            {childName ? `Perfil: ${childName}` : "Perfil infantil"}
          </p>
          <button
            type="button"
            aria-label="Abrir modo pais"
            className="axiora-chunky-btn axiora-control-btn order-1 ml-auto inline-flex shrink-0 items-center gap-1.5 px-2.5 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 sm:order-2 sm:ml-0"
            onClick={() => router.push("/parent-pin")}
          >
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-lg bg-[#EDE4D8]">
              <Lock className="h-3.5 w-3.5 stroke-[2.6]" />
            </span>
            Modo pais
          </button>
        </div>
        <Card variant="emphasis" className={cn("mb-4 overflow-hidden", dailyMission ? missionCardClass(dailyMission.status) : "border-border shadow-sm")}>
            <CardHeader className="bg-gradient-to-r from-[#ff9600] to-[#ffb132] p-4 pb-2 text-white">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-1.5 text-base font-extrabold tracking-tight">
                  <Sparkles className="h-4 w-4 stroke-[2.8]" />
                  Missão do Dia
                </CardTitle>
                {dailyMission ? (
                  <span
                    className="rounded-full border border-white/40 bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
                  >
                    {missionRarityLabel(dailyMission.rarity)}
                  </span>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-2.5 p-4 pt-3 text-sm">
              {dailyMission ? (
                <>
                  <p className="line-clamp-1 text-sm font-semibold text-foreground">{dailyMission.title}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-1.5 rounded-xl border border-border bg-background px-2 py-1.5 text-xs font-bold">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-secondary/15">
                        <Sparkles className="h-3.5 w-3.5 stroke-[2.6] text-secondary" />
                      </span>
                      +{dailyMission.xp_reward} XP
                    </div>
                    <div className="flex items-center gap-1.5 rounded-xl border border-border bg-background px-2 py-1.5 text-xs font-bold">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-accent/20">
                        <Coins className="h-3.5 w-3.5 stroke-[2.6] text-accent-foreground" />
                      </span>
                      +{dailyMission.coin_reward} moedas
                    </div>
                  </div>
                  {dailyMission.status === "completed" ? (
                    <div className="flex items-center justify-center gap-1 rounded-xl border border-secondary/35 bg-secondary/10 px-3 py-2 text-sm font-semibold text-secondary">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Missão concluída
                    </div>
                  ) : null}
                  <ActionFeedback
                    type="button"
                    state={missionCompleting ? "loading" : missionFeedback}
                    loadingLabel="Processando..."
                    disabled={missionCompleting || dailyMission.status === "completed"}
                    className="axiora-chunky-btn axiora-control-btn--teal w-full px-3 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => void onCompleteDailyMission()}
                  >
                    {dailyMission.status === "completed" ? "Concluída" : "Completar missão"}
                  </ActionFeedback>
                </>
              ) : (
                <div className="rounded-xl border border-border bg-muted px-3 py-4 text-center">
                  <p className="text-sm font-medium text-foreground">Missão indisponível no momento</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {missionLoadError ? "Não foi possível carregar a missão de hoje." : "Missão ainda não foi gerada para este perfil."}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        <Card variant="subtle"
          className={cn(
            "relative mb-4 overflow-hidden border-[#E5D5C0]/22 bg-[#FFF9F1] shadow-[0_18px_34px_rgba(59,45,32,0.12)]",
            isSchoolTenant ? "bg-card" : "axion-card-idle bg-card",
          )}
        >
          <CardHeader className="p-4 pb-2 text-center">
            <CardTitle className="text-lg font-extrabold tracking-tight">Axion</CardTitle>
            <p className="text-xs text-[#4F9D8A]">Seu parceiro de missão</p>
          </CardHeader>
          <CardContent className="space-y-2.5 p-4 pt-0 text-sm text-center">
            {axionCelebration ? (
              <div className="celebrate-badge-pop absolute right-3 top-3 rounded-xl border border-secondary/35 bg-secondary/10 px-2 py-0.5 text-sm font-semibold text-secondary">
                {AXION_CELEBRATION_BADGES[axionCelebration]}
              </div>
            ) : null}
            <div className="mx-auto flex w-full max-w-[18rem] justify-center">
              <div className="overflow-hidden rounded-full border border-[#E8D8BF] bg-[radial-gradient(circle_at_50%_35%,rgba(255,163,94,0.12),rgba(30,42,56,0.02)_70%)] p-2.5 shadow-md">
                <AxionCharacter
                  stage={axionState?.stage ?? 1}
                  moodState={effectiveAxionMoodState}
                  celebrating={axionCelebration !== null}
                  reducedMotion={isSchoolTenant}
                />
              </div>
            </div>
            <AxionDialogue
              message={axionDialogue.message}
              visible={axionDialogue.visible}
              onDismiss={() => setAxionDialogue((prev) => ({ ...prev, visible: false }))}
              reducedMotion={isSchoolTenant}
            />
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-xl border border-[#E8D8BF] bg-[#FFF9F1] px-2 py-1">Estágio {axionState?.stage ?? 1}</span>
                <span className="rounded-xl border border-[#E8D8BF] bg-[#FFF9F1] px-2 py-1">
                {childMoodLabel(todayMood) ?? axionMoodStateLabel(effectiveAxionMoodState)}
              </span>
            </div>
          </CardContent>
        </Card>
        <section className={cn("space-y-4", isSchoolTenant && "grid gap-4 lg:grid-cols-2 lg:items-start lg:space-y-0")}>
          {showDailyWelcome ? (
            <Card variant="subtle" className="border-[#E5D5C0]/22 bg-[#FFF9F1] shadow-[0_16px_30px_rgba(59,45,32,0.1)]">
              <CardHeader className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="min-w-0 break-words text-sm leading-tight [overflow-wrap:anywhere]">Ritmo do dia</CardTitle>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      aria-label="Alternar som"
                      className="axiora-chunky-btn axiora-control-btn inline-flex h-8 items-center gap-1 px-2 text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2"
                      onClick={onToggleSound}
                    >
                      {soundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                      Som {soundEnabled ? "ligado" : "desligado"}
                    </button>
                    <button
                      type="button"
                      aria-label="Fechar boas-vindas"
                      className="axiora-chunky-btn axiora-control-btn inline-flex h-7 w-7 items-center justify-center px-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2"
                      onClick={dismissDailyWelcome}
                    >
                      <X className="h-4 w-4 stroke-[2.6]" />
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 p-4 pt-0 text-sm">
                <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
                  <span className="text-muted-foreground">Sequência</span>
                  <span className="text-right font-semibold">{streakCount} dias</span>
                </div>
                <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
                  <span className="text-muted-foreground">Meta principal</span>
                  {activeGoal ? (
                    <span className="text-right font-semibold break-words [overflow-wrap:anywhere]">{`${activeGoal.title} • ${formatBRL(activeGoal.target_cents)}`}</span>
                  ) : (
                    <span className="justify-self-end rounded-full border border-border bg-white px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">Definir meta</span>
                  )}
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Humor rápido</p>
                  <MoodSelector value={todayMood ?? undefined} onChange={(mood) => void onQuickMood(mood)} />
                  {moodFeedback === "loading" ? <p className="mt-2 text-sm text-muted-foreground">Salvando humor...</p> : null}
                  {moodError ? <p className="mt-2 text-sm text-destructive">{moodError}</p> : null}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card variant="flat">
              <CardContent className="flex items-center justify-between gap-2 p-4">
                <p className="text-sm font-medium text-muted-foreground">Painel da missão recolhido</p>
                <ActionFeedback
                  type="button"
                  className="axiora-chunky-btn axiora-control-btn px-3 py-1 text-sm"
                  onClick={restoreDailyWelcome}
                >
                  Mostrar painel
                </ActionFeedback>
              </CardContent>
            </Card>
          )}
            <Card variant="subtle" className="border-[#E5D5C0]/22 bg-[#FFF9F1] shadow-[0_16px_30px_rgba(59,45,32,0.1)]">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-base font-semibold">Progresso</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-4 pt-0">
              <div className="grid gap-3 sm:grid-cols-2">
                <PiggyJar
                  currentSaveAmountCents={currentSave}
                  nextGoalAmountCents={nextGoal}
                  savePercent={savePercent}
                  isLocked={goalLocked}
                />
                <div className="rounded-xl border border-[#E8D8BF] bg-[#FFF9F1] p-4 shadow-sm">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Avatar</p>
                  {childAvatarKey ? (
                    <div className="mx-auto w-fit rounded-xl border border-[#E8D8BF] bg-[#FFF9F1] p-3">
                      <ChildAvatar name={childName || "Criança"} avatarKey={childAvatarKey} size={96} />
                      <p className="mt-2 text-center text-xs font-medium text-muted-foreground">Foto do perfil</p>
                    </div>
                  ) : (
                    <AvatarEvolution stage={avatarStage} />
                  )}
                </div>
              </div>
                <div className="rounded-xl border border-[#E8D8BF] bg-[#FFF9F1] p-4 shadow-sm">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="font-semibold text-foreground">XP</span>
                  <span className="font-medium text-muted-foreground">
                    Nível {learningLevel ?? level?.level ?? 1} • {xpBarPercent.toFixed(0)}%
                  </span>
                </div>
                <ProgressBar tone="secondary" value={xpBarPercent} />
              </div>
              <WeeklyBossMeter completionRate={weeklyMetrics?.completion_rate ?? 0} />
            </CardContent>
          </Card>
          <Card variant="subtle" className="border-[#E5D5C0]/22 bg-[#FFF9F1] shadow-[0_16px_30px_rgba(59,45,32,0.1)]">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-base">Tarefas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-4 pt-0 text-sm text-muted-foreground">
              <div className="flex items-center justify-between">
                <div className="inline-flex rounded-xl border border-border p-0.5 text-sm">
                  <button
                    type="button"
                    className={`axiora-chunky-btn axiora-control-btn axiora-chunky-btn--compact px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 ${taskView === "list" ? "axiora-control-btn--orange text-white" : "text-muted-foreground"}`}
                    onClick={() => onToggleTaskView("list")}
                  >
                    Lista
                  </button>
                  <button
                    type="button"
                    className={`axiora-chunky-btn axiora-control-btn axiora-chunky-btn--compact px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 ${taskView === "journey" ? "axiora-control-btn--orange text-white" : "text-muted-foreground"}`}
                    onClick={() => onToggleTaskView("journey")}
                  >
                    Jornada
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-xl border border-[#E8D8BF] bg-[#FFF9F1] shadow-[0_2px_0_rgba(108,97,84,0.12)]">
                  <Flame className={`${isSchoolTenant ? "" : "flame-flicker"} ${flameClassName} stroke-[2.6] text-accent`} />
                </span>
                <span className="font-medium text-accent-foreground">Sequência: {streakCount} dias</span>
                {streak?.freeze_used_today ? <Snowflake className="h-3.5 w-3.5 text-secondary" /> : null}
              </div>
              <div className="space-y-2">
                {tasksLoadError ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">Não foi possível carregar tarefas agora.</p>
                ) : tasks.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma tarefa ativa para hoje.</p>
                ) : (
                  tasks.slice(0, 4).map((task) => {
                    const status = taskStatusById[task.id];
                    const isProcessing = markingTaskIds.includes(task.id);
                    const isMarked = status !== undefined;
                    const progress = taskProgressById[task.id];
                    const completionPercent = progress?.completion_percent_week ?? 0;
                    const xpPerApproval = progress?.xp_per_approval ?? task.weight * TASK_XP_PER_WEIGHT;
                    return (
                      <div key={task.id} className={`space-y-2 rounded-xl border px-2 py-2 transition ${taskRowClass(status)}`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">{task.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {taskDifficultyLabel(task.difficulty)} • peso {task.weight}
                            </p>
                            <p className="text-xs font-semibold text-secondary">+{xpPerApproval} XP por aprovação</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {progress?.completed_today ? (
                              <span className="rounded-xl bg-secondary/15 px-2 py-0.5 text-xs font-semibold text-secondary">Concluída hoje</span>
                            ) : null}
                            {status ? (
                                <span className={`rounded-xl px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(status)}`}>
                                  {routineStatusLabel(status)}
                                </span>
                            ) : null}
                            <ActionFeedback
                              type="button"
                              state={taskFeedback[task.id] ?? "idle"}
                              loadingLabel="Marcando..."
                              disabled={isProcessing || isMarked}
                              className="axiora-chunky-btn axiora-control-btn px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                              onClick={() => void onMarkTask(task.id)}
                            >
                              {isMarked ? "Marcada" : "Marcar"}
                            </ActionFeedback>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                            <span>Progresso semanal</span>
                            <span>{completionPercent.toFixed(0)}%</span>
                          </div>
                          <ProgressBar tone="secondary" value={completionPercent} />
                          <p className="text-[11px] text-muted-foreground">
                            {progress
                              ? `${progress.approved_count_week}/${progress.marked_count_week} aprovações • +${progress.xp_gained_week} XP na semana`
                              : "Sem marcações nesta semana"}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              {routineLogs.length === 0 ? (
                <p className="py-3 text-center text-xs text-muted-foreground">Sem registros da semana ainda.</p>
              ) : taskView === "list" ? (
                <details className="rounded-xl border border-border bg-background px-3 py-2">
                  <summary className="cursor-pointer list-none text-xs font-semibold text-muted-foreground">Ver histórico da semana</summary>
                  <div className="mt-2 space-y-1.5">
                    {groupedWeeklyLogs.map((group) => (
                      <p key={group.status} className="text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">{group.title}:</span> {group.items.length}
                      </p>
                    ))}
                    <div className="mt-2 space-y-1">
                      {weeklyLogs.slice(0, 8).map((log) => (
                        <p key={log.id} className="text-xs text-muted-foreground">
                          <span className="font-semibold text-foreground">{log.date}</span> • {log.task_title} • {routineStatusLabel(log.status)}
                          {log.xp_awarded > 0 ? ` • +${log.xp_awarded} XP` : ""}
                        </p>
                      ))}
                    </div>
                  </div>
                </details>
              ) : (
                <div className="overflow-x-auto pb-2">
                  <div className="relative flex min-w-max items-center gap-3 px-1 py-3">
                    {weeklyLogs.map((log, index) => (
                      <div key={log.id} className="flex items-center gap-3">
                        <div className="flex flex-col items-center gap-1">
                          <span className={`h-5 w-5 rounded-full border-2 ${checkpointClass(log.status)}`} />
                          <span className="max-w-20 truncate text-xs text-muted-foreground">{log.task_title || taskLabelById[log.task_id] || `#${log.task_id}`}</span>
                        </div>
                        {index < weeklyLogs.length - 1 ? <span className="h-0.5 w-8 bg-[#E5D5C0]" /> : null}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          {childId !== null && !isSchoolTenant ? (
            <details className="rounded-2xl border border-border bg-card px-4 py-3">
              <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Recomendações do Axion
              </summary>
              <div className="mt-3">
                <RecommendationsPanel childId={childId} />
              </div>
            </details>
          ) : null}
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
    </>
  );
}

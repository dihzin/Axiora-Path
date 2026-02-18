"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Coins, Flame, Lock, Snowflake, Sparkles, X } from "lucide-react";

import { ActionFeedback, type ActionFeedbackState } from "@/components/action-feedback";
import { MoodSelector } from "@/components/axiora/MoodSelector";
import { AxionCharacter } from "@/components/axion-character";
import { AxionDialogue } from "@/components/axion-dialogue";
import { AvatarEvolution } from "@/components/avatar-evolution";
import { ChildBottomNav } from "@/components/child-bottom-nav";
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
  type RoutineWeekLog,
  type StreakResponse,
  type AxionStateResponse,
  type WeeklyMetricsResponse,
  type WalletSummaryResponse,
} from "@/lib/api/client";
import { enqueueDailyMissionComplete } from "@/lib/offline-queue";
import { getSoundEnabled as getChildSoundEnabled, playSound, setSoundEnabled as setChildSoundEnabled } from "@/lib/sound-manager";
import type { Mood } from "@/lib/types/mood";
import { cn } from "@/lib/utils";

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
  if (mood === "HAPPY") return "CELEBRATING";
  if (mood === "SAD" || mood === "ANGRY") return "CONCERNED";
  return "NEUTRAL";
}

function formatShortDate(isoDate: string): string {
  const today = new Date().toISOString().slice(0, 10);
  if (isoDate === today) return "Hoje";
  const parsed = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(parsed);
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

function taskDifficultyLabel(value: string): string {
  if (value === "EASY") return "Fácil";
  if (value === "MEDIUM") return "Média";
  if (value === "HARD") return "Difícil";
  if (value === "LEGENDARY") return "Lendária";
  return value;
}

function axionMoodStateLabel(value: string): string {
  if (value === "NEUTRAL") return "Neutro";
  if (value === "CELEBRATING") return "Comemorando";
  if (value === "CONCERNED") return "Atento";
  if (value === "EXCITED") return "Animado";
  if (value === "PROUD") return "Orgulhoso";
  return value;
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
  const [todayMood, setTodayMood] = useState<Mood | null>(null);
  const [moodError, setMoodError] = useState<string | null>(null);
  const [xpBarPercent, setXpBarPercent] = useState(0);
  const [moodFeedback, setMoodFeedback] = useState<ActionFeedbackState>("idle");
  const [missionFeedback, setMissionFeedback] = useState<ActionFeedbackState>("idle");
  const [taskFeedback, setTaskFeedback] = useState<Record<number, ActionFeedbackState>>({});
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [levelUpOverlayLevel, setLevelUpOverlayLevel] = useState<number | null>(null);
  const [avatarStage, setAvatarStage] = useState(1);
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
    const rawChildId = localStorage.getItem("axiora_child_id");
    if (!rawChildId) {
      router.push("/select-child");
      return;
    }
    const parsedChildId = Number(rawChildId);
    if (!Number.isFinite(parsedChildId)) {
      router.push("/select-child");
      return;
    }
    const rawChildName = localStorage.getItem("axiora_child_name");
    if (rawChildName) {
      setChildName(rawChildName);
    }
    setChildId(parsedChildId);
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
          localStorage.setItem("axiora_child_id", String(fallbackChild.id));
          localStorage.setItem("axiora_child_name", fallbackChild.display_name);
          setChildId(fallbackChild.id);
          setChildName(fallbackChild.display_name);
          setTheme(fallbackChild.theme);
          setAvatarStage(fallbackChild.avatar_stage);
          return;
        }
        if (child) {
          localStorage.setItem("axiora_child_name", child.display_name);
          setChildName(child.display_name);
          setTheme(child.theme);
          setAvatarStage(child.avatar_stage);
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
    getWeeklyMetrics(parsedChildId)
      .then((data) => setWeeklyMetrics(data))
      .catch(() => {
        setWeeklyMetrics(null);
      });
    getRoutineWeek(parsedChildId, todayIso)
      .then((data) => setRoutineLogs(data.logs))
      .catch(() => {
        setRoutineLogs([]);
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
      } catch {
        // ignore poll errors in MVP
      }
    };

    const interval = window.setInterval(() => {
      void refreshLevel();
    }, 20000);
    return () => window.clearInterval(interval);
  }, [childId]);

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

  useEffect(() => {
    if (childId === null || levelUpOverlayLevel === null || !soundEnabled) return;
    playSound("level_up", { childId, theme });
  }, [childId, levelUpOverlayLevel, soundEnabled, theme]);

  useEffect(() => {
    if (childId === null || levelUpOverlayLevel === null) return;
    triggerAxionCelebration("level_up");
  }, [childId, levelUpOverlayLevel]);

  useEffect(() => {
    if (!level) return;
    const next = Math.max(0, Math.min(100, level.level_progress_percent));
    const timer = window.setTimeout(() => {
      setXpBarPercent(next);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [level?.xp_total, level?.level_progress_percent]);

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
    const success = await onSelectMood(mood);
    if (success) {
      dismissDailyWelcome();
    }
  };

  const onMarkTask = async (taskId: number) => {
    if (childId === null || markingTaskIds.includes(taskId)) return;
    if (routineLogs.some((log) => log.task_id === taskId && log.date === todayIso)) return;

    const optimisticId = -Date.now() - taskId;
    const optimisticLog: RoutineWeekLog = {
      id: optimisticId,
      child_id: childId,
      task_id: taskId,
      date: todayIso,
      status: "PENDING",
      created_at: new Date().toISOString(),
      decided_at: null,
      decided_by_user_id: null,
      parent_comment: null,
    };

    setMarkingTaskIds((prev) => [...prev, taskId]);
    setTaskFeedbackState(taskId, "loading");
    setRoutineLogs((prev) => [optimisticLog, ...prev]);
    try {
      const created = await markRoutine(childId, taskId, todayIso);
      setRoutineLogs((prev) => prev.map((log) => (log.id === optimisticId ? created : log)));
      setTaskFeedbackState(taskId, "success");
      showToast("Tarefa marcada", "success");
    } catch {
      setRoutineLogs((prev) => prev.filter((log) => log.id !== optimisticId));
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

  const missionRarityBadgeClass = (rarity: DailyMissionResponse["rarity"]) => {
    if (rarity === "epic") return "border-primary/25 bg-primary/10 text-primary";
    if (rarity === "special") return "border-secondary/25 bg-secondary/10 text-secondary";
    return "border-border bg-muted text-muted-foreground";
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
      <main
        className={cn(
          "safe-px safe-pb mx-auto flex min-h-screen w-full flex-col p-4 pb-24 pt-5 md:p-6 md:pb-24",
          isSchoolTenant ? "max-w-md md:max-w-3xl" : "max-w-md md:max-w-2xl",
        )}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium text-muted-foreground">{childName ? `Perfil: ${childName}` : "Perfil infantil"}</p>
          <button
            type="button"
            aria-label="Abrir modo pais"
            className="inline-flex items-center gap-1.5 rounded-2xl border-2 border-border bg-white px-2.5 py-1.5 text-sm font-semibold text-muted-foreground shadow-[0_2px_0_rgba(184,200,239,0.7)] transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2"
            onClick={() => router.push("/parent-pin")}
          >
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-lg bg-muted">
              <Lock className="h-3.5 w-3.5 stroke-[2.6]" />
            </span>
            Modo pais
          </button>
        </div>
        <Card className={cn("mb-4 bg-card", dailyMission ? missionCardClass(dailyMission.status) : "border-border shadow-sm")}>
            <CardHeader className="p-5 pb-2 md:p-6 md:pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-lg font-bold tracking-tight">Missão do Dia</CardTitle>
                {dailyMission ? (
                  <span
                    className={`rounded-full border px-2 py-0.5 text-sm font-semibold uppercase tracking-wide ${missionRarityBadgeClass(
                      dailyMission.rarity,
                    )}`}
                  >
                    {missionRarityLabel(dailyMission.rarity)}
                  </span>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-2.5 p-5 pt-0 text-sm md:p-6 md:pt-0">
              {dailyMission ? (
                <>
                  <p className="text-sm font-semibold text-foreground">{dailyMission.title}</p>
                  <p className="text-sm leading-relaxed text-muted-foreground">{dailyMission.description}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-1.5 rounded-xl border border-border bg-background px-2 py-1.5 text-sm font-semibold">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-secondary/15">
                        <Sparkles className="h-3.5 w-3.5 stroke-[2.6] text-secondary" />
                      </span>
                      +{dailyMission.xp_reward} XP
                    </div>
                    <div className="flex items-center gap-1.5 rounded-xl border border-border bg-background px-2 py-1.5 text-sm font-semibold">
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
                    className="w-full rounded-xl bg-primary px-3 py-2.5 text-sm font-bold text-primary-foreground shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
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
        <Card
          className={cn(
            "relative mb-6 overflow-hidden border-border shadow-md",
            isSchoolTenant ? "bg-muted" : "axion-card-idle bg-muted",
          )}
        >
          <CardHeader className="p-5 pb-2 text-center md:p-6 md:pb-2">
            <CardTitle className="text-2xl font-extrabold tracking-tight">Axion</CardTitle>
            <p className="text-sm text-secondary">Seu parceiro de Missão</p>
          </CardHeader>
          <CardContent className="space-y-3 p-5 pt-0 text-sm text-center md:p-6 md:pt-0">
            {axionCelebration ? (
              <div className="celebrate-badge-pop absolute right-3 top-3 rounded-xl border border-secondary/35 bg-secondary/10 px-2 py-0.5 text-sm font-semibold text-secondary">
                {AXION_CELEBRATION_BADGES[axionCelebration]}
              </div>
            ) : null}
            <div className="mx-auto flex w-full max-w-[18rem] justify-center">
              <div className="rounded-full border border-accent/20 bg-[radial-gradient(circle_at_50%_35%,rgba(30,42,56,0.12),rgba(30,42,56,0.02)_70%)] p-3 shadow-md">
                <AxionCharacter
                  stage={axionState?.stage ?? 1}
                  moodState={axionState?.mood_state ?? "NEUTRAL"}
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
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <span className="rounded-xl border border-border bg-background px-2 py-1">Estágio {axionState?.stage ?? 1}</span>
              <span className="rounded-xl border border-border bg-background px-2 py-1">
                {axionMoodStateLabel(axionState?.mood_state ?? "NEUTRAL")}
              </span>
            </div>
          </CardContent>
        </Card>
        <section className={cn("space-y-4", isSchoolTenant && "grid gap-4 lg:grid-cols-[1.15fr_1fr] lg:items-start lg:space-y-0")}>
          {showDailyWelcome ? (
            <Card className="bg-card">
              <CardHeader className="p-5 md:p-6">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-base">Pronto para a missão de hoje?</CardTitle>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label="Alternar som"
                      className="text-sm text-muted-foreground underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2"
                      onClick={onToggleSound}
                    >
                      Som: {soundEnabled ? "ligado" : "desligado"}
                    </button>
                    <button
                      type="button"
                      aria-label="Fechar boas-vindas"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-xl border border-border bg-white text-muted-foreground shadow-[0_2px_0_rgba(184,200,239,0.6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2"
                      onClick={dismissDailyWelcome}
                    >
                      <X className="h-4 w-4 stroke-[2.6]" />
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 p-5 pt-0 text-sm md:p-6 md:pt-0">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Sequência</span>
                  <span className="font-semibold">{streakCount} dias</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Meta principal</span>
                  <span className="text-right font-semibold">
                    {activeGoal ? `${activeGoal.title} • ${formatBRL(activeGoal.target_cents)}` : "Sem meta"}
                  </span>
                </div>
                <div>
                  <p className="mb-2 text-sm text-muted-foreground">Humor rápido</p>
                  <MoodSelector value={todayMood ?? undefined} onChange={(mood) => void onQuickMood(mood)} />
                  {moodFeedback === "loading" ? <p className="mt-2 text-sm text-muted-foreground">Salvando humor...</p> : null}
                  {moodError ? <p className="mt-2 text-sm text-destructive">{moodError}</p> : null}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-card">
              <CardContent className="flex items-center justify-between gap-2 p-4">
                <p className="text-sm font-medium text-muted-foreground">Painel da missão recolhido</p>
                <ActionFeedback
                  type="button"
                  className="rounded-xl border border-border bg-white px-3 py-1 text-sm font-semibold text-foreground"
                  onClick={restoreDailyWelcome}
                >
                  Mostrar painel
                </ActionFeedback>
              </CardContent>
            </Card>
          )}
          <Card className="border-border/80 bg-card">
            <CardHeader className="p-5 pb-2 md:p-6 md:pb-2">
              <CardTitle className="text-lg font-semibold">Progresso</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-5 pt-0 md:p-6 md:pt-0">
              <div className="grid gap-3 sm:grid-cols-2">
                <PiggyJar
                  currentSaveAmountCents={currentSave}
                  nextGoalAmountCents={nextGoal}
                  savePercent={savePercent}
                  isLocked={goalLocked}
                />
                <div className="rounded-xl border border-border bg-card p-5 shadow-sm md:p-6">
                  <p className="mb-2 text-sm font-semibold text-foreground">Avatar</p>
                  <AvatarEvolution stage={avatarStage} />
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card p-5 shadow-sm md:p-6">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">XP</span>
                  <span className="font-medium text-muted-foreground">
                    Nível {level?.level ?? 1} • {xpBarPercent.toFixed(0)}%
                  </span>
                </div>
                <ProgressBar tone="secondary" value={xpBarPercent} />
              </div>
              <WeeklyBossMeter completionRate={weeklyMetrics?.completion_rate ?? 0} />
            </CardContent>
          </Card>
          <Card className="bg-muted">
            <CardHeader className="p-5 md:p-6">
              <CardTitle className="text-lg">Lista de tarefas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-5 pt-0 text-sm text-muted-foreground md:p-6 md:pt-0">
              <div className="flex items-center justify-between">
                <div className="inline-flex rounded-xl border border-border p-0.5 text-sm">
                  <button
                    type="button"
                    className={`rounded-xl px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 ${taskView === "list" ? "bg-primary/10 text-foreground" : "text-muted-foreground"}`}
                    onClick={() => onToggleTaskView("list")}
                  >
                    Lista
                  </button>
                  <button
                    type="button"
                    className={`rounded-xl px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 ${taskView === "journey" ? "bg-primary/10 text-foreground" : "text-muted-foreground"}`}
                    onClick={() => onToggleTaskView("journey")}
                  >
                    Jornada
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-xl border border-border bg-white shadow-[0_2px_0_rgba(184,200,239,0.6)]">
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
                  tasks.map((task) => {
                    const status = taskStatusById[task.id];
                    const isProcessing = markingTaskIds.includes(task.id);
                    const isMarked = status !== undefined;
                    return (
                      <div
                        key={task.id}
                        className={`flex items-center justify-between gap-2 rounded-xl border px-2 py-2 transition ${taskRowClass(status)}`}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{task.title}</p>
                          <p className="text-sm text-muted-foreground">
                            {taskDifficultyLabel(task.difficulty)} • peso {task.weight}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {status ? (
                            <span className={`rounded-xl px-2 py-0.5 text-sm font-semibold ${statusBadgeClass(status)}`}>
                              {routineStatusLabel(status)}
                            </span>
                          ) : null}
                          <ActionFeedback
                            type="button"
                            state={taskFeedback[task.id] ?? "idle"}
                            loadingLabel="Marcando..."
                            disabled={isProcessing || isMarked}
                            className="rounded-xl border border-border px-2 py-1 text-sm font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]"
                            onClick={() => void onMarkTask(task.id)}
                          >
                            {isMarked ? "Marcada" : "Marcar"}
                          </ActionFeedback>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              {routineLogs.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">Sem registros da semana ainda.</p>
              ) : taskView === "list" ? (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-foreground">Histórico da semana</p>
                  {groupedWeeklyLogs.map((group) => (
                    <div key={group.status} className="space-y-1.5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {group.title} ({group.items.length})
                      </p>
                      {group.items.map((log) => (
                        <div key={log.id} className="flex items-center justify-between rounded-xl border border-border px-2 py-1.5">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">{taskLabelById[log.task_id] ?? "Tarefa não encontrada"}</p>
                            <p className="text-xs text-muted-foreground">{formatShortDate(log.date)}</p>
                          </div>
                          <span className={`rounded-xl px-2 py-0.5 text-sm font-semibold ${statusBadgeClass(log.status)}`}>
                            {routineStatusLabel(log.status)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto pb-2">
                  <div className="relative flex min-w-max items-center gap-3 px-1 py-3">
                    {weeklyLogs.map((log, index) => (
                      <div key={log.id} className="flex items-center gap-3">
                        <div className="flex flex-col items-center gap-1">
                          <span className={`h-5 w-5 rounded-full border-2 ${checkpointClass(log.status)}`} />
                          <span className="max-w-20 truncate text-xs text-muted-foreground">{taskLabelById[log.task_id] ?? `#${log.task_id}`}</span>
                        </div>
                        {index < weeklyLogs.length - 1 ? <span className="h-0.5 w-8 bg-border" /> : null}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          {childId !== null ? <RecommendationsPanel childId={childId} /> : null}
        </section>

        <ChildBottomNav />
        {toast ? (
          <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-4">
            <div className={`rounded-xl px-3 py-2 text-xs font-semibold text-white shadow-sm ${toast.type === "success" ? "bg-secondary" : "bg-destructive"}`}>
              {toast.message}
            </div>
          </div>
        ) : null}
      </main>
    </>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Flame, Home, Lock, Snowflake, Sparkles, Star, X } from "lucide-react";

import { AxionCharacter } from "@/components/axion-character";
import { AxionDialogue } from "@/components/axion-dialogue";
import { AvatarEvolution } from "@/components/avatar-evolution";
import { LevelUpOverlay } from "@/components/level-up-overlay";
import { useTheme } from "@/components/theme-provider";
import { PiggyJar } from "@/components/piggy-jar";
import { RecommendationsPanel } from "@/components/recommendations-panel";
import { WeeklyBossMeter } from "@/components/weekly-boss-meter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  completeDailyMission,
  getDailyMission,
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
  updateChildTheme,
  useAiCoach,
  type DailyMissionResponse,
  type GoalOut,
  type LevelResponse,
  type MoodType,
  type RoutineWeekLog,
  type StreakResponse,
  type AxionStateResponse,
  type ThemeName,
  type WeeklyMetricsResponse,
  type WalletSummaryResponse,
} from "@/lib/api/client";
import { enqueueDailyMissionComplete } from "@/lib/offline-queue";
import { getSoundEnabled as getChildSoundEnabled, playSound, setSoundEnabled as setChildSoundEnabled } from "@/lib/sound-manager";
import { THEME_LIST } from "@/lib/theme";

const MOOD_OPTIONS: Array<{ mood: MoodType; emoji: string; label: string }> = [
  { mood: "HAPPY", emoji: "😀", label: "Happy" },
  { mood: "OK", emoji: "🙂", label: "Ok" },
  { mood: "SAD", emoji: "😕", label: "Sad" },
  { mood: "ANGRY", emoji: "😠", label: "Angry" },
  { mood: "TIRED", emoji: "🥱", label: "Tired" },
];

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

type ChildTask = {
  id: number;
  title: string;
  difficulty: string;
  weight: number;
  is_active: boolean;
};

type AxionCelebrationType = "streak_7" | "streak_30" | "level_up" | "goal_completed";

const AXION_CELEBRATION_PHRASES: Record<AxionCelebrationType, string> = {
  streak_7: "Sete dias seguidos! Axion esta em modo lenda!",
  streak_30: "Trinta dias! Axion desbloqueou energia maxima!",
  level_up: "Level up! Axion evoluiu junto com voce!",
  goal_completed: "Meta concluida! Axion esta comemorando essa conquista!",
};

const AXION_CELEBRATION_BADGES: Record<AxionCelebrationType, string> = {
  streak_7: "Streak 7",
  streak_30: "Streak 30",
  level_up: "Level Up",
  goal_completed: "Meta Concluida",
};

export default function ChildPage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [childId, setChildId] = useState<number | null>(null);
  const [tasks, setTasks] = useState<ChildTask[]>([]);
  const [streak, setStreak] = useState<StreakResponse | null>(null);
  const [walletSummary, setWalletSummary] = useState<WalletSummaryResponse | null>(null);
  const [goals, setGoals] = useState<GoalOut[]>([]);
  const [level, setLevel] = useState<LevelResponse | null>(null);
  const [weeklyMetrics, setWeeklyMetrics] = useState<WeeklyMetricsResponse | null>(null);
  const [routineLogs, setRoutineLogs] = useState<RoutineWeekLog[]>([]);
  const [todayMood, setTodayMood] = useState<MoodType | null>(null);
  const [xpBarPercent, setXpBarPercent] = useState(0);
  const [themeSaving, setThemeSaving] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [levelUpOverlayLevel, setLevelUpOverlayLevel] = useState<number | null>(null);
  const [avatarStage, setAvatarStage] = useState(1);
  const [taskView, setTaskView] = useState<"list" | "journey">("list");
  const [showDailyWelcome, setShowDailyWelcome] = useState(false);
  const [dailyMission, setDailyMission] = useState<DailyMissionResponse | null>(null);
  const [missionCompleting, setMissionCompleting] = useState(false);
  const [markingTaskIds, setMarkingTaskIds] = useState<number[]>([]);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [axionState, setAxionState] = useState<AxionStateResponse | null>(null);
  const [axionDialogue, setAxionDialogue] = useState<{ message: string; visible: boolean }>({ message: "", visible: false });
  const [axionCelebration, setAxionCelebration] = useState<AxionCelebrationType | null>(null);
  const lastKnownLevelRef = useRef<number | null>(null);
  const lastKnownStreakRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const goalNearShownRef = useRef(false);
  const celebrationTimerRef = useRef<number | null>(null);
  const previousGoalRef = useRef<{ id: number; isLocked: boolean } | null>(null);
  const todayIso = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    const rawChildId = localStorage.getItem("axiora_child_id");
    if (!rawChildId) return;
    const parsedChildId = Number(rawChildId);
    if (!Number.isFinite(parsedChildId)) return;
    setChildId(parsedChildId);
    setSoundEnabled(getChildSoundEnabled(parsedChildId));
    const savedTaskView = localStorage.getItem("axiora_task_view");
    if (savedTaskView === "journey" || savedTaskView === "list") {
      setTaskView(savedTaskView);
    }
    const welcomeKey = `axiora_daily_welcome_${parsedChildId}_${todayIso}`;
    setShowDailyWelcome(localStorage.getItem(welcomeKey) !== "1");
    getTasks()
      .then((data) => setTasks(data.filter((task) => task.is_active)))
      .catch(() => {
        setTasks([]);
      });
    getAxionState(parsedChildId)
      .then((data) => setAxionState(data))
      .catch(() => {
        setAxionState(null);
      });
    getMe()
      .then((data) => {
        const child = data.child_profiles.find((item) => item.id === parsedChildId);
        if (child) {
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
        setTodayMood(found?.mood ?? null);
      })
      .catch(() => {
        setTodayMood(null);
      });
    getDailyMission(parsedChildId)
      .then((data) => setDailyMission(data))
      .catch(() => {
        setDailyMission(null);
      });
  }, []);

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

  const fetchCoachDialogue = async (reason: "first_login" | "streak_milestone" | "level_up" | "goal_near") => {
    if (childId === null) return;
    try {
      const response = await useAiCoach(childId, "CHILD", `context:${reason}`);
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

  const onSelectMood = async (mood: MoodType) => {
    if (childId === null) return;
    setTodayMood(mood);
    try {
      await postMood(childId, mood);
      showToast("Humor atualizado", "success");
    } catch {
      showToast("Falha ao salvar humor", "error");
    }
  };

  const onSelectTheme = async (nextTheme: ThemeName) => {
    if (childId === null || themeSaving || nextTheme === theme) return;
    const previousTheme = theme;
    setTheme(nextTheme);
    setThemeSaving(true);
    try {
      await updateChildTheme(childId, nextTheme);
      showToast("Tema atualizado", "success");
    } catch {
      setTheme(previousTheme);
      showToast("Falha ao atualizar tema", "error");
    } finally {
      setThemeSaving(false);
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
    if (childId === null) return;
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem(`axiora_daily_welcome_${childId}_${today}`, "1");
    setShowDailyWelcome(false);
  };

  const onQuickMood = async (mood: MoodType) => {
    await onSelectMood(mood);
    dismissDailyWelcome();
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
    setRoutineLogs((prev) => [optimisticLog, ...prev]);
    try {
      const created = await markRoutine(childId, taskId, todayIso);
      setRoutineLogs((prev) => prev.map((log) => (log.id === optimisticId ? created : log)));
      showToast("Tarefa marcada", "success");
    } catch {
      setRoutineLogs((prev) => prev.filter((log) => log.id !== optimisticId));
      showToast("Falha ao marcar tarefa", "error");
    } finally {
      setMarkingTaskIds((prev) => prev.filter((id) => id !== taskId));
    }
  };

  const onCompleteDailyMission = async () => {
    if (!dailyMission || missionCompleting) return;
    if (dailyMission.status === "completed") return;

    setMissionCompleting(true);
    if (!navigator.onLine) {
      await enqueueDailyMissionComplete({ mission_id: dailyMission.id });
      setDailyMission((prev) => (prev ? { ...prev, status: "completed" } : prev));
      showToast("Missao concluida offline. Vai sincronizar ao reconectar.", "success");
      setMissionCompleting(false);
      return;
    }

    try {
      await completeDailyMission(dailyMission.id);
      setDailyMission((prev) => (prev ? { ...prev, status: "completed" } : prev));
      showToast("Missao concluida!", "success");
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
    } catch {
      await enqueueDailyMissionComplete({ mission_id: dailyMission.id });
      setDailyMission((prev) => (prev ? { ...prev, status: "completed" } : prev));
      showToast("Sem conexao. Missao enfileirada para sincronizar.", "success");
    } finally {
      setMissionCompleting(false);
    }
  };

  const statusBadgeClass = (status: RoutineWeekLog["status"]) => {
    if (status === "APPROVED") return "bg-emerald-100 text-emerald-700";
    if (status === "REJECTED") return "bg-red-100 text-red-700";
    return "bg-amber-100 text-amber-700";
  };

  const checkpointClass = (status: RoutineWeekLog["status"]) => {
    if (status === "APPROVED") return "border-emerald-500 bg-emerald-500";
    if (status === "REJECTED") return "border-red-500 bg-red-500";
    return "border-amber-500 bg-amber-500";
  };

  const taskStatusById = routineLogs.reduce<Record<number, RoutineWeekLog["status"]>>((acc, log) => {
    if (log.date !== todayIso) return acc;
    acc[log.task_id] = log.status;
    return acc;
  }, {});

  const taskRowClass = (status: RoutineWeekLog["status"] | undefined) => {
    if (status === "APPROVED") return "border-emerald-300 bg-emerald-50";
    if (status === "REJECTED") return "border-red-300 bg-red-50";
    if (status === "PENDING") return "border-amber-300 bg-amber-50";
    return "border-border bg-background";
  };

  return (
    <>
      {levelUpOverlayLevel !== null ? (
        <LevelUpOverlay level={levelUpOverlayLevel} onDismiss={() => setLevelUpOverlayLevel(null)} />
      ) : null}
      <main className="safe-px safe-pb mx-auto flex min-h-screen w-full max-w-md flex-col pb-24 pt-5">
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-muted"
            onClick={() => router.push("/parent-pin")}
          >
            <Lock className="h-3.5 w-3.5" />
            Modo pais
          </button>
        </div>
        <Card className="relative">
          <CardHeader>
            <CardTitle className="text-base">Axion</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {axionCelebration ? (
              <div className="celebrate-badge-pop absolute right-3 top-3 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                {AXION_CELEBRATION_BADGES[axionCelebration]}
              </div>
            ) : null}
            <AxionCharacter
              stage={axionState?.stage ?? 1}
              moodState={axionState?.mood_state ?? "NEUTRAL"}
              celebrating={axionCelebration !== null}
            />
            <AxionDialogue
              message={axionDialogue.message}
              visible={axionDialogue.visible}
              onDismiss={() => setAxionDialogue((prev) => ({ ...prev, visible: false }))}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Stage {axionState?.stage ?? 1}</span>
              <span>{axionState?.mood_state ?? "NEUTRAL"}</span>
            </div>
          </CardContent>
        </Card>
        <section className="space-y-3">
          {showDailyWelcome ? (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-base">Ready for today&apos;s mission?</CardTitle>
                  <button type="button" className="text-muted-foreground" onClick={dismissDailyWelcome}>
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Streak</span>
                  <span className="font-semibold">{streakCount} dias</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Main goal</span>
                  <span className="text-right font-semibold">
                    {activeGoal ? `${activeGoal.title} • ${formatBRL(activeGoal.target_cents)}` : "Sem meta"}
                  </span>
                </div>
                <div>
                  <p className="mb-2 text-xs text-muted-foreground">Quick mood</p>
                  <div className="flex items-center gap-2">
                    {MOOD_OPTIONS.map((option) => (
                      <button
                        key={`quick-${option.mood}`}
                        type="button"
                        title={option.label}
                        className={`rounded-full border px-2 py-1 text-lg transition ${
                          todayMood === option.mood ? "border-primary bg-primary/10" : "border-border bg-background"
                        }`}
                        onClick={() => void onQuickMood(option.mood)}
                      >
                        {option.emoji}
                      </button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}
          {dailyMission ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Missao diaria</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="font-semibold">{dailyMission.title}</p>
                <p className="text-muted-foreground">{dailyMission.description}</p>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="capitalize">Raridade: {dailyMission.rarity}</span>
                  <span>
                    +{dailyMission.xp_reward} XP / +{dailyMission.coin_reward} moedas
                  </span>
                </div>
                <button
                  type="button"
                  disabled={missionCompleting || dailyMission.status === "completed"}
                  className="w-full rounded-md border border-border px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => void onCompleteDailyMission()}
                >
                  {missionCompleting ? "Processando..." : dailyMission.status === "completed" ? "Concluida" : "Concluir missao"}
                </button>
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Como voc est hoje?</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                {MOOD_OPTIONS.map((option) => (
                  <button
                    key={option.mood}
                    type="button"
                    title={option.label}
                    className={`rounded-full border px-2 py-1 text-xl transition ${
                      todayMood === option.mood ? "border-primary bg-primary/10" : "border-border bg-background"
                    }`}
                    onClick={() => void onSelectMood(option.mood)}
                  >
                    {option.emoji}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Area da crianca</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>MVP mobile com navegao inferior. Conteudo funcional sera ligado aos endpoints na proxima etapa.</p>
              <button type="button" className="text-xs text-muted-foreground underline" onClick={onToggleSound}>
                Sound: {soundEnabled ? "on" : "off"}
              </button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tema</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-2 text-xs">
              {THEME_LIST.map((item) => (
                <button
                  key={item}
                  type="button"
                  disabled={themeSaving}
                  className={`rounded-md border px-2 py-2 capitalize transition ${
                    theme === item ? "border-primary bg-primary/10 text-foreground" : "border-border bg-background text-muted-foreground"
                  }`}
                  onClick={() => void onSelectTheme(item)}
                >
                  {item}
                </button>
              ))}
            </CardContent>
          </Card>
          <PiggyJar currentSaveAmountCents={currentSave} nextGoalAmountCents={nextGoal} savePercent={savePercent} isLocked={goalLocked} />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Avatar</CardTitle>
            </CardHeader>
            <CardContent>
              <AvatarEvolution stage={avatarStage} />
            </CardContent>
          </Card>
          <WeeklyBossMeter completionRate={weeklyMetrics?.completion_rate ?? 0} />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">XP</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span>Nvel {level?.level ?? 1}</span>
                <span className="text-muted-foreground">{xpBarPercent.toFixed(0)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-[width] duration-700 ease-out"
                  style={{ width: `${xpBarPercent}%` }}
                />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Lista de tarefas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <div className="flex items-center justify-between">
                <div className="inline-flex rounded-md border border-border p-0.5 text-xs">
                  <button
                    type="button"
                    className={`rounded px-2 py-1 ${taskView === "list" ? "bg-primary/10 text-foreground" : "text-muted-foreground"}`}
                    onClick={() => onToggleTaskView("list")}
                  >
                    List View
                  </button>
                  <button
                    type="button"
                    className={`rounded px-2 py-1 ${taskView === "journey" ? "bg-primary/10 text-foreground" : "text-muted-foreground"}`}
                    onClick={() => onToggleTaskView("journey")}
                  >
                    Journey View
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Flame className={`flame-flicker ${flameClassName} text-orange-500`} />
                <span>Streak: {streakCount} dias</span>
                {streak?.freeze_used_today ? <Snowflake className="h-3.5 w-3.5 text-sky-500" /> : null}
              </div>
              <div className="space-y-2">
                {tasks.length === 0 ? (
                  <p>Nenhuma tarefa ativa para hoje.</p>
                ) : (
                  tasks.map((task) => {
                    const status = taskStatusById[task.id];
                    const isProcessing = markingTaskIds.includes(task.id);
                    const isMarked = status !== undefined;
                    return (
                      <div
                        key={task.id}
                        className={`flex items-center justify-between gap-2 rounded-md border px-2 py-2 transition ${taskRowClass(status)}`}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-foreground">{task.title}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {task.difficulty} • peso {task.weight}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {status ? (
                            <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${statusBadgeClass(status)}`}>{status}</span>
                          ) : null}
                          <button
                            type="button"
                            disabled={isProcessing || isMarked}
                            className="rounded-md border border-border px-2 py-1 text-[10px] font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]"
                            onClick={() => void onMarkTask(task.id)}
                          >
                            {isProcessing ? "Marcando..." : isMarked ? "Marcada" : "Marcar"}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              {routineLogs.length === 0 ? (
                <p>Sem checkpoints da semana ainda.</p>
              ) : taskView === "list" ? (
                <div className="space-y-2">
                  {routineLogs.map((log) => (
                    <div key={log.id} className="flex items-center justify-between rounded-md border border-border px-2 py-1">
                      <span className="text-xs">Task #{log.task_id}</span>
                      <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${statusBadgeClass(log.status)}`}>{log.status}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto pb-2">
                  <div className="relative flex min-w-max items-center gap-3 px-1 py-3">
                    {routineLogs.map((log, index) => (
                      <div key={log.id} className="flex items-center gap-3">
                        <div className="flex flex-col items-center gap-1">
                          <span className={`h-5 w-5 rounded-full border-2 ${checkpointClass(log.status)}`} />
                          <span className="text-[10px] text-muted-foreground">#{log.task_id}</span>
                        </div>
                        {index < routineLogs.length - 1 ? <span className="h-0.5 w-8 bg-border" /> : null}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          {childId !== null ? <RecommendationsPanel childId={childId} /> : null}
        </section>

        <nav className="safe-px safe-pb fixed inset-x-0 bottom-0 border-t border-border bg-background/95 py-2 backdrop-blur">
          <div className="mx-auto grid w-full max-w-md grid-cols-3 gap-1">
            <Link className="flex flex-col items-center gap-1 rounded-md py-2 text-xs font-medium text-primary" href="/child">
              <Home className="h-4 w-4" />
              Inicio
            </Link>
            <Link className="flex flex-col items-center gap-1 rounded-md py-2 text-xs text-muted-foreground" href="/child/stickers">
              <Star className="h-4 w-4" />
              Stickers
            </Link>
            <Link className="flex flex-col items-center gap-1 rounded-md py-2 text-xs text-muted-foreground" href="/child">
              <Sparkles className="h-4 w-4" />
              Coach
            </Link>
          </div>
        </nav>
        {toast ? (
          <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-4">
            <div
              className={`rounded-md px-3 py-2 text-xs font-semibold text-white shadow ${
                toast.type === "success" ? "bg-emerald-600" : "bg-red-600"
              }`}
            >
              {toast.message}
            </div>
          </div>
        ) : null}
      </main>
    </>
  );
}

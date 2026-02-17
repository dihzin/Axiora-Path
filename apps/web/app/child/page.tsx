"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Flame, Home, Snowflake, Sparkles, Star, X } from "lucide-react";

import { AvatarEvolution } from "@/components/avatar-evolution";
import { LevelUpOverlay } from "@/components/level-up-overlay";
import { useTheme } from "@/components/theme-provider";
import { PiggyJar } from "@/components/piggy-jar";
import { RecommendationsPanel } from "@/components/recommendations-panel";
import { WeeklyBossMeter } from "@/components/weekly-boss-meter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getMe,
  getGoals,
  getLevels,
  getMood,
  getRoutineWeek,
  getStreak,
  getWeeklyMetrics,
  getWalletSummary,
  postMood,
  updateChildTheme,
  type GoalOut,
  type LevelResponse,
  type MoodType,
  type RoutineWeekLog,
  type StreakResponse,
  type ThemeName,
  type WeeklyMetricsResponse,
  type WalletSummaryResponse,
} from "@/lib/api/client";
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

export default function ChildPage() {
  const { theme, setTheme } = useTheme();
  const [childId, setChildId] = useState<number | null>(null);
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
  const lastKnownLevelRef = useRef<number | null>(null);
  const lastKnownStreakRef = useRef<number | null>(null);

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
    const todayIso = new Date().toISOString().slice(0, 10);
    const welcomeKey = `axiora_daily_welcome_${parsedChildId}_${todayIso}`;
    setShowDailyWelcome(localStorage.getItem(welcomeKey) !== "1");
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
    if (childId === null || streak === null || !soundEnabled) return;
    const previous = lastKnownStreakRef.current;
    const current = streak.current;
    if (previous !== null && current > previous && (current === 7 || current === 14 || current === 21)) {
      playSound("streak_milestone", { childId, theme });
    }
    lastKnownStreakRef.current = current;
  }, [childId, soundEnabled, streak?.current, theme]);

  useEffect(() => {
    if (childId === null || levelUpOverlayLevel === null || !soundEnabled) return;
    playSound("level_up", { childId, theme });
  }, [childId, levelUpOverlayLevel, soundEnabled, theme]);

  useEffect(() => {
    if (!level) return;
    const next = Math.max(0, Math.min(100, level.level_progress_percent));
    const timer = window.setTimeout(() => {
      setXpBarPercent(next);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [level?.xp_total, level?.level_progress_percent]);

  const currentSave = walletSummary?.pot_balances_cents.SAVE ?? 0;
  const activeGoal = goals[0] ?? null;
  const nextGoal = activeGoal?.target_cents ?? null;
  const savePercent = nextGoal && nextGoal > 0 ? (currentSave / nextGoal) * 100 : 0;
  const goalLocked = activeGoal?.is_locked ?? false;
  const streakCount = streak?.current ?? 0;
  const flameClassName = getFlameIntensityClass(streakCount);

  const onSelectMood = async (mood: MoodType) => {
    if (childId === null) return;
    setTodayMood(mood);
    try {
      await postMood(childId, mood);
    } catch {
      // keep UI simple in MVP
    }
  };

  const onSelectTheme = async (nextTheme: ThemeName) => {
    if (childId === null || themeSaving || nextTheme === theme) return;
    const previousTheme = theme;
    setTheme(nextTheme);
    setThemeSaving(true);
    try {
      await updateChildTheme(childId, nextTheme);
    } catch {
      setTheme(previousTheme);
    } finally {
      setThemeSaving(false);
    }
  };

  const onToggleSound = () => {
    if (childId === null) return;
    setSoundEnabled((prev) => {
      const next = !prev;
      setChildSoundEnabled(childId, next);
      return next;
    });
  };

  const onToggleTaskView = (next: "list" | "journey") => {
    setTaskView(next);
    localStorage.setItem("axiora_task_view", next);
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

  return (
    <>
      {levelUpOverlayLevel !== null ? (
        <LevelUpOverlay level={levelUpOverlayLevel} onDismiss={() => setLevelUpOverlayLevel(null)} />
      ) : null}
      <main className="safe-px safe-pb mx-auto flex min-h-screen w-full max-w-md flex-col pb-24 pt-5">
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
      </main>
    </>
  );
}

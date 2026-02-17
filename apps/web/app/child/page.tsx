"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Flame, Home, Snowflake, Sparkles, Star } from "lucide-react";

import { PiggyJar } from "@/components/piggy-jar";
import { RecommendationsPanel } from "@/components/recommendations-panel";
import { WeeklyBossMeter } from "@/components/weekly-boss-meter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getGoals,
  getLevels,
  getMood,
  getStreak,
  getWeeklyMetrics,
  getWalletSummary,
  postMood,
  type GoalOut,
  type LevelResponse,
  type MoodType,
  type StreakResponse,
  type WeeklyMetricsResponse,
  type WalletSummaryResponse,
} from "@/lib/api/client";

const MOOD_OPTIONS: Array<{ mood: MoodType; emoji: string; label: string }> = [
  { mood: "HAPPY", emoji: "😀", label: "Happy" },
  { mood: "OK", emoji: "🙂", label: "Ok" },
  { mood: "SAD", emoji: "😕", label: "Sad" },
  { mood: "ANGRY", emoji: "😠", label: "Angry" },
  { mood: "TIRED", emoji: "🥱", label: "Tired" },
];

export default function ChildPage() {
  const [childId, setChildId] = useState<number | null>(null);
  const [streak, setStreak] = useState<StreakResponse | null>(null);
  const [walletSummary, setWalletSummary] = useState<WalletSummaryResponse | null>(null);
  const [goals, setGoals] = useState<GoalOut[]>([]);
  const [level, setLevel] = useState<LevelResponse | null>(null);
  const [weeklyMetrics, setWeeklyMetrics] = useState<WeeklyMetricsResponse | null>(null);
  const [todayMood, setTodayMood] = useState<MoodType | null>(null);
  const [xpBarPercent, setXpBarPercent] = useState(0);

  useEffect(() => {
    const rawChildId = localStorage.getItem("axiora_child_id");
    if (!rawChildId) return;
    const parsedChildId = Number(rawChildId);
    if (!Number.isFinite(parsedChildId)) return;
    setChildId(parsedChildId);

    getStreak(parsedChildId)
      .then((data) => setStreak(data))
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
      .then((data) => setLevel(data))
      .catch(() => {
        setLevel(null);
      });
    getWeeklyMetrics(parsedChildId)
      .then((data) => setWeeklyMetrics(data))
      .catch(() => {
        setWeeklyMetrics(null);
      });
    getMood(parsedChildId)
      .then((data) => {
        const today = new Date().toISOString().slice(0, 10);
        const found = data.find((item) => item.date === today);
        setTodayMood(found?.mood ?? null);
      })
      .catch(() => {
        setTodayMood(null);
      });
  }, []);

  useEffect(() => {
    if (!level) return;
    const next = Math.max(0, Math.min(100, level.level_progress_percent));
    const timer = window.setTimeout(() => {
      setXpBarPercent(next);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [level?.xp_total, level?.level_progress_percent]);

  const currentSave = walletSummary?.pot_balances_cents.SAVE ?? 0;
  const total = walletSummary?.total_balance_cents ?? 0;
  const savePercent = total > 0 ? (currentSave / total) * 100 : 0;
  const nextGoal = goals.length > 0 ? goals[0].target_cents : null;

  const onSelectMood = async (mood: MoodType) => {
    if (childId === null) return;
    setTodayMood(mood);
    try {
      await postMood(childId, mood);
    } catch {
      // keep UI simple in MVP
    }
  };

  return (
    <main className="safe-px safe-pb mx-auto flex min-h-screen w-full max-w-md flex-col pb-24 pt-5">
      <section className="space-y-3">
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
          <CardContent className="text-sm text-muted-foreground">
            MVP mobile com navegao inferior. Conteudo funcional sera ligado aos endpoints na proxima etapa.
          </CardContent>
        </Card>
        <PiggyJar currentSaveAmountCents={currentSave} nextGoalAmountCents={nextGoal} savePercent={savePercent} />
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
            <div className="flex items-center gap-2">
              <Flame className="flame-flicker h-4 w-4 text-orange-500" />
              <span>Streak: {streak?.current ?? 0} dias</span>
              {streak?.freeze_used_today ? <Snowflake className="h-3.5 w-3.5 text-sky-500" /> : null}
            </div>
            <p>Suas tarefas do dia aparecem aqui.</p>
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
          <Link className="flex flex-col items-center gap-1 rounded-md py-2 text-xs text-muted-foreground" href="/child">
            <Star className="h-4 w-4" />
            Rotina
          </Link>
          <Link className="flex flex-col items-center gap-1 rounded-md py-2 text-xs text-muted-foreground" href="/child">
            <Sparkles className="h-4 w-4" />
            Coach
          </Link>
        </div>
      </nav>
    </main>
  );
}

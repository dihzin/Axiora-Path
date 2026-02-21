"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Coins, PiggyBank, Shield, Sparkles, TrendingUp } from "lucide-react";

import { ChildBottomNav } from "@/components/child-bottom-nav";
import { ConfettiBurst } from "@/components/confetti-burst";
import { LevelUpOverlay } from "@/components/level-up-overlay";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { registerGameSession, type GameSessionRegisterResponse } from "@/lib/api/client";
import { ProgressBar } from "@/components/ui/progress-bar";
import { UX_SETTINGS_FALLBACK, fetchUXSettings, hapticCompletion, hapticPress, playSfx } from "@/lib/ux-feedback";
import { cn } from "@/lib/utils";

type EventKey = "EXPENSE" | "BONUS" | "INVESTMENT_GROWTH" | "EMERGENCY";
type Rating = "Impulsive" | "Balanced" | "Strategic" | "Financial Master";

type RoundLog = {
  round: number;
  spendPercent: number;
  savePercent: number;
  investPercent: number;
  donatePercent: number;
  startBalance: number;
  endBalance: number;
  eventKey: EventKey;
  eventLabel: string;
  eventDelta: number;
  xpDelta: number;
};

const TOTAL_ROUNDS = 5;
const INITIAL_COINS = 100;
const LEVEL_STORAGE_PREFIX = "axiora_game_level_";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function currentWeekStartIso(): string {
  const now = new Date();
  const day = (now.getDay() + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - day);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().slice(0, 10);
}

function eventTitle(key: EventKey): string {
  if (key === "EXPENSE") return "Despesa inesperada";
  if (key === "BONUS") return "Bônus extra";
  if (key === "INVESTMENT_GROWTH") return "Crescimento do investimento";
  return "Cenário de emergência";
}

function randomEvent(): EventKey {
  const bag: EventKey[] = ["EXPENSE", "BONUS", "INVESTMENT_GROWTH", "EMERGENCY"];
  return bag[Math.floor(Math.random() * bag.length)];
}

function formatCoins(value: number): string {
  return `${Math.max(0, Math.round(value))} moedas`;
}

function classifyRating(score: number): Rating {
  if (score >= 360) return "Financial Master";
  if (score >= 260) return "Strategic";
  if (score >= 160) return "Balanced";
  return "Impulsive";
}

function ratingTone(rating: Rating): string {
  if (rating === "Financial Master") return "text-secondary";
  if (rating === "Strategic") return "text-primary";
  if (rating === "Balanced") return "text-accent-foreground";
  return "text-destructive";
}

function computeEducationalBonuses(logs: RoundLog[], finalBalance: number): { reserve: number; invest: number; control: number } {
  const reserve = finalBalance >= 25 ? 35 : 0;
  const avgInvest = logs.length > 0 ? logs.reduce((acc, item) => acc + item.investPercent, 0) / logs.length : 0;
  const invest = avgInvest >= 20 ? 25 : 0;
  const control = logs.every((item) => item.spendPercent < 100) ? 20 : 0;
  return { reserve, invest, control };
}

export default function FinanceSimPage() {
  const [childId, setChildId] = useState<number | null>(null);
  const [round, setRound] = useState(1);
  const [balance, setBalance] = useState(INITIAL_COINS);
  const [spendPercent, setSpendPercent] = useState(30);
  const [savePercent, setSavePercent] = useState(25);
  const [investPercent, setInvestPercent] = useState(30);
  const [logs, setLogs] = useState<RoundLog[]>([]);
  const [score, setScore] = useState(0);
  const [sessionResult, setSessionResult] = useState<GameSessionRegisterResponse | null>(null);
  const [registering, setRegistering] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [levelUpLevel, setLevelUpLevel] = useState<number | null>(null);
  const [levelUpReward, setLevelUpReward] = useState<string | null>(null);
  const [bonusBreakdown, setBonusBreakdown] = useState<{ reserve: number; invest: number; control: number }>({
    reserve: 0,
    invest: 0,
    control: 0,
  });
  const [uxSettings, setUxSettings] = useState(UX_SETTINGS_FALLBACK);
  const [feedback, setFeedback] = useState("Monte sua estratégia para esta rodada.");
  const [confettiTrigger, setConfettiTrigger] = useState(0);

  const donatePercent = useMemo(() => Math.max(0, 100 - spendPercent - savePercent - investPercent), [investPercent, savePercent, spendPercent]);

  useEffect(() => {
    const rawChildId = localStorage.getItem("axiora_child_id");
    const parsedChildId = Number(rawChildId);
    if (rawChildId && Number.isFinite(parsedChildId)) {
      setChildId(parsedChildId);
    }
    void fetchUXSettings().then(setUxSettings).catch(() => setUxSettings(UX_SETTINGS_FALLBACK));
  }, []);

  const onAdjustSpend = (next: number) => {
    const safe = Math.max(0, Math.min(100, next));
    const maxSpend = 100 - savePercent - investPercent;
    setSpendPercent(Math.min(safe, maxSpend));
  };

  const onAdjustSave = (next: number) => {
    const safe = Math.max(0, Math.min(100, next));
    const maxSave = 100 - spendPercent - investPercent;
    setSavePercent(Math.min(safe, maxSave));
  };

  const onAdjustInvest = (next: number) => {
    const safe = Math.max(0, Math.min(100, next));
    const maxInvest = 100 - spendPercent - savePercent;
    setInvestPercent(Math.min(safe, maxInvest));
  };

  const getStoredLevel = (): number => {
    if (childId === null) return 0;
    const raw = localStorage.getItem(`${LEVEL_STORAGE_PREFIX}${childId}`);
    const parsed = Number(raw ?? "0");
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  };

  const persistLevel = (level: number) => {
    if (childId === null) return;
    localStorage.setItem(`${LEVEL_STORAGE_PREFIX}${childId}`, String(level));
  };

  const persistEarnedXp = (earnedXp: number) => {
    if (childId === null || earnedXp <= 0) return;
    const dailyKey = `axiora_game_daily_xp_${childId}_${todayIsoDate()}`;
    const currentDaily = Number(localStorage.getItem(dailyKey) ?? "0");
    const safeDaily = Number.isFinite(currentDaily) ? Math.max(0, currentDaily) : 0;
    localStorage.setItem(dailyKey, String(safeDaily + earnedXp));

    const weeklyKey = `axiora_game_weekly_xp_${childId}`;
    const weekStart = currentWeekStartIso();
    const rawWeekly = localStorage.getItem(weeklyKey);
    let weeklyXp = 0;
    if (rawWeekly) {
      try {
        const parsed = JSON.parse(rawWeekly) as { weekStart: string; xp: number };
        if (parsed.weekStart === weekStart && Number.isFinite(parsed.xp)) {
          weeklyXp = Math.max(0, parsed.xp);
        }
      } catch {
        weeklyXp = 0;
      }
    }
    localStorage.setItem(weeklyKey, JSON.stringify({ weekStart, xp: weeklyXp + earnedXp }));
  };

  const registerSessionOnce = async (finalScore: number) => {
    setRegistering(true);
    try {
      const response = await registerGameSession({
        gameType: "FINANCE_SIM",
        score: finalScore,
      });
      setSessionResult(response);
      persistEarnedXp(response.dailyLimit.grantedXp);
      const previousLevel = getStoredLevel();
      if (previousLevel > 0 && response.profile.level > previousLevel) {
        setLevelUpLevel(response.profile.level);
        setLevelUpReward(response.unlockedAchievements?.[0] ?? null);
      }
      persistLevel(response.profile.level);
    } catch {
      setSessionResult(null);
    } finally {
      setRegistering(false);
      playSfx("/sfx/completion-chime.ogg", uxSettings.soundEnabled);
      hapticCompletion(uxSettings);
      setConfettiTrigger((prev) => prev + 1);
    }
  };

  const playRound = async () => {
    if (showSummary || round > TOTAL_ROUNDS) return;

    const startBalance = Math.max(0, Math.round(balance));
    const spendAmount = Math.round((startBalance * spendPercent) / 100);
    const saveAmount = Math.round((startBalance * savePercent) / 100);
    const investAmount = Math.round((startBalance * investPercent) / 100);
    const donateAmount = Math.max(0, startBalance - spendAmount - saveAmount - investAmount);
    let endBalance = saveAmount + investAmount;
    let roundXp = 0;
    let eventDelta = 0;

    if (saveAmount >= 20) roundXp += 6; // reserva de emergência por rodada
    if (investPercent >= 20) roundXp += 5; // disciplina de investimento
    if (spendPercent < 100) roundXp += 4; // não gastou tudo
    if (donateAmount > 0) roundXp += 2; // incentivo de doação

    const eventKey = randomEvent();
    if (eventKey === "EXPENSE") {
      eventDelta = -20;
      setFeedback("Despesa inesperada! Sua reserva ajudou?");
    } else if (eventKey === "BONUS") {
      eventDelta = 15;
      setFeedback("Bônus recebido! Ótima oportunidade para investir.");
    } else if (eventKey === "INVESTMENT_GROWTH") {
      eventDelta = Math.round(investAmount * 0.1);
      roundXp += 8;
      setFeedback("Seu investimento rendeu nesta rodada.");
    } else {
      // Emergência: com reserva, o impacto é menor.
      if (saveAmount >= 20) {
        eventDelta = -8;
        roundXp += 8;
        setFeedback("Emergência controlada pela reserva. Excelente gestão.");
      } else {
        eventDelta = -25;
        setFeedback("Emergência sem reserva impactou seu saldo.");
      }
    }

    endBalance = Math.max(0, endBalance + eventDelta);
    const roundScore = Math.max(8, roundXp + Math.max(-10, Math.floor(eventDelta / 2)));
    const nextScore = score + roundScore;

    const log: RoundLog = {
      round,
      spendPercent,
      savePercent,
      investPercent,
      donatePercent,
      startBalance,
      endBalance,
      eventKey,
      eventLabel: eventTitle(eventKey),
      eventDelta,
      xpDelta: roundScore,
    };

    setLogs((prev) => [...prev, log]);
    setScore(nextScore);
    setBalance(endBalance);
    hapticPress(uxSettings);
    playSfx(eventDelta >= 0 ? "/sfx/node-pop.ogg" : "/sfx/unlock-sparkle.ogg", uxSettings.soundEnabled);

    if (round >= TOTAL_ROUNDS) {
      const finalLogs = [...logs, log];
      const bonuses = computeEducationalBonuses(finalLogs, endBalance);
      setBonusBreakdown(bonuses);
      setShowSummary(true);
      void registerSessionOnce(nextScore + bonuses.reserve + bonuses.invest + bonuses.control);
      return;
    }
    setRound((prev) => prev + 1);
  };

  const restartGame = () => {
    setRound(1);
    setBalance(INITIAL_COINS);
    setSpendPercent(30);
    setSavePercent(25);
    setInvestPercent(30);
    setLogs([]);
    setScore(0);
    setBonusBreakdown({ reserve: 0, invest: 0, control: 0 });
    setSessionResult(null);
    setShowSummary(false);
  };

  useEffect(() => {
    if (!showSummary) return;
    setBonusBreakdown(computeEducationalBonuses(logs, balance));
  }, [balance, logs, showSummary]);

  const finalScore = score + bonusBreakdown.reserve + bonusBreakdown.invest + bonusBreakdown.control;
  const rating = classifyRating(finalScore);
  const roundProgress = Math.round((Math.min(round, TOTAL_ROUNDS) / TOTAL_ROUNDS) * 100);
  const spendAmountPreview = Math.round((balance * spendPercent) / 100);
  const saveAmountPreview = Math.round((balance * savePercent) / 100);
  const investAmountPreview = Math.round((balance * investPercent) / 100);
  const donateAmountPreview = Math.max(0, balance - spendAmountPreview - saveAmountPreview - investAmountPreview);

  return (
    <>
      <ConfettiBurst trigger={confettiTrigger} />
      {levelUpLevel !== null ? (
        <LevelUpOverlay
          level={levelUpLevel}
          unlockedReward={levelUpReward}
          onDismiss={() => {
            setLevelUpLevel(null);
            setLevelUpReward(null);
          }}
        />
      ) : null}
      <PageShell tone="child" width="content">
        <div className="mb-3">
          <Link
            className="inline-flex items-center gap-1.5 rounded-2xl border-2 border-border bg-white px-2.5 py-1.5 text-sm font-semibold text-muted-foreground shadow-[0_2px_0_rgba(184,200,239,0.7)] transition hover:bg-muted"
            href="/child/games"
          >
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-lg bg-muted">
              <ArrowLeft className="h-4 w-4 stroke-[2.6]" />
            </span>
            Voltar aos jogos
          </Link>
        </div>

        <Card className="mb-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PiggyBank className="h-5 w-5 text-secondary" />
              Mesada Inteligente
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="rounded-xl border border-border bg-white/85 p-2">
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Progresso da sessão</span>
                <span className="font-semibold text-foreground">{roundProgress}%</span>
              </div>
              <ProgressBar value={roundProgress} tone="secondary" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Rodada</span>
              <span className="font-semibold">
                {Math.min(round, TOTAL_ROUNDS)} / {TOTAL_ROUNDS}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Saldo atual</span>
              <span className="font-semibold text-foreground">{formatCoins(balance)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Score</span>
              <span className="font-semibold text-foreground">{finalScore}</span>
            </div>
            <div className="rounded-xl border border-secondary/25 bg-secondary/10 p-2 text-xs text-secondary">
              {feedback}
            </div>
          </CardContent>
        </Card>

        {!showSummary ? (
          <Card className="mb-3">
            <CardHeader>
              <CardTitle>Aloque sua mesada</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span>Gastar</span>
                  <span className="font-semibold">{spendPercent}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={spendPercent}
                  onChange={(e) => onAdjustSpend(Number(e.target.value))}
                  className="w-full"
                />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span>Guardar</span>
                  <span className="font-semibold">{savePercent}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={savePercent}
                  onChange={(e) => onAdjustSave(Number(e.target.value))}
                  className="w-full"
                />
              </div>
              <div className="rounded-xl border border-border bg-muted/40 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span>Investir</span>
                  <span className="font-semibold">{investPercent}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={investPercent}
                  onChange={(e) => onAdjustInvest(Number(e.target.value))}
                  className="w-full"
                />
              </div>
              <div className="rounded-xl border border-border bg-muted/40 p-3">
                <div className="flex items-center justify-between">
                  <span>Doar</span>
                  <span className="font-semibold">{donatePercent}%</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-white p-2 text-xs">
                <p className="inline-flex items-center gap-1 rounded-lg border border-border/60 bg-muted/40 px-2 py-1">
                  <Coins className="h-3.5 w-3.5 text-accent-foreground" />
                  Gastar: {formatCoins(spendAmountPreview)}
                </p>
                <p className="inline-flex items-center gap-1 rounded-lg border border-border/60 bg-muted/40 px-2 py-1">
                  <Shield className="h-3.5 w-3.5 text-secondary" />
                  Guardar: {formatCoins(saveAmountPreview)}
                </p>
                <p className="inline-flex items-center gap-1 rounded-lg border border-border/60 bg-muted/40 px-2 py-1">
                  <TrendingUp className="h-3.5 w-3.5 text-primary" />
                  Investir: {formatCoins(investAmountPreview)}
                </p>
                <p className="inline-flex items-center gap-1 rounded-lg border border-border/60 bg-muted/40 px-2 py-1">
                  <Sparkles className="h-3.5 w-3.5 text-secondary" />
                  Doar: {formatCoins(donateAmountPreview)}
                </p>
              </div>
              <div className="rounded-xl border border-secondary/25 bg-secondary/10 p-3 text-xs text-secondary">
                <p className="font-semibold">Dica Axion</p>
                <p className="mt-1">Reserve parte do saldo para emergências e mantenha investimento acima de 20%.</p>
              </div>
              <Button className="w-full" onClick={() => void playRound()}>
                Confirmar rodada
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <Card className="mb-3">
          <CardHeader>
            <CardTitle>Histórico de rodadas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {logs.length === 0 ? <p className="text-muted-foreground">Nenhuma rodada jogada ainda.</p> : null}
            {logs.map((entry) => (
              <div key={entry.round} className="rounded-xl border border-border bg-background px-3 py-2 transition hover:shadow-[0_4px_12px_rgba(37,65,108,0.08)]">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">Rodada {entry.round}</p>
                  <p className={`text-xs font-semibold ${entry.eventDelta >= 0 ? "text-secondary" : "text-destructive"}`}>
                    {entry.eventDelta >= 0 ? `+${entry.eventDelta}` : entry.eventDelta}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {entry.eventLabel} • Gastar {entry.spendPercent}% • Guardar {entry.savePercent}% • Investir {entry.investPercent}% • Doar {entry.donatePercent}%
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatCoins(entry.startBalance)} → {formatCoins(entry.endBalance)}
                </p>
                <p className="mt-1 text-xs font-semibold text-secondary">XP da rodada: +{entry.xpDelta}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {showSummary ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-secondary" />
                Resultado final
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>Saldo final: <strong>{formatCoins(balance)}</strong></p>
              <p>
                Avaliação: <strong className={ratingTone(rating)}>{rating}</strong>
              </p>
              <div className="rounded-xl border border-border bg-muted/40 p-3">
                <p className="font-semibold text-foreground">Bônus educacionais</p>
                <div className="mt-2 space-y-1 text-xs">
                  <p className={cn(bonusBreakdown.reserve > 0 ? "text-secondary" : "text-muted-foreground")}>
                    <Shield className="mr-1 inline h-3.5 w-3.5" />
                    Reserva de emergência: +{bonusBreakdown.reserve} XP
                  </p>
                  <p className={cn(bonusBreakdown.invest > 0 ? "text-secondary" : "text-muted-foreground")}>
                    Investimento médio {"\u2265"} 20%: +{bonusBreakdown.invest} XP
                  </p>
                  <p className={cn(bonusBreakdown.control > 0 ? "text-secondary" : "text-muted-foreground")}>
                    Não gastou tudo: +{bonusBreakdown.control} XP
                  </p>
                </div>
              </div>
              <p>Score da sessão: {finalScore}</p>
              {registering ? <p className="text-muted-foreground">Registrando sessão...</p> : null}
              {sessionResult ? (
                <div className="rounded-xl border border-border bg-muted/40 p-3">
                  <p>XP ganho: {sessionResult.session.xpEarned}</p>
                  <p>Moedas: {sessionResult.session.coinsEarned}</p>
                  <p>Nível atual: {sessionResult.profile.level}</p>
                </div>
              ) : null}
              <Button className="w-full" onClick={restartGame}>
                Jogar novamente
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <ChildBottomNav />
      </PageShell>
    </>
  );
}

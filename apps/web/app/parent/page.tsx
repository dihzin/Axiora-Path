"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { ConfettiBurst } from "@/components/confetti-burst";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  decideRoutine,
  getRoutineWeek,
  getWalletSummary,
  getWeeklyTrend,
  type RoutineWeekLog,
  type WalletSummaryResponse,
  type WeeklyTrendResponse,
} from "@/lib/api/client";

function TrendIndicator({ value }: { value: number }) {
  const up = value >= 0;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${up ? "text-emerald-600" : "text-red-600"}`}>
      {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

export default function ParentPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [childId, setChildId] = useState<number | null>(null);
  const [pendingLogs, setPendingLogs] = useState<RoutineWeekLog[]>([]);
  const [wallet, setWallet] = useState<WalletSummaryResponse | null>(null);
  const [trend, setTrend] = useState<WeeklyTrendResponse | null>(null);
  const [approvingLogId, setApprovingLogId] = useState<number | null>(null);
  const [confettiTick, setConfettiTick] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  useEffect(() => {
    const ok = sessionStorage.getItem("axiora_parent_pin_ok");
    if (ok === "1") {
      setAllowed(true);
      return;
    }
    router.replace("/parent-pin");
  }, [router]);

  useEffect(() => {
    const saved = localStorage.getItem("axiora_sound_enabled");
    setSoundEnabled(saved === "1");
  }, []);

  const loadData = async (value: number) => {
    const today = new Date().toISOString().slice(0, 10);
    try {
      const routine = await getRoutineWeek(value, today);
      setPendingLogs(routine.logs.filter((log) => log.status === "PENDING"));
    } catch {
      setPendingLogs([]);
    }
    try {
      setWallet(await getWalletSummary(value));
    } catch {
      setWallet(null);
    }
    try {
      setTrend(await getWeeklyTrend(value));
    } catch {
      setTrend(null);
    }
  };

  useEffect(() => {
    if (!allowed) return;
    const rawChildId = localStorage.getItem("axiora_child_id");
    if (!rawChildId) return;
    const parsed = Number(rawChildId);
    if (!Number.isFinite(parsed)) return;
    setChildId(parsed);
    void loadData(parsed);
  }, [allowed]);

  const playApproveFeedback = () => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(18);
    }
    if (!soundEnabled) return;
    try {
      if (!window.AudioContext) return;
      const ctx = new window.AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = 860;
      gain.gain.value = 0.03;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
      window.setTimeout(() => void ctx.close(), 140);
    } catch {
      // no-op
    }
  };

  const onApprove = async (logId: number) => {
    if (childId === null) return;
    setApproveError(null);
    const optimisticLogs = pendingLogs.filter((item) => item.id !== logId);
    setPendingLogs(optimisticLogs);
    setApprovingLogId(logId);
    await decideRoutine(logId, "APPROVE");
    setConfettiTick((x) => x + 1);
    playApproveFeedback();
    // Refresh secondary cards in background only, keeping pending list optimistic.
    void getWalletSummary(childId)
      .then((data) => setWallet(data))
      .catch(() => undefined);
    void getWeeklyTrend(childId)
      .then((data) => setTrend(data))
      .catch(() => undefined);
  };

  const onApproveWithRollback = async (logId: number) => {
    const previousLogs = pendingLogs;
    try {
      await onApprove(logId);
    } catch {
      setPendingLogs(previousLogs);
      setApproveError("Falha ao aprovar. Alteraes revertidas.");
    } finally {
      setApprovingLogId(null);
    }
  };

  const onToggleSound = () => {
    setSoundEnabled((prev) => {
      const next = !prev;
      localStorage.setItem("axiora_sound_enabled", next ? "1" : "0");
      return next;
    });
  };

  if (!allowed) {
    return null;
  }

  return (
    <main className="safe-px safe-pb mx-auto min-h-screen w-full max-w-md py-5">
      <ConfettiBurst trigger={confettiTick} />
      <h1 className="mb-3 text-lg font-semibold">Area dos pais</h1>

      <section className="space-y-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">1) Pending approvals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground">Pendentes: {pendingLogs.length}</p>
              <button type="button" className="text-xs text-muted-foreground" onClick={onToggleSound}>
                Sound: {soundEnabled ? "on" : "off"}
              </button>
            </div>
            {approveError ? <p className="text-xs text-red-600">{approveError}</p> : null}
            {pendingLogs.slice(0, 4).map((log) => (
              <div key={log.id} className="flex items-center justify-between rounded-md border border-border px-2 py-1 text-xs">
                <span>
                  Task #{log.task_id} • {log.date}
                </span>
                <Button size="sm" onClick={() => void onApproveWithRollback(log.id)} disabled={approvingLogId === log.id}>
                  {approvingLogId === log.id ? "..." : "Approve"}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">2) Wallet overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>Total: {wallet ? `R$ ${(wallet.total_balance_cents / 100).toFixed(2)}` : "—"}</p>
            <p className="text-muted-foreground">
              Spend: {wallet ? `R$ ${(wallet.pot_balances_cents.SPEND / 100).toFixed(2)}` : "—"}
            </p>
            <p className="text-muted-foreground">Save: {wallet ? `R$ ${(wallet.pot_balances_cents.SAVE / 100).toFixed(2)}` : "—"}</p>
            <p className="text-muted-foreground">
              Donate: {wallet ? `R$ ${(wallet.pot_balances_cents.DONATE / 100).toFixed(2)}` : "—"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">3) Weekly trend summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span>Completion</span>
              <TrendIndicator value={trend?.completion_delta_percent ?? 0} />
            </div>
            <div className="flex items-center justify-between">
              <span>Earnings</span>
              <TrendIndicator value={trend?.earnings_delta_percent ?? 0} />
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

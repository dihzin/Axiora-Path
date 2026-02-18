"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Baby, Building2, LogOut, UserCircle2 } from "lucide-react";

import { ConfettiBurst } from "@/components/confetti-burst";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  decideRoutine,
  getMe,
  logout,
  getRoutineWeek,
  getWalletSummary,
  getWeeklyTrend,
  type ThemeName,
  type RoutineWeekLog,
  type WalletSummaryResponse,
  type WeeklyTrendResponse,
} from "@/lib/api/client";
import { clearTenantSlug, clearTokens } from "@/lib/api/session";
import { getSoundEnabled as getChildSoundEnabled, playSound, setSoundEnabled as setChildSoundEnabled } from "@/lib/sound-manager";
import { isThemeName, THEME_STORAGE_KEY } from "@/lib/theme";

function TrendIndicator({ value }: { value: number }) {
  const up = value >= 0;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${up ? "text-secondary" : "text-destructive"}`}>
      {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

export default function ParentPage() {
  const router = useRouter();
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const [allowed, setAllowed] = useState(false);
  const [childId, setChildId] = useState<number | null>(null);
  const [pendingLogs, setPendingLogs] = useState<RoutineWeekLog[]>([]);
  const [wallet, setWallet] = useState<WalletSummaryResponse | null>(null);
  const [trend, setTrend] = useState<WeeklyTrendResponse | null>(null);
  const [approvingLogId, setApprovingLogId] = useState<number | null>(null);
  const [confettiTick, setConfettiTick] = useState(0);
  const [celebrationBadgeVisible, setCelebrationBadgeVisible] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [allowedChildIds, setAllowedChildIds] = useState<number[]>([]);
  const [loggingOut, setLoggingOut] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const clearLocalSession = (options?: { keepOrganization?: boolean }) => {
    clearTokens();
    if (!options?.keepOrganization) {
      clearTenantSlug();
    }
    localStorage.removeItem("axiora_child_id");
    sessionStorage.removeItem("axiora_parent_pin_ok");
  };

  useEffect(() => {
    const ok = sessionStorage.getItem("axiora_parent_pin_ok");
    if (ok === "1") {
      setAllowed(true);
      return;
    }
    router.replace("/parent-pin");
  }, [router]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!profileMenuRef.current) return;
      if (!profileMenuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setProfileMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    const rawChildId = localStorage.getItem("axiora_child_id");
    if (!rawChildId) return;
    const parsed = Number(rawChildId);
    if (!Number.isFinite(parsed)) return;
    setSoundEnabled(getChildSoundEnabled(parsed));
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
    const loadContext = async () => {
      try {
        const me = await getMe();
        const ids = me.child_profiles.map((item) => item.id);
        setAllowedChildIds(ids);
        if (ids.length === 0) {
          router.replace("/select-child");
          return;
        }
        const rawChildId = localStorage.getItem("axiora_child_id");
        const parsed = Number(rawChildId);
        const valid = Number.isFinite(parsed) && ids.includes(parsed) ? parsed : ids[0];
        localStorage.setItem("axiora_child_id", String(valid));
        setChildId(valid);
        await loadData(valid);
      } catch {
        router.replace("/select-child");
      }
    };
    void loadContext();
  }, [allowed]);

  const playApproveFeedback = () => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(18);
    }
    if (childId === null || !soundEnabled) return;
    const rawTheme = localStorage.getItem(THEME_STORAGE_KEY);
    const theme: ThemeName = rawTheme && isThemeName(rawTheme) ? rawTheme : "default";
    playSound("task_approved", { childId, theme });
  };

  const onApprove = async (logId: number) => {
    if (childId === null) return;
    setApproveError(null);
    const optimisticLogs = pendingLogs.filter((item) => item.id !== logId);
    setPendingLogs(optimisticLogs);
    setApprovingLogId(logId);
    await decideRoutine(logId, "APPROVE");
    setConfettiTick((x) => x + 1);
    setCelebrationBadgeVisible(true);
    window.setTimeout(() => setCelebrationBadgeVisible(false), 900);
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
    if (childId === null) return;
    setSoundEnabled((prev) => {
      const next = !prev;
      setChildSoundEnabled(childId, next);
      return next;
    });
  };

  if (!allowed) {
    return null;
  }

  const onGoChildMode = () => {
    if (childId === null) {
      router.push("/select-child");
      return;
    }
    if (!allowedChildIds.includes(childId)) {
      router.push("/select-child");
      return;
    }
    localStorage.setItem("axiora_child_id", String(childId));
    router.push("/child");
  };

  const onSwitchOrganization = () => {
    setProfileMenuOpen(false);
    sessionStorage.removeItem("axiora_parent_pin_ok");
    localStorage.removeItem("axiora_child_id");
    router.push("/select-tenant");
  };

  const onLogout = async () => {
    setProfileMenuOpen(false);
    setLoggingOut(true);
    try {
      await logout();
    } catch {
      // ignore API logout failures and still clear local session
    } finally {
      clearLocalSession();
      router.replace("/login");
      setLoggingOut(false);
    }
  };

  return (
    <main className="safe-px safe-pb mx-auto min-h-screen w-full max-w-md p-4 md:p-6">
      <ConfettiBurst trigger={confettiTick} />
      {celebrationBadgeVisible ? (
        <div className="celebrate-badge-pop fixed left-1/2 top-4 z-[70] -translate-x-1/2 rounded-xl border border-secondary/35 bg-secondary/10 px-3 py-1 text-xs font-semibold text-secondary shadow-sm">
          +1 Missão Aprovada!
        </div>
      ) : null}
      <header className="mb-3 flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Area dos pais</h1>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onGoChildMode}>
            <Baby className="mr-1 h-4 w-4" />
            Ver modo crianca
          </Button>
          <div className="relative" ref={profileMenuRef}>
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-haspopup="menu"
              aria-expanded={profileMenuOpen}
              onClick={() => setProfileMenuOpen((prev) => !prev)}
            >
              <UserCircle2 className="h-4 w-4" />
            </Button>
            {profileMenuOpen ? (
              <div className="absolute right-0 top-11 z-20 w-52 rounded-xl border border-border bg-card p-1 shadow-md" role="menu">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={onSwitchOrganization}
                  role="menuitem"
                >
                  <Building2 className="h-4 w-4" />
                  Trocar organizacao
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-50"
                  onClick={() => void onLogout()}
                  disabled={loggingOut}
                  role="menuitem"
                >
                  <LogOut className="h-4 w-4" />
                  {loggingOut ? "Saindo..." : "Sair"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <section className="space-y-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">1) Pending approvals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground">Pendentes: {pendingLogs.length}</p>
              <button
                type="button"
                aria-label="Alternar som"
                className="text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2"
                onClick={onToggleSound}
              >
                Sound: {soundEnabled ? "on" : "off"}
              </button>
            </div>
            {approveError ? <p className="text-xs text-destructive">{approveError}</p> : null}
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

import { useCallback, useEffect, useMemo, useState } from "react";

import type { DailyMissionResponse, StreakResponse } from "@/lib/api/client";

type StreakBonusTier = "none" | "day3" | "day7";

type EngagementSnapshot = {
  claimedByDate: Record<string, StreakBonusTier>;
};

type PendingSyncEvent = {
  id: string;
  childId: number;
  date: string;
  type: "STREAK_BONUS_CLAIMED";
  payload: {
    tier: StreakBonusTier;
    xp: number;
    coins: number;
  };
  status: "pending_sync";
};

const STORAGE_PREFIX = "axiora_daily_engagement_v1";
const PENDING_SYNC_KEY = "axiora_daily_engagement_pending_v1";

function getStorageKey(childId: number): string {
  return `${STORAGE_PREFIX}_${childId}`;
}

function readSnapshot(childId: number): EngagementSnapshot {
  if (typeof window === "undefined") return { claimedByDate: {} };
  try {
    const raw = window.localStorage.getItem(getStorageKey(childId));
    if (!raw) return { claimedByDate: {} };
    const parsed = JSON.parse(raw) as EngagementSnapshot;
    return { claimedByDate: parsed.claimedByDate ?? {} };
  } catch {
    return { claimedByDate: {} };
  }
}

function writeSnapshot(childId: number, snapshot: EngagementSnapshot): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(getStorageKey(childId), JSON.stringify(snapshot));
}

function appendPendingSyncEvent(event: PendingSyncEvent): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(PENDING_SYNC_KEY);
    const current = raw ? (JSON.parse(raw) as PendingSyncEvent[]) : [];
    current.push(event);
    window.localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(current));
  } catch {
    // no-op
  }
}

function resolveBonus(streakDays: number): { tier: StreakBonusTier; xp: number; coins: number; label: string } {
  if (streakDays >= 7) {
    return { tier: "day7", xp: 80, coins: 60, label: "Bônus Dia 7" };
  }
  if (streakDays >= 3) {
    return { tier: "day3", xp: 30, coins: 20, label: "Bônus Dia 3" };
  }
  return { tier: "none", xp: 0, coins: 0, label: "Sem bônus" };
}

export function useDailyEngagement({
  childId,
  todayIso,
  streak,
  mission,
}: {
  childId: number | null;
  todayIso: string;
  streak: StreakResponse | null;
  mission: DailyMissionResponse | null;
}) {
  const [snapshot, setSnapshot] = useState<EngagementSnapshot>({ claimedByDate: {} });

  useEffect(() => {
    if (childId === null) return;
    setSnapshot(readSnapshot(childId));
  }, [childId]);

  const missionResetApplied = Boolean(mission && mission.date !== todayIso);
  const effectiveMission = missionResetApplied ? null : mission;

  const streakDays = streak?.current ?? 0;
  const bonus = resolveBonus(streakDays);
  const claimedTierToday = snapshot.claimedByDate[todayIso] ?? "none";
  const bonusAvailable = bonus.tier !== "none" && claimedTierToday !== bonus.tier;

  const lastDate = streak?.last_date ?? null;
  const yesterdayIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const loopBroken = streakDays === 0 && lastDate !== null && lastDate < yesterdayIso;

  const claimStreakBonus = useCallback(() => {
    if (childId === null) return null;
    if (!bonusAvailable) return null;
    const next: EngagementSnapshot = {
      claimedByDate: {
        ...snapshot.claimedByDate,
        [todayIso]: bonus.tier,
      },
    };
    setSnapshot(next);
    writeSnapshot(childId, next);
    appendPendingSyncEvent({
      id: `${childId}-${todayIso}-${bonus.tier}`,
      childId,
      date: todayIso,
      type: "STREAK_BONUS_CLAIMED",
      payload: {
        tier: bonus.tier,
        xp: bonus.xp,
        coins: bonus.coins,
      },
      status: "pending_sync",
    });
    return {
      tier: bonus.tier,
      xp: bonus.xp,
      coins: bonus.coins,
      label: bonus.label,
    };
  }, [bonus.coins, bonus.label, bonus.tier, bonus.xp, bonusAvailable, childId, snapshot.claimedByDate, todayIso]);

  return useMemo(
    () => ({
      effectiveMission,
      missionResetApplied,
      streakBonus: {
        tier: bonus.tier,
        xp: bonus.xp,
        coins: bonus.coins,
        label: bonus.label,
        available: bonusAvailable,
        claimedTierToday,
      },
      loopBroken,
      claimStreakBonus,
    }),
    [bonus.coins, bonus.label, bonus.tier, bonus.xp, bonusAvailable, claimStreakBonus, claimedTierToday, effectiveMission, loopBroken, missionResetApplied],
  );
}


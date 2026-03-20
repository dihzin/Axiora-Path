import {
  completeGameSession,
  getGamePersonalBest,
  type GamePersonalBestResponse,
  type GameSessionCompleteResponse,
  type GameResultPayload,
} from "@/lib/api/client";

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

function readChildIdFromStorage(): number | null {
  try {
    const raw = sessionStorage.getItem("axiora_child_id");
    const parsed = Number(raw);
    if (!raw || !Number.isFinite(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function syncLocalSessionCounters(childId: number, gameId: string): void {
  const totalKey = `axiora_game_sessions_total_${childId}`;
  const currentTotal = Number(localStorage.getItem(totalKey) ?? "0");
  const safeTotal = Number.isFinite(currentTotal) ? Math.max(0, currentTotal) : 0;
  localStorage.setItem(totalKey, String(safeTotal + 1));

  const weeklySessionsKey = `axiora_game_sessions_weekly_${childId}`;
  const weekStart = currentWeekStartIso();
  const rawWeeklySessions = localStorage.getItem(weeklySessionsKey);
  let weeklySessions = 0;
  if (rawWeeklySessions) {
    try {
      const parsed = JSON.parse(rawWeeklySessions) as { weekStart: string; count: number };
      if (parsed.weekStart === weekStart && Number.isFinite(parsed.count)) {
        weeklySessions = Math.max(0, parsed.count);
      }
    } catch {
      weeklySessions = 0;
    }
  }
  localStorage.setItem(weeklySessionsKey, JSON.stringify({ weekStart, count: weeklySessions + 1 }));

  const playCountKey = `axiora_game_play_counts_${childId}`;
  const rawCounts = localStorage.getItem(playCountKey);
  let counts: Record<string, number> = {};
  if (rawCounts) {
    try {
      counts = JSON.parse(rawCounts) as Record<string, number>;
    } catch {
      counts = {};
    }
  }
  const currentCount = Number(counts[gameId] ?? 0);
  counts[gameId] = Number.isFinite(currentCount) ? Math.max(0, currentCount) + 1 : 1;
  localStorage.setItem(playCountKey, JSON.stringify(counts));
}

export function syncLegacyGameXpCache(grantedXp: number): void {
  if (grantedXp <= 0) return;
  const childId = readChildIdFromStorage();
  if (childId === null) return;
  try {
    const dailyKey = `axiora_game_daily_xp_${childId}_${todayIsoDate()}`;
    const currentDaily = Number(localStorage.getItem(dailyKey) ?? "0");
    const safeDaily = Number.isFinite(currentDaily) ? Math.max(0, currentDaily) : 0;
    localStorage.setItem(dailyKey, String(safeDaily + grantedXp));

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
    localStorage.setItem(weeklyKey, JSON.stringify({ weekStart, xp: weeklyXp + grantedXp }));
  } catch {
    // keep cache as best-effort only
  }
}

export async function finalizeGameSession(
  result: GameResultPayload,
  options?: {
    childId?: number | null;
    syncLocalCache?: boolean;
  },
): Promise<GameSessionCompleteResponse> {
  const resolvedChildId = options?.childId ?? readChildIdFromStorage();
  const response = await completeGameSession({
    childId: resolvedChildId ?? undefined,
    result,
  });
  if (options?.syncLocalCache === true) {
    syncLegacyGameXpCache(response.dailyLimit.grantedXp ?? 0);
  }
  if (resolvedChildId !== null) {
    try {
      syncLocalSessionCounters(resolvedChildId, result.gameId);
    } catch {
      // best-effort only
    }
  }
  return response;
}

export async function fetchPersonalBest(gameId: string, childId?: number | null): Promise<GamePersonalBestResponse | null> {
  try {
    return await getGamePersonalBest(gameId, childId ?? undefined);
  } catch {
    return null;
  }
}

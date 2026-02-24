"use client";

const RECENT_LEARNING_REWARD_KEY = "axiora_recent_learning_reward_v1";
const RECENT_REWARD_TTL_MS = 2 * 60 * 1000;

type RecentLearningReward = {
  childId: number;
  xp: number;
  coins: number;
  at: number;
};

function isValidReward(value: unknown): value is RecentLearningReward {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<RecentLearningReward>;
  return (
    typeof v.childId === "number" &&
    Number.isFinite(v.childId) &&
    v.childId > 0 &&
    typeof v.xp === "number" &&
    Number.isFinite(v.xp) &&
    typeof v.coins === "number" &&
    Number.isFinite(v.coins) &&
    typeof v.at === "number" &&
    Number.isFinite(v.at)
  );
}

export function writeRecentLearningReward(childId: number, xp: number, coins: number) {
  if (typeof window === "undefined") return;
  const safeXp = Math.max(0, Math.floor(xp));
  const safeCoins = Math.max(0, Math.floor(coins));
  if (safeXp <= 0 && safeCoins <= 0) return;
  try {
    const payload: RecentLearningReward = {
      childId,
      xp: safeXp,
      coins: safeCoins,
      at: Date.now(),
    };
    window.localStorage.setItem(RECENT_LEARNING_REWARD_KEY, JSON.stringify(payload));
  } catch {
    // no-op
  }
}

export function readRecentLearningReward(childId: number): { xp: number; coins: number } {
  if (typeof window === "undefined") return { xp: 0, coins: 0 };
  try {
    const raw = window.localStorage.getItem(RECENT_LEARNING_REWARD_KEY);
    if (!raw) return { xp: 0, coins: 0 };
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidReward(parsed)) return { xp: 0, coins: 0 };
    if (parsed.childId !== childId) return { xp: 0, coins: 0 };
    if (Date.now() - parsed.at > RECENT_REWARD_TTL_MS) return { xp: 0, coins: 0 };
    return { xp: parsed.xp, coins: parsed.coins };
  } catch {
    return { xp: 0, coins: 0 };
  }
}


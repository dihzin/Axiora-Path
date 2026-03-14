import type { GameResultPayload } from "@/lib/api/client";

export type AxioraGameId = "tictactoe" | "quiz" | "memory" | "wordsearch" | "finance-sim" | "tug-of-war";

export type PartialGameMetrics = {
  score: number;
  accuracy?: number | null;
  correctAnswers?: number | null;
  wrongAnswers?: number | null;
  streak?: number | null;
  maxStreak?: number | null;
  durationSeconds?: number | null;
  levelReached?: number | null;
  completed?: boolean;
  xpDelta?: number | null;
  coinsDelta?: number | null;
  personalBestType?: "score" | "streak" | "speed" | null;
  metadata?: Record<string, unknown>;
};

function sanitizeInt(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Math.max(0, Math.round(value));
}

function sanitizeFloat01(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(1, value));
}

export function normalizeGameResult(
  gameId: AxioraGameId,
  metrics: PartialGameMetrics,
  options?: {
    sessionId?: string | null;
  },
): GameResultPayload {
  return {
    gameId,
    sessionId: options?.sessionId ?? null,
    score: Math.max(0, Math.round(metrics.score)),
    accuracy: sanitizeFloat01(metrics.accuracy),
    correctAnswers: sanitizeInt(metrics.correctAnswers),
    wrongAnswers: sanitizeInt(metrics.wrongAnswers),
    streak: sanitizeInt(metrics.streak),
    maxStreak: sanitizeInt(metrics.maxStreak),
    durationSeconds: sanitizeInt(metrics.durationSeconds),
    levelReached: sanitizeInt(metrics.levelReached),
    completed: metrics.completed ?? true,
    xpDelta: sanitizeInt(metrics.xpDelta),
    coinsDelta: sanitizeInt(metrics.coinsDelta),
    personalBestType: metrics.personalBestType ?? null,
    metadata: metrics.metadata ?? {},
  };
}

import type { AxioraGameId } from "@/lib/games/result-contract";

export type QuizTempo = "easy" | "medium" | "hard";

export type GameOnboardingConfig = {
  quiz?: {
    questionCount: 5 | 8 | 10;
    tempo: QuizTempo;
  };
  tictactoe?: {
    soloDifficulty: "EASY" | "MEDIUM" | "HARD";
  };
  "tug-of-war"?: {
    mode: "cpu" | "pvp";
    difficulty: 1 | 2 | 3;
  };
};

export function buildOnboardingLaunchParams(
  gameId: AxioraGameId | null,
  config: GameOnboardingConfig,
): URLSearchParams {
  const params = new URLSearchParams();
  params.set("fromHub", "1");
  if (!gameId) return params;

  if (gameId === "quiz" && config.quiz) {
    params.set("q", String(config.quiz.questionCount));
    params.set("tempo", config.quiz.tempo);
    return params;
  }

  if (gameId === "tictactoe" && config.tictactoe) {
    params.set("soloDifficulty", config.tictactoe.soloDifficulty);
    return params;
  }

  if (gameId === "tug-of-war" && config["tug-of-war"]) {
    params.set("startMode", config["tug-of-war"].mode);
    params.set("startDifficulty", String(config["tug-of-war"].difficulty));
    return params;
  }

  return params;
}

export function mergeHrefWithParams(href: string, params: URLSearchParams): string {
  const [base, query] = href.split("?");
  const merged = new URLSearchParams(query ?? "");
  params.forEach((value, key) => merged.set(key, value));
  const suffix = merged.toString();
  return suffix.length > 0 ? `${base}?${suffix}` : base;
}

export function describePersonalBest(value: {
  bestScore: number | null;
  bestStreak: number | null;
  bestDurationSeconds: number | null;
} | null): { title: string; value: string } | null {
  if (!value) return null;
  if (typeof value.bestScore === "number") {
    return { title: "Seu recorde", value: `${value.bestScore} pontos` };
  }
  if (typeof value.bestStreak === "number") {
    return { title: "Melhor sequência", value: `${value.bestStreak} acertos seguidos` };
  }
  if (typeof value.bestDurationSeconds === "number") {
    return { title: "Tempo recorde", value: `${value.bestDurationSeconds}s` };
  }
  return null;
}


"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Sparkles } from "lucide-react";

import { MultiplayerLaunchModal } from "@/components/games/tictactoe/multiplayer-launch-modal";
import { MultiplayerWaitingCard } from "@/components/games/tictactoe/multiplayer-waiting-card";
import { ChildBottomNav } from "@/components/child-bottom-nav";
import { ConfettiBurst } from "@/components/confetti-burst";
import { LevelUpOverlay } from "@/components/level-up-overlay";
import { useMultiplayerSession } from "@/hooks/use-multiplayer-session";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ApiError,
  closeMultiplayerSession,
  createMultiplayerSession,
  getMultiplayerSession,
  getApiErrorMessage,
  joinMultiplayerSession,
  postMultiplayerMove,
  registerGameSession,
  type GameSessionRegisterResponse,
  type MultiplayerCreateResponse,
} from "@/lib/api/client";
import { cn } from "@/lib/utils";

type Mark = "X" | "O";
type Cell = Mark | null;
type Board = Cell[];
type Difficulty = "EASY" | "MEDIUM" | "HARD";
type MatchResult = "WIN" | "DRAW" | "LOSS";
type PlayMode = "SOLO" | "MULTI_HOST" | "MULTI_GUEST";

const WIN_LINES: number[][] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

const XP_BY_RESULT: Record<MatchResult, number> = {
  WIN: 50,
  DRAW: 20,
  LOSS: 5,
};

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

function emptyBoard(): Board {
  return Array.from({ length: 9 }, () => null);
}

function winnerFor(board: Board): { winner: Mark; line: number[] } | null {
  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    const first = board[a];
    if (first && first === board[b] && first === board[c]) {
      return { winner: first, line };
    }
  }
  return null;
}

function availableMoves(board: Board): number[] {
  return board.map((cell, idx) => (cell === null ? idx : -1)).filter((idx) => idx >= 0);
}

function chooseRandomMove(board: Board): number {
  const moves = availableMoves(board);
  return moves[Math.floor(Math.random() * moves.length)];
}

function findImmediateMove(board: Board, mark: Mark): number | null {
  for (const idx of availableMoves(board)) {
    const clone = [...board];
    clone[idx] = mark;
    const win = winnerFor(clone);
    if (win && win.winner === mark) return idx;
  }
  return null;
}

function heuristicMove(board: Board): number {
  if (board[4] === null) return 4;
  const corners = [0, 2, 6, 8].filter((idx) => board[idx] === null);
  if (corners.length > 0) return corners[Math.floor(Math.random() * corners.length)];
  return chooseRandomMove(board);
}

function minimax(board: Board, maximizing: boolean): number {
  const outcome = winnerFor(board);
  if (outcome?.winner === "O") return 10;
  if (outcome?.winner === "X") return -10;
  if (availableMoves(board).length === 0) return 0;

  if (maximizing) {
    let best = -Infinity;
    for (const idx of availableMoves(board)) {
      const clone = [...board];
      clone[idx] = "O";
      best = Math.max(best, minimax(clone, false));
    }
    return best;
  }

  let best = Infinity;
  for (const idx of availableMoves(board)) {
    const clone = [...board];
    clone[idx] = "X";
    best = Math.min(best, minimax(clone, true));
  }
  return best;
}

function chooseHardMove(board: Board): number {
  let bestScore = -Infinity;
  let bestMove = chooseRandomMove(board);
  for (const idx of availableMoves(board)) {
    const clone = [...board];
    clone[idx] = "O";
    const score = minimax(clone, false);
    if (score > bestScore) {
      bestScore = score;
      bestMove = idx;
    }
  }
  return bestMove;
}

function chooseAiMove(board: Board, difficulty: Difficulty): number {
  const winning = findImmediateMove(board, "O");
  if (winning !== null) return winning;

  // Regra obrigatória: bloquear vitórias óbvias.
  const block = findImmediateMove(board, "X");
  if (block !== null) return block;

  if (difficulty === "EASY") {
    return Math.random() < 0.65 ? chooseRandomMove(board) : heuristicMove(board);
  }
  if (difficulty === "MEDIUM") {
    return Math.random() < 0.4 ? chooseRandomMove(board) : heuristicMove(board);
  }
  return chooseHardMove(board);
}

type RewardModalProps = {
  open: boolean;
  result: MatchResult;
  baseXp: number;
  bonusXp: number;
  apiResult: GameSessionRegisterResponse | null;
  onClose: () => void;
};

function RewardModal({ open, result, baseXp, bonusXp, apiResult, onClose }: RewardModalProps) {
  if (!open) return null;
  const requestedXp = baseXp + bonusXp;
  const grantedXp = apiResult?.dailyLimit.grantedXp ?? requestedXp;
  const coins = apiResult?.session.coinsEarned ?? 0;
  const title = result === "WIN" ? "Você venceu!" : result === "DRAW" ? "Empate!" : "Não foi dessa vez";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-foreground/50 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-secondary" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>XP base: {baseXp}</p>
          {bonusXp > 0 ? <p>Bônus sequência: +{bonusXp}</p> : null}
          <p>XP aplicado: {grantedXp}</p>
          <p>Moedas recebidas: {coins}</p>
          {apiResult && apiResult.dailyLimit.grantedXp < apiResult.dailyLimit.requestedXp ? (
            <p className="text-xs text-accent-foreground">Limite diário aplicado neste jogo.</p>
          ) : null}
          <Button className="mt-2 w-full" onClick={onClose}>
            Continuar
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function TicTacToePage() {
  const [childId, setChildId] = useState<number | null>(null);
  const [playMode, setPlayMode] = useState<PlayMode>("SOLO");
  const [difficulty, setDifficulty] = useState<Difficulty>("MEDIUM");
  const [board, setBoard] = useState<Board>(emptyBoard);
  const [playerTurn, setPlayerTurn] = useState(true);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [winningLine, setWinningLine] = useState<number[] | null>(null);
  const [aiThinking, setAiThinking] = useState(false);
  const [cellPulseIndex, setCellPulseIndex] = useState<number | null>(null);
  const [winStreak, setWinStreak] = useState(0);
  const [rewardOpen, setRewardOpen] = useState(false);
  const [baseXp, setBaseXp] = useState(0);
  const [bonusXp, setBonusXp] = useState(0);
  const [lastSession, setLastSession] = useState<GameSessionRegisterResponse | null>(null);
  const [confettiTrigger, setConfettiTrigger] = useState(0);
  const [levelUpLevel, setLevelUpLevel] = useState<number | null>(null);
  const [levelUpReward, setLevelUpReward] = useState<string | null>(null);
  const [multiplayerCreate, setMultiplayerCreate] = useState<MultiplayerCreateResponse | null>(null);
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [flowStep, setFlowStep] = useState<"MODE" | "HOST" | "JOIN" | "PLAY">("MODE");
  const [flowError, setFlowError] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [resultRewardKey, setResultRewardKey] = useState<string | null>(null);
  const [joinTokenFromUrl, setJoinTokenFromUrl] = useState<string | null>(null);
  const [isGuestMode, setIsGuestMode] = useState(false);
  const [isGuestFromQuery, setIsGuestFromQuery] = useState(false);

  const { state: multiplayerState, isRealtimeConnected, statusLabel } = useMultiplayerSession({
    sessionId: activeSessionId,
    enabled: playMode !== "SOLO" && Boolean(activeSessionId),
  });

  useEffect(() => {
    const raw = localStorage.getItem("axiora_child_id");
    const parsed = Number(raw);
    if (raw && Number.isFinite(parsed)) {
      setChildId(parsed);
      const streakRaw = localStorage.getItem(`axiora_ttt_streak_${parsed}`);
      const parsedStreak = Number(streakRaw ?? "0");
      setWinStreak(Number.isFinite(parsedStreak) ? Math.max(0, parsedStreak) : 0);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const joinCode = params.get("join")?.trim().toUpperCase();
    const joinToken = params.get("joinToken")?.trim();
    const sessionId = params.get("session")?.trim();
    const mode = params.get("mode")?.trim();
    if (mode === "guest" || Boolean(joinToken)) {
      setIsGuestFromQuery(true);
    }
    if (sessionId && mode === "guest") {
      setPlayMode("MULTI_GUEST");
      setFlowStep("PLAY");
      setActiveSessionId(sessionId);
      setIsGuestMode(true);
      return;
    }
    if (joinToken) {
      setFlowStep("JOIN");
      setJoinTokenFromUrl(joinToken);
      setPlayMode("MULTI_GUEST");
      setIsGuestMode(true);
      return;
    }
    if (!joinCode) return;
    setFlowStep("JOIN");
    setJoinCodeInput(joinCode);
    setPlayMode("MULTI_GUEST");
  }, []);

  const statusText = useMemo(() => {
    if (playMode !== "SOLO") {
      if (!multiplayerState) return "Conectando partida...";
      if (multiplayerState.status === "WAITING") return "Aguardando segundo jogador...";
      if (multiplayerState.status === "CANCELLED") return "Partida encerrada";
      if (multiplayerState.winner === "DRAW") return "Empate";
      if (multiplayerState.winner === "X" || multiplayerState.winner === "O") return `Vitória de ${multiplayerState.winner}`;
      return multiplayerState.canPlay ? "Sua vez" : "Vez do oponente";
    }
    if (matchResult === "WIN") return "Vitória";
    if (matchResult === "DRAW") return "Empate";
    if (matchResult === "LOSS") return "Derrota";
    if (aiThinking) return "Axion está pensando...";
    return playerTurn ? "Sua vez" : "Vez do Axion";
  }, [aiThinking, matchResult, multiplayerState, playMode, playerTurn]);

  const isFinished = playMode === "SOLO" ? matchResult !== null : Boolean(multiplayerState?.winner || multiplayerState?.status === "CANCELLED");
  const displayedBoard = playMode === "SOLO" ? board : multiplayerState?.board ?? emptyBoard();

  useEffect(() => {
    if (!joinTokenFromUrl || playMode !== "MULTI_GUEST") return;
    let cancelled = false;
    (async () => {
      try {
        const joined = await joinMultiplayerSession({ joinToken: joinTokenFromUrl });
        if (cancelled) return;
        setActiveSessionId(joined.sessionId);
        setFlowStep("PLAY");
        setFlowError(null);
      } catch {
        if (cancelled) return;
        setFlowError("Convite inválido ou expirado.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [joinTokenFromUrl, playMode]);

  useEffect(() => {
    if (playMode === "SOLO" || !multiplayerState?.sessionId) return;
    if (!(multiplayerState.winner === "X" || multiplayerState.winner === "O" || multiplayerState.winner === "DRAW")) return;
    const rewardKey = `${multiplayerState.sessionId}:${multiplayerState.winner}`;
    if (resultRewardKey === rewardKey) return;
    const result: MatchResult = multiplayerState.winner === "DRAW" ? "DRAW" : "WIN";
    const base = XP_BY_RESULT[result];
    setMatchResult(result);
    setBaseXp(base);
    setBonusXp(0);
    setResultRewardKey(rewardKey);
    if (multiplayerState.winner !== "DRAW") {
      setConfettiTrigger((prev) => prev + 1);
    }
    void (async () => {
      try {
        const response = await registerGameSession({ gameType: "TICTACTOE", score: base * 10 });
        setLastSession(response);
      } catch {
        setLastSession(null);
      } finally {
        setRewardOpen(true);
      }
    })();
  }, [multiplayerState, playMode, resultRewardKey]);

  const startMultiplayerHost = async () => {
    setFlowError(null);
    try {
      const created = await createMultiplayerSession({ gameType: "TICTACTOE", joinMethod: "QR_CODE", mode: "PVP_PRIVATE", ttlMinutes: 30 });
      setPlayMode("MULTI_HOST");
      setMultiplayerCreate(created);
      setActiveSessionId(created.sessionId);
      setFlowStep("HOST");
    } catch {
      setFlowError("Não foi possível criar a partida multiplayer.");
    }
  };

  const joinMultiplayerByCode = async () => {
    const code = joinCodeInput.trim().toUpperCase();
    if (!code) {
      setFlowError("Informe um código para entrar.");
      return;
    }
    setFlowError(null);
    try {
      const state = await joinMultiplayerSession({ joinCode: code });
      setPlayMode("MULTI_GUEST");
      setActiveSessionId(state.sessionId);
      setFlowStep("PLAY");
    } catch {
      setFlowError("Código inválido ou partida indisponível.");
    }
  };

  const persistStreak = (next: number) => {
    if (childId === null) return;
    localStorage.setItem(`axiora_ttt_streak_${childId}`, String(next));
  };

  const persistLevel = (next: number) => {
    if (childId === null) return;
    localStorage.setItem(`axiora_game_level_${childId}`, String(next));
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

  const getStoredLevel = (): number => {
    if (childId === null) return 0;
    const raw = localStorage.getItem(`axiora_game_level_${childId}`);
    const parsed = Number(raw ?? "0");
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  };

  const concludeMatch = async (result: MatchResult, line: number[] | null) => {
    setMatchResult(result);
    setWinningLine(line);
    setAiThinking(false);
    setPlayerTurn(false);

    const base = XP_BY_RESULT[result];
    const nextStreak = result === "WIN" ? winStreak + 1 : 0;
    const bonus = result === "WIN" && nextStreak > 0 && nextStreak % 3 === 0 ? 30 : 0;
    setBaseXp(base);
    setBonusXp(bonus);
    setWinStreak(nextStreak);
    persistStreak(nextStreak);

    if (result === "WIN") {
      setConfettiTrigger((prev) => prev + 1);
    }

    try {
      const requestedXp = base + bonus;
      const response = await registerGameSession({
        gameType: "TICTACTOE",
        score: requestedXp * 10,
      });
      setLastSession(response);
      persistEarnedXp(response.dailyLimit.grantedXp);
      const previousLevel = getStoredLevel();
      if (previousLevel > 0 && response.profile.level > previousLevel) {
        setLevelUpLevel(response.profile.level);
        setLevelUpReward(response.unlockedAchievements?.[0] ?? null);
      }
      persistLevel(response.profile.level);
    } catch {
      setLastSession(null);
    } finally {
      setRewardOpen(true);
    }
  };

  const evaluateBoard = (nextBoard: Board) => {
    const win = winnerFor(nextBoard);
    if (win?.winner === "X") return { done: true, result: "WIN" as const, line: win.line };
    if (win?.winner === "O") return { done: true, result: "LOSS" as const, line: win.line };
    if (availableMoves(nextBoard).length === 0) return { done: true, result: "DRAW" as const, line: null };
    return { done: false, result: null, line: null };
  };

  const onCellClick = (idx: number) => {
    if (playMode !== "SOLO") {
      if (!multiplayerState?.sessionId || !multiplayerState.canPlay || displayedBoard[idx] !== null || isFinished) return;
      void (async () => {
        try {
          await postMultiplayerMove(multiplayerState.sessionId, idx);
        } catch (error) {
          const message = getApiErrorMessage(error, "Não foi possível registrar a jogada. Tente novamente.");
          let friendly = message;
          if (error instanceof ApiError && error.status === 409) {
            const payload = error.payload as { detail?: unknown } | null;
            const detail = typeof payload?.detail === "string" ? payload.detail.toLowerCase() : "";
            if (detail.includes("turn") || detail.includes("vez")) {
              friendly = "Aguarde sua vez para jogar.";
            }
          }
          setFlowError(friendly);
          if (error instanceof ApiError && (error.status === 401 || error.status === 409)) {
            try {
              const latest = await getMultiplayerSession(multiplayerState.sessionId);
              if (latest.status === "IN_PROGRESS") {
                if (latest.canPlay) {
                  setFlowError(null);
                } else if (error.status === 409) {
                  setFlowError("Aguarde sua vez para jogar.");
                }
              }
            } catch {
              // Keep original error message when refresh fails.
            }
          }
        }
      })();
      return;
    }
    if (!playerTurn || aiThinking || isFinished) return;
    if (board[idx] !== null) return;

    setCellPulseIndex(idx);
    const playerBoard = [...board];
    playerBoard[idx] = "X";
    setBoard(playerBoard);

    const playerOutcome = evaluateBoard(playerBoard);
    if (playerOutcome.done && playerOutcome.result) {
      void concludeMatch(playerOutcome.result, playerOutcome.line);
      return;
    }

    setPlayerTurn(false);
    setAiThinking(true);
    window.setTimeout(() => {
      const aiIdx = chooseAiMove(playerBoard, difficulty);
      const aiBoard = [...playerBoard];
      aiBoard[aiIdx] = "O";
      setBoard(aiBoard);
      const aiOutcome = evaluateBoard(aiBoard);
      if (aiOutcome.done && aiOutcome.result) {
        void concludeMatch(aiOutcome.result, aiOutcome.line);
        return;
      }
      setAiThinking(false);
      setPlayerTurn(true);
    }, 420);
  };

  const startNewMatch = () => {
    if (playMode !== "SOLO") {
      if (activeSessionId) {
        void closeMultiplayerSession(activeSessionId, "restart").catch(() => null);
      }
      setPlayMode("SOLO");
      setFlowStep("MODE");
      setMultiplayerCreate(null);
      setActiveSessionId(null);
      setJoinCodeInput("");
      setFlowError(null);
    }
    setBoard(emptyBoard());
    setPlayerTurn(true);
    setAiThinking(false);
    setMatchResult(null);
    setWinningLine(null);
    setCellPulseIndex(null);
    setLastSession(null);
  };

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
      <RewardModal
        open={rewardOpen && matchResult !== null}
        result={matchResult ?? "DRAW"}
        baseXp={baseXp}
        bonusXp={bonusXp}
        apiResult={lastSession}
        onClose={() => setRewardOpen(false)}
      />

      <MultiplayerLaunchModal
        open={flowStep === "MODE"}
        onSolo={() => {
          setPlayMode("SOLO");
          setFlowStep("PLAY");
        }}
        onMulti={() => setFlowStep("HOST")}
      />

      <PageShell tone="child" width="content">
        {!isGuestMode && !isGuestFromQuery ? (
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
        ) : null}

        <Card className="mb-3">
          <CardHeader>
            <CardTitle>Jogo da Velha</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {flowStep === "HOST" ? (
              <div className="space-y-2 rounded-2xl border border-border bg-card p-3">
                <p className="text-sm font-semibold text-foreground">Partida privada por QR/código</p>
                {!multiplayerCreate ? (
                  <Button type="button" onClick={startMultiplayerHost}>
                    Gerar convite
                  </Button>
                ) : (
                  <>
                    <MultiplayerWaitingCard
                      joinCode={multiplayerCreate.joinCode}
                      joinUrl={
                        typeof window !== "undefined"
                          ? `${window.location.origin}${multiplayerCreate.joinUrl}`
                          : multiplayerCreate.joinUrl
                      }
                      waiting={multiplayerState?.status !== "IN_PROGRESS"}
                      onRefresh={() => setActiveSessionId(multiplayerCreate.sessionId)}
                    />
                    <Button type="button" variant="outline" onClick={() => setFlowStep("PLAY")}>
                      Ir para partida
                    </Button>
                  </>
                )}
              </div>
            ) : null}

            {flowStep === "JOIN" ? (
              <div className="space-y-2 rounded-2xl border border-border bg-card p-3">
                <p className="text-sm font-semibold text-foreground">Entrar com código</p>
                <input
                  className="h-10 w-full rounded-xl border border-border bg-white px-3 text-sm font-semibold uppercase tracking-[0.2em]"
                  maxLength={6}
                  value={joinCodeInput}
                  onChange={(event) => setJoinCodeInput(event.target.value.toUpperCase())}
                  placeholder="ABC123"
                />
                <div className="flex gap-2">
                  <Button type="button" onClick={joinMultiplayerByCode}>
                    Entrar
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setFlowStep("MODE")}>
                    Voltar
                  </Button>
                </div>
              </div>
            ) : null}

            {playMode === "SOLO" ? (
              <div className="inline-flex rounded-2xl border border-border p-1 text-sm">
                {(["EASY", "MEDIUM", "HARD"] as Difficulty[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={cn(
                      "rounded-xl px-3 py-1.5 font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2",
                      difficulty === mode ? "bg-primary/15 text-primary" : "text-muted-foreground",
                    )}
                    onClick={() => setDifficulty(mode)}
                    disabled={aiThinking}
                  >
                    {mode === "EASY" ? "Fácil" : mode === "MEDIUM" ? "Médio" : "Difícil"}
                  </button>
                ))}
              </div>
            ) : (
              <div className="inline-flex rounded-2xl border border-border bg-secondary/10 px-3 py-1.5 text-sm font-semibold text-secondary-foreground">
                2 jogadores • {statusLabel} • {isRealtimeConnected ? "ao vivo" : "sincronizando"}
              </div>
            )}
            {flowError ? <p className="text-xs font-semibold text-destructive">{flowError}</p> : null}
            <div className="flex items-center justify-between text-sm">
              <p className="font-semibold text-foreground">{statusText}</p>
              <p className="text-muted-foreground">Sequência: {winStreak}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="mx-auto grid max-w-[21rem] grid-cols-3 gap-2">
              {displayedBoard.map((cell, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={cn(
                    "aspect-square rounded-2xl border-2 border-border bg-card text-4xl font-extrabold text-foreground shadow-[0_2px_0_rgba(184,200,239,0.7)] transition duration-150",
                    !isFinished && "hover:scale-[1.02] active:scale-[0.98]",
                    cell && "scale-[1.01]",
                    cell === "X" && "text-primary",
                    cell === "O" && "text-secondary",
                    cellPulseIndex === idx && "animate-pulse",
                    winningLine?.includes(idx) && "border-accent bg-accent/20",
                  )}
                  onClick={() => onCellClick(idx)}
                  disabled={cell !== null || aiThinking || isFinished}
                >
                  {cell}
                </button>
              ))}
            </div>

            {!isGuestMode && !isGuestFromQuery ? (
              <div className="mt-4 flex items-center gap-2">
                <Button onClick={startNewMatch}>{isFinished ? "Jogar novamente" : "Reiniciar partida"}</Button>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {!isGuestMode && !isGuestFromQuery ? <ChildBottomNav /> : null}
      </PageShell>
    </>
  );
}

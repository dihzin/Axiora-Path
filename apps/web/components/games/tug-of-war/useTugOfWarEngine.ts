"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type GameMode = "cpu" | "pvp";
export type CharacterAnimState = "idle" | "pulling" | "hit" | "victory" | "defeat";
export type TugOfWarEvent = "idle" | "p1_correct" | "p2_correct" | "p1_wrong" | "p2_wrong";
export type TugOfWarGameState = "idle" | "playing" | "finished";
type Winner = "red" | "blue" | null;
type ActivePlayer = "p1" | "p2";
type FeedbackKind = "correct" | "wrong";

type MathQuestion = {
  id: number;
  text: string;
  answer: number;
};

export type RoundResult = {
  winner: "red" | "blue";
  reactionTime: number;
};

export type MatchAnalytics = {
  totalRounds: number;
  fastestReaction: number | null;
  slowestReaction: number | null;
  averageReaction: number | null;
  winner: "red" | "blue" | null;
};

type SideStats = {
  wins: number;
  avgReaction: number;
  fastest: number;
};

type MatchStats = {
  red: SideStats;
  blue: SideStats;
};

export type FloatingFeedbackItem = {
  id: number;
  player: ActivePlayer;
  text: string;
  kind: FeedbackKind;
};

export const CHAR_W = 130;
export const ROPE_W = 180;
const PULL_STEP = 0.08;
const WRONG_STEP = 10;
const WIN_THRESHOLD = 130;
const CENTER_WIN_THRESHOLD = 0.95;
const WRONG_CENTER_STEP = 0.03;

const INITIAL_STATS: MatchStats = {
  red: { wins: 0, avgReaction: 0, fastest: Number.POSITIVE_INFINITY },
  blue: { wins: 0, avgReaction: 0, fastest: Number.POSITIVE_INFINITY },
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateQuestion(difficulty: number): MathQuestion {
  const safeDifficulty = Math.max(1, difficulty);
  const operations: Array<"add" | "sub" | "mul"> = safeDifficulty >= 2 ? ["add", "sub", "mul"] : ["add", "sub"];
  const op = operations[randInt(0, operations.length - 1)];

  if (op === "add") {
    const a = randInt(1, 12 * safeDifficulty);
    const b = randInt(1, 12 * safeDifficulty);
    return { id: Date.now() + Math.random(), text: `${a} + ${b}`, answer: a + b };
  }

  if (op === "sub") {
    const a = randInt(5, 15 * safeDifficulty);
    const b = randInt(1, a);
    return { id: Date.now() + Math.random(), text: `${a} - ${b}`, answer: a - b };
  }

  const a = randInt(2, 5 * safeDifficulty);
  const b = randInt(2, 10);
  return { id: Date.now() + Math.random(), text: `${a} × ${b}`, answer: a * b };
}

function idleStatesForWinner(winner: Winner): { p1Anim: CharacterAnimState; p2Anim: CharacterAnimState } {
  if (winner === "red") {
    return { p1Anim: "victory", p2Anim: "defeat" };
  }
  if (winner === "blue") {
    return { p1Anim: "defeat", p2Anim: "victory" };
  }
  return { p1Anim: "idle", p2Anim: "idle" };
}

export function useTugOfWarEngine() {
  const [ropeCenter, setRopeCenter] = useState(0);
  const [p1Anim, setP1Anim] = useState<CharacterAnimState>("idle");
  const [p2Anim, setP2Anim] = useState<CharacterAnimState>("idle");
  const [p1Streak, setP1Streak] = useState(0);
  const [p2Streak, setP2Streak] = useState(0);
  const [question, setQuestion] = useState<MathQuestion>(() => generateQuestion(1));
  const [answers, setAnswers] = useState<Record<ActivePlayer, string>>({ p1: "", p2: "" });
  const [mode, setMode] = useState<GameMode>("cpu");
  const [winner, setWinner] = useState<Winner>(null);
  const [difficulty, setDifficulty] = useState(1);
  const [roundResolved, setRoundResolved] = useState(false);
  const [feedback, setFeedback] = useState<FloatingFeedbackItem[]>([]);
  const [ropeShakeTick, setRopeShakeTick] = useState(0);
  const [isCpuThinking, setIsCpuThinking] = useState(false);
  const [lastEvent, setLastEvent] = useState<TugOfWarEvent>("idle");
  const [gameState, setGameState] = useState<TugOfWarGameState>("idle");
  const [roundStartTime, setRoundStartTime] = useState<number>(0);
  const [p1Time, setP1Time] = useState<number | null>(null);
  const [p2Time, setP2Time] = useState<number | null>(null);
  const [lastRoundResult, setLastRoundResult] = useState<RoundResult | null>(null);
  const [stats, setStats] = useState<MatchStats>(INITIAL_STATS);
  const [reactionHistory, setReactionHistory] = useState<number[]>([]);

  const resetAnimsTimeout = useRef<number | null>(null);
  const resetEventTimeout = useRef<number | null>(null);
  const roundResetTimeout = useRef<number | null>(null);
  const roundResolvedRef = useRef(false);

  const publishEvent = useCallback((event: TugOfWarEvent) => {
    if (resetEventTimeout.current !== null) {
      window.clearTimeout(resetEventTimeout.current);
      resetEventTimeout.current = null;
    }
    setLastEvent(event);
    resetEventTimeout.current = window.setTimeout(() => {
      setLastEvent("idle");
      resetEventTimeout.current = null;
    }, 250);
  }, []);

  const beginRoundTimer = useCallback(() => {
    setRoundStartTime(performance.now());
    setP1Time(null);
    setP2Time(null);
  }, []);

  const queueFeedback = useCallback((player: ActivePlayer, isCorrect: boolean) => {
    const item: FloatingFeedbackItem = {
      id: Date.now() + Math.random(),
      player,
      text: isCorrect ? "✅ +1" : "❌",
      kind: isCorrect ? "correct" : "wrong",
    };

    setFeedback((prev) => [...prev, item]);
    window.setTimeout(() => {
      setFeedback((prev) => prev.filter((entry) => entry.id !== item.id));
    }, 700);
  }, []);

  const scheduleIdleReset = useCallback((resolvedWinner: Winner) => {
    if (resetAnimsTimeout.current !== null) {
      window.clearTimeout(resetAnimsTimeout.current);
      resetAnimsTimeout.current = null;
    }

    if (resolvedWinner !== null) {
      const states = idleStatesForWinner(resolvedWinner);
      setP1Anim(states.p1Anim);
      setP2Anim(states.p2Anim);
      return;
    }

    resetAnimsTimeout.current = window.setTimeout(() => {
      setP1Anim("idle");
      setP2Anim("idle");
    }, 250);
  }, []);

  const applyAnswerResult = useCallback(
    (player: ActivePlayer, isCorrect: boolean) => {
      let didWin = false;
      let resolvedWinner: Winner = null;

      if (player === "p1") {
        if (isCorrect) {
          const nextCenter = clamp(ropeCenter + PULL_STEP, -1, 1);
          setRopeCenter(nextCenter);
          setP1Anim("pulling");
          setP2Anim("hit");
          setP1Streak((prev) => prev + 1);
          setP2Streak(0);
          publishEvent("p1_correct");

          if (nextCenter >= CENTER_WIN_THRESHOLD) {
            resolvedWinner = "red";
            didWin = true;
          }
        } else {
          setRopeCenter((prev) => Math.max(0, prev - WRONG_CENTER_STEP));
          setP1Anim("hit");
          setP2Anim("idle");
          setP1Streak(0);
          setRopeShakeTick((prev) => prev + 1);
          publishEvent("p1_wrong");
        }
      } else {
        if (isCorrect) {
          const nextCenter = clamp(ropeCenter - PULL_STEP, -1, 1);
          setRopeCenter(nextCenter);
          setP2Anim("pulling");
          setP1Anim("hit");
          setP2Streak((prev) => prev + 1);
          setP1Streak(0);
          publishEvent("p2_correct");

          if (nextCenter <= -CENTER_WIN_THRESHOLD) {
            resolvedWinner = "blue";
            didWin = true;
          }
        } else {
          setRopeCenter((prev) => Math.min(0, prev + WRONG_CENTER_STEP));
          setP2Anim("hit");
          setP1Anim("idle");
          setP2Streak(0);
          setRopeShakeTick((prev) => prev + 1);
          publishEvent("p2_wrong");
        }
      }

      queueFeedback(player, isCorrect);

      if (resolvedWinner !== null) {
        setWinner(resolvedWinner);
        setGameState("finished");
      }

      scheduleIdleReset(resolvedWinner);
      return didWin;
    },
    [publishEvent, queueFeedback, ropeCenter, scheduleIdleReset],
  );

  const submitNumericAnswer = useCallback(
    (numericAnswer: number, player: ActivePlayer) => {
      if (gameState !== "playing") return;
      if (winner !== null) return;
      if (roundResolvedRef.current) return;

      const isCorrect = numericAnswer === question.answer;
      if (isCorrect) {
        if (roundResolvedRef.current) return;
        roundResolvedRef.current = true;
        setRoundResolved(true);
      }
      const reaction = Math.max(0, performance.now() - roundStartTime);
      if (player === "p1") {
        setP1Time(reaction);
      } else {
        setP2Time(reaction);
      }
      const didWin = applyAnswerResult(player, isCorrect);
      setAnswers((prev) => ({ ...prev, [player]: "" }));

      if (!isCorrect) {
        return;
      }

      setLastRoundResult({
        winner: player === "p1" ? "red" : "blue",
        reactionTime: reaction,
      });
      setReactionHistory((prev) => [...prev, reaction]);
      setStats((prev) => {
        const sideKey = player === "p1" ? "red" : "blue";
        const side = prev[sideKey];
        const nextWins = side.wins + 1;
        return {
          ...prev,
          [sideKey]: {
            wins: nextWins,
            avgReaction: (side.avgReaction * side.wins + reaction) / nextWins,
            fastest: Math.min(side.fastest, reaction),
          },
        };
      });
      if (!didWin) {
        if (roundResetTimeout.current !== null) {
          window.clearTimeout(roundResetTimeout.current);
        }
        roundResetTimeout.current = window.setTimeout(() => {
          setQuestion(generateQuestion(difficulty));
          roundResolvedRef.current = false;
          setRoundResolved(false);
          setAnswers({ p1: "", p2: "" });
          beginRoundTimer();
          roundResetTimeout.current = null;
        }, 700);
      }
    },
    [applyAnswerResult, beginRoundTimer, difficulty, gameState, question.answer, roundStartTime, winner],
  );

  const submitAnswer = useCallback(
    (player: ActivePlayer) => {
      const rawAnswer = answers[player];
      if (!rawAnswer.trim()) return;
      const numericAnswer = Number(rawAnswer);
      if (!Number.isFinite(numericAnswer)) return;
      submitNumericAnswer(numericAnswer, player);
    },
    [answers, submitNumericAnswer],
  );

  const resetGame = useCallback(
    (nextMode: GameMode = mode, nextDifficulty: number = difficulty) => {
      if (resetAnimsTimeout.current !== null) {
        window.clearTimeout(resetAnimsTimeout.current);
        resetAnimsTimeout.current = null;
      }

      setRopeCenter(0);
      setP1Anim("idle");
      setP2Anim("idle");
      setP1Streak(0);
      setP2Streak(0);
      setQuestion(generateQuestion(nextDifficulty));
      setAnswers({ p1: "", p2: "" });
      setMode(nextMode);
      setWinner(null);
      setDifficulty(nextDifficulty);
      roundResolvedRef.current = false;
      setRoundResolved(false);
      setFeedback([]);
      setRopeShakeTick(0);
      setIsCpuThinking(false);
      setLastEvent("idle");
      setGameState("playing");
      setLastRoundResult(null);
      setReactionHistory([]);
      setStats(INITIAL_STATS);
      beginRoundTimer();
    },
    [beginRoundTimer, difficulty, mode],
  );

  const handleModeChange = useCallback(
    (nextMode: GameMode) => {
      resetGame(nextMode, difficulty);
    },
    [difficulty, resetGame],
  );

  const handleDifficultyChange = useCallback(
    (nextDifficulty: number) => {
      resetGame(mode, clamp(nextDifficulty, 1, 3));
    },
    [mode, resetGame],
  );

  const appendDigit = useCallback(
    (player: ActivePlayer, digit: string) => {
      if (!/^\d$/.test(digit)) return;
      if (winner !== null) return;
      if (roundResolved) return;
      setAnswers((prev) => ({
        ...prev,
        [player]: (prev[player] === "0" ? digit : `${prev[player]}${digit}`).slice(0, 4),
      }));
    },
    [roundResolved, winner],
  );

  const deleteDigit = useCallback((player: ActivePlayer) => {
    if (winner !== null) return;
    if (roundResolved) return;
    setAnswers((prev) => ({ ...prev, [player]: prev[player].slice(0, -1) }));
  }, [roundResolved, winner]);

  useEffect(() => {
    roundResolvedRef.current = false;
    setGameState("playing");
    beginRoundTimer();
  }, [beginRoundTimer]);

  useEffect(() => {
    if (mode !== "cpu") {
      setIsCpuThinking(false);
      return;
    }
    if (winner !== null) {
      setIsCpuThinking(false);
      return;
    }
    if (roundResolved) {
      setIsCpuThinking(false);
      return;
    }

    setIsCpuThinking(true);
    const rawDelay = 3000 - difficulty * 400 + randInt(0, 800);
    const delay = Math.max(900, rawDelay);

    const timer = window.setTimeout(() => {
      const accuracy = clamp(0.45 + difficulty * 0.12, 0.45, 0.9);
      const cpuCorrect = Math.random() < accuracy;
      const cpuAnswer = cpuCorrect ? question.answer : question.answer + randInt(1, 3);
      setIsCpuThinking(false);
      submitNumericAnswer(cpuAnswer, "p2");
    }, delay);

    return () => {
      window.clearTimeout(timer);
    };
  }, [difficulty, mode, question.answer, roundResolved, submitNumericAnswer, winner]);

  useEffect(() => {
    return () => {
      if (resetAnimsTimeout.current !== null) {
        window.clearTimeout(resetAnimsTimeout.current);
      }
      if (resetEventTimeout.current !== null) {
        window.clearTimeout(resetEventTimeout.current);
      }
      if (roundResetTimeout.current !== null) {
        window.clearTimeout(roundResetTimeout.current);
      }
    };
  }, []);

  const winnerLabel = useMemo(() => {
    if (winner === "red") return "Vermelho";
    if (winner === "blue") return "Azul";
    return null;
  }, [winner]);

  const ropePos = useMemo(
    () => clamp(0.5 + ropeCenter * 0.5, 0, 1),
    [ropeCenter],
  );

  const redX = useMemo(() => -ropeCenter * WIN_THRESHOLD, [ropeCenter]);
  const blueX = useMemo(() => -ropeCenter * WIN_THRESHOLD, [ropeCenter]);

  const matchAnalytics = useMemo<MatchAnalytics>(() => {
    const totalRounds = stats.red.wins + stats.blue.wins;
    if (reactionHistory.length === 0) {
      return {
        totalRounds,
        fastestReaction: null,
        slowestReaction: null,
        averageReaction: null,
        winner,
      };
    }
    let fastestReaction = Number.POSITIVE_INFINITY;
    let slowestReaction = Number.NEGATIVE_INFINITY;
    let sum = 0;
    for (const reaction of reactionHistory) {
      fastestReaction = Math.min(fastestReaction, reaction);
      slowestReaction = Math.max(slowestReaction, reaction);
      sum += reaction;
    }
    return {
      totalRounds,
      fastestReaction,
      slowestReaction,
      averageReaction: sum / reactionHistory.length,
      winner,
    };
  }, [reactionHistory, stats.blue.wins, stats.red.wins, winner]);

  return {
    redX,
    blueX,
    ropePos,
    p1Anim,
    p2Anim,
    p1Streak,
    p2Streak,
    question,
    answer: answers.p1,
    p1Answer: answers.p1,
    p2Answer: answers.p2,
    mode,
    gameState,
    roundResolved,
    winner,
    difficulty,
    feedback,
    ropeShakeTick,
    lastEvent,
    roundStartTime,
    p1Time,
    p2Time,
    lastRoundResult,
    stats,
    matchAnalytics,
    isCpuThinking,
    winnerLabel,
    appendDigit,
    deleteDigit,
    submitAnswer,
    setMode: handleModeChange,
    setDifficulty: handleDifficultyChange,
    resetGame,
    constants: {
      CHAR_W,
      ROPE_W,
      PULL_STEP,
      WRONG_STEP,
      WIN_THRESHOLD,
    },
  };
}

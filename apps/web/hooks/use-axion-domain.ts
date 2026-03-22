import { useCallback, useEffect, useRef, useState } from "react";

import type { ActionFeedbackState } from "@/components/action-feedback";
import {
  getAxionState,
  getMood,
  postMood,
  useAiCoach as requestAiCoach,
  type AxionStateResponse,
  type MoodType,
} from "@/lib/api/client";
import type { Mood } from "@/lib/types/mood";

type FeedbackCallback = (message: string, type?: "success" | "error") => void;

export type AxionCelebrationType =
  | "streak_7"
  | "streak_30"
  | "level_up"
  | "goal_completed";

const CELEBRATION_PHRASES: Record<AxionCelebrationType, string> = {
  streak_7: "Sete dias seguidos! Axion está em modo lenda!",
  streak_30: "Trinta dias! Axion desbloqueou energia máxima!",
  level_up: "Subiu de nível! Axion evoluiu junto com você!",
  goal_completed: "Meta concluída! Axion está comemorando essa conquista!",
};

type UseAxionDomainInput = {
  childId: number | null;
  todayIso: string;
  onFeedback?: FeedbackCallback;
};

export type AxionDomainState = {
  axionState: AxionStateResponse | null;
  axionDialogue: { message: string; visible: boolean };
  axionCelebration: AxionCelebrationType | null;
  todayMood: Mood | null;
  moodError: string | null;
  moodFeedback: ActionFeedbackState;
  triggerCelebration: (type: AxionCelebrationType) => void;
  dismissDialogue: () => void;
  fetchCoachDialogue: (
    reason: "first_login" | "streak_milestone" | "level_up" | "goal_near",
  ) => Promise<void>;
  onSelectMood: (mood: Mood) => Promise<boolean>;
};

function moodToApiMood(mood: Mood): MoodType {
  if (mood === "happy") return "HAPPY";
  if (mood === "neutral") return "OK";
  if (mood === "sad") return "SAD";
  if (mood === "angry") return "ANGRY";
  return "TIRED";
}

function apiMoodToMood(mood: MoodType): Mood {
  if (mood === "HAPPY") return "happy";
  if (mood === "OK") return "neutral";
  if (mood === "SAD") return "sad";
  if (mood === "ANGRY") return "angry";
  return "tired";
}

function moodToAxionMoodState(mood: MoodType): string {
  if (mood === "HAPPY") return "HAPPY";
  if (mood === "SAD") return "SAD";
  if (mood === "ANGRY") return "ANGRY";
  if (mood === "TIRED") return "TIRED";
  return "NEUTRAL";
}

function setTransientFeedback(
  setState: React.Dispatch<React.SetStateAction<ActionFeedbackState>>,
  timerRef: React.MutableRefObject<number | null>,
  state: Exclude<ActionFeedbackState, "loading">,
) {
  setState(state);
  if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  timerRef.current = window.setTimeout(() => setState("idle"), 650);
}

export function useAxionDomain({
  childId,
  todayIso,
  onFeedback,
}: UseAxionDomainInput): AxionDomainState {
  const [axionState, setAxionState] = useState<AxionStateResponse | null>(null);
  const [axionDialogue, setAxionDialogue] = useState<{ message: string; visible: boolean }>({
    message: "",
    visible: false,
  });
  const [axionCelebration, setAxionCelebration] = useState<AxionCelebrationType | null>(null);
  const [todayMood, setTodayMood] = useState<Mood | null>(null);
  const [moodError, setMoodError] = useState<string | null>(null);
  const [moodFeedback, setMoodFeedback] = useState<ActionFeedbackState>("idle");

  const celebrationTimerRef = useRef<number | null>(null);
  const moodFeedbackTimerRef = useRef<number | null>(null);
  const onFeedbackRef = useRef(onFeedback);
  useEffect(() => { onFeedbackRef.current = onFeedback; }, [onFeedback]);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (childId === null) return;

    getAxionState(childId)
      .then((data) => setAxionState(data))
      .catch(() => setAxionState(null));

    getMood(childId)
      .then((data) => {
        const found = data.find((item) => item.date === todayIso);
        setTodayMood(found ? apiMoodToMood(found.mood) : null);
      })
      .catch(() => setTodayMood(null));
  }, [childId, todayIso]);

  // ── Cleanup timers on unmount ─────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (celebrationTimerRef.current !== null) window.clearTimeout(celebrationTimerRef.current);
      if (moodFeedbackTimerRef.current !== null) window.clearTimeout(moodFeedbackTimerRef.current);
    };
  }, []);

  // ── Actions ───────────────────────────────────────────────────────────────
  const showDialogue = useCallback((message: string) => {
    const trimmed = message.trim();
    if (!trimmed) return;
    setAxionDialogue({ message: trimmed, visible: true });
  }, []);

  const dismissDialogue = useCallback(() => {
    setAxionDialogue((prev) => ({ ...prev, visible: false }));
  }, []);

  const triggerCelebration = useCallback(
    (type: AxionCelebrationType) => {
      setAxionCelebration(type);
      showDialogue(CELEBRATION_PHRASES[type]);
      if (celebrationTimerRef.current !== null) window.clearTimeout(celebrationTimerRef.current);
      celebrationTimerRef.current = window.setTimeout(() => setAxionCelebration(null), 2400);
    },
    [showDialogue],
  );

  const fetchCoachDialogue = useCallback(
    async (reason: "first_login" | "streak_milestone" | "level_up" | "goal_near") => {
      if (childId === null) return;
      try {
        const response = await requestAiCoach(childId, "CHILD", `context:${reason}`);
        showDialogue(response.reply);
      } catch {
        // Non-critical — AI coach is best-effort
      }
    },
    [childId, showDialogue],
  );

  const onSelectMood = useCallback(
    async (mood: Mood): Promise<boolean> => {
      if (childId === null) {
        setMoodError("Selecione um perfil infantil para registrar humor.");
        onFeedbackRef.current?.("Selecione a criança primeiro", "error");
        return false;
      }
      const apiMood = moodToApiMood(mood);
      setMoodError(null);
      setMoodFeedback("loading");
      try {
        await postMood(childId, apiMood);
        setTodayMood(mood);
        setAxionState((prev) =>
          prev
            ? { ...prev, mood_state: moodToAxionMoodState(apiMood) }
            : { stage: 1, mood_state: moodToAxionMoodState(apiMood), personality_traits: [] },
        );
        setTransientFeedback(setMoodFeedback, moodFeedbackTimerRef, "success");
        onFeedbackRef.current?.("Humor atualizado", "success");
        return true;
      } catch {
        setMoodError("Não foi possível salvar humor agora.");
        setTransientFeedback(setMoodFeedback, moodFeedbackTimerRef, "error");
        return false;
      }
    },
    [childId],
  );

  return {
    axionState,
    axionDialogue,
    axionCelebration,
    todayMood,
    moodError,
    moodFeedback,
    triggerCelebration,
    dismissDialogue,
    fetchCoachDialogue,
    onSelectMood,
  };
}

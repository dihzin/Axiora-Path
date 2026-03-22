import { useMemo } from "react";

import type { MissionLoopState } from "@/components/mission-card-v2";
import type { Mood } from "@/lib/types/mood";

export type AxionCompanionMood = "happy" | "neutral" | "tired" | "excited";

type UseAxionStateInput = {
  childName?: string;
  todayMood: Mood | null;
  backendMoodState?: string | null;
  streakCount: number;
  missionState: MissionLoopState;
};

type UseAxionStateResult = {
  mood: AxionCompanionMood;
  visualMoodState: string;
  headline: string;
  message: string;
};

function resolveVisualMood(mood: AxionCompanionMood): string {
  if (mood === "excited") return "EXCITED";
  if (mood === "happy") return "HAPPY";
  if (mood === "tired") return "TIRED";
  return "NEUTRAL";
}

export function useAxionState({
  childName,
  todayMood,
  backendMoodState,
  streakCount,
  missionState,
}: UseAxionStateInput): UseAxionStateResult {
  return useMemo(() => {
    const namePrefix = childName?.trim() ? `${childName.trim()}, ` : "";
    const backendMood = (backendMoodState ?? "").toUpperCase();

    if (missionState === "reward" || missionState === "completed") {
      return {
        mood: "excited",
        visualMoodState: resolveVisualMood("excited"),
        headline: `${namePrefix}você está indo bem!`,
        message: "Missão concluída. Vamos manter esse ritmo e buscar mais XP.",
      };
    }

    if (streakCount <= 0) {
      return {
        mood: "neutral",
        visualMoodState: resolveVisualMood("neutral"),
        headline: "Senti sua falta ontem...",
        message: "Vamos começar com uma missão curta para retomar o ritmo.",
      };
    }

    if (todayMood === "tired" || backendMood === "TIRED") {
      return {
        mood: "tired",
        visualMoodState: resolveVisualMood("tired"),
        headline: "Vamos começar?",
        message: "Hoje seguimos no seu ritmo: foco, passos curtos e progresso consistente.",
      };
    }

    if (missionState === "active" || streakCount >= 5 || todayMood === "happy" || backendMood === "HAPPY") {
      return {
        mood: "happy",
        visualMoodState: resolveVisualMood("happy"),
        headline: "Vamos começar?",
        message: "A jornada está fluindo. Mais uma missão e você sobe mais rápido.",
      };
    }

    return {
      mood: "neutral",
      visualMoodState: resolveVisualMood("neutral"),
      headline: "Você está no caminho certo.",
      message: "Consistência vence velocidade. Um passo por vez.",
    };
  }, [backendMoodState, childName, missionState, streakCount, todayMood]);
}


import { useMemo } from "react";

export type AxionBehaviorState = "inactive" | "warming_up" | "focused" | "on_fire";

type UseAxionBehaviorInput = {
  childName?: string;
  usageFrequencyScore: number;
  missionsCompletedCount: number;
  offlineHours: number;
  loopBroken?: boolean;
};

type UseAxionBehaviorResult = {
  state: AxionBehaviorState;
  visualMoodState: string;
  idleMotion: "calm" | "active" | "energetic";
  headline: string;
  message: string;
};

export function useAxionBehavior({
  childName,
  usageFrequencyScore,
  missionsCompletedCount,
  offlineHours,
  loopBroken = false,
}: UseAxionBehaviorInput): UseAxionBehaviorResult {
  return useMemo(() => {
    const namePrefix = childName?.trim() ? `${childName.trim()}, ` : "";
    const frequency = Math.max(0, usageFrequencyScore);
    const completed = Math.max(0, missionsCompletedCount);
    const offline = Math.max(0, offlineHours);

    if (loopBroken || offline >= 36) {
      return {
        state: "inactive",
        visualMoodState: "CONCERNED",
        idleMotion: "calm",
        headline: "Senti sua falta...",
        message: `${namePrefix}vamos retomar com uma missão curta para recuperar seu ritmo.`,
      };
    }

    if (frequency >= 5 && completed >= 3) {
      return {
        state: "on_fire",
        visualMoodState: "EXCITED",
        idleMotion: "energetic",
        headline: "Você está imparável!",
        message: "Seu ritmo está alto. Continue assim para acelerar a evolução.",
      };
    }

    if (frequency >= 2 || completed >= 1) {
      return {
        state: "focused",
        visualMoodState: "PROUD",
        idleMotion: "active",
        headline: `${namePrefix}bom progresso hoje.`,
        message: "Mais um passo consistente e você fecha a meta do dia.",
      };
    }

    return {
      state: "warming_up",
      visualMoodState: "HAPPY",
      idleMotion: "active",
      headline: "Vamos começar?",
      message: "Uma missão agora já aquece sua jornada.",
    };
  }, [childName, loopBroken, missionsCompletedCount, offlineHours, usageFrequencyScore]);
}

import { useMemo } from "react";

import type { MissionLoopState } from "@/components/mission-card-v2";
import type { DailyMissionResponse } from "@/lib/api/client";

type HomeFlowAction = "focus_mission" | "go_journey" | "start_onboarding";

type UseHomeFlowInput = {
  missionState: MissionLoopState;
  dailyMission: DailyMissionResponse | null;
  streakCount: number;
  hasJourneyNodes: boolean;
  weeklyLogsCount: number;
};

export type HomeFlowState = {
  mode: "onboarding" | "progression";
  focus: "mission" | "journey" | "onboarding";
  nextStepIdeal: string;
  helperText: string;
  primaryAction: {
    type: HomeFlowAction;
    label: string;
  };
};

export function useHomeFlow({
  missionState,
  dailyMission,
  streakCount,
  hasJourneyNodes,
  weeklyLogsCount,
}: UseHomeFlowInput): HomeFlowState {
  return useMemo(() => {
    const isNewUser = weeklyLogsCount === 0 && streakCount === 0 && missionState === "locked";

    if (isNewUser) {
      return {
        mode: "onboarding",
        focus: "onboarding",
        nextStepIdeal: "Comece com sua primeira missão guiada.",
        helperText: "Onboarding leve: 1 missão rápida para ativar sua jornada.",
        primaryAction: {
          type: "start_onboarding",
          label: "Começar agora",
        },
      };
    }

    if (missionState === "active" || missionState === "locked") {
      return {
        mode: "progression",
        focus: "mission",
        nextStepIdeal: dailyMission?.title?.trim() || "Finalizar missão central",
        helperText: "Missão incompleta detectada. Prioridade total nela.",
        primaryAction: {
          type: "focus_mission",
          label: missionState === "active" ? "Continuar missão" : "Ver missão",
        },
      };
    }

    return {
      mode: "progression",
      focus: hasJourneyNodes ? "journey" : "mission",
      nextStepIdeal: hasJourneyNodes ? "Avançar para o próximo node da jornada." : "Carregar jornada de aprendizado.",
      helperText: "Missão concluída. Próximo passo: progressão direta.",
      primaryAction: {
        type: "go_journey",
        label: "Continuar jornada",
      },
    };
  }, [dailyMission?.title, hasJourneyNodes, missionState, streakCount, weeklyLogsCount]);
}


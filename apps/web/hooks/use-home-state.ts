import { useMemo } from "react";

import type { MissionLoopState } from "@/components/mission-card-v2";
import { useAxionBehavior } from "@/hooks/use-axion-behavior";
import type { DailyMissionResponse, LearningPathResponse } from "@/lib/api/client";

export type HomeNextActionType = "mission" | "claim" | "progress";

export type HomeState = {
  user: {
    name: string;
    greeting: string;
    subtitle: string;
    level: number;
    xpPercent: number;
    streak: number;
    isNewUser: boolean;
  };
  mission: {
    title: string;
    subtitle: string;
    rarityLabel: string;
    progressPercent: number;
    loopState: MissionLoopState;
    completed: boolean;
    reward: {
      available: boolean;
      xp: number;
      coins: number;
    };
  };
  progression: {
    learningPath: LearningPathResponse | null;
    hasJourneyNodes: boolean;
    loading: boolean;
    error: string | null;
    nextStepIdeal: string;
    recentProgressLabel: string;
  };
  axion: {
    stage: number;
    behaviorState: ReturnType<typeof useAxionBehavior>["state"];
    visualMoodState: string;
    idleMotion: ReturnType<typeof useAxionBehavior>["idleMotion"];
    headline: string;
    message: string;
    dialogueMessage: string;
    dialogueVisible: boolean;
    celebrating: boolean;
  };
  economy: {
    balanceCents: number;
    activeGoalTitle: string;
    activeGoalTargetLabel: string;
  };
  streak: {
    freezeUsedToday: boolean;
  };
  nextAction: {
    type: HomeNextActionType;
    label: string;
    helperText: string;
  };
};

type UseHomeStateInput = {
  childName: string;
  learningLevel: number | null;
  fallbackLevel: number | null;
  xpPercent: number;
  streakCount: number;
  routineLogsCount: number;
  logsTodayCount: number;
  dailyMission: DailyMissionResponse | null;
  missionRewardClaimed: boolean;
  hasJourneyNodes: boolean;
  learningPath: LearningPathResponse | null;
  progressionError: string | null;
  progressionLoading: boolean;
  axionStage: number;
  usageFrequencyScore: number;
  missionsCompletedCount: number;
  offlineHours: number;
  loopBroken: boolean;
  axionDialogueMessage: string;
  axionDialogueVisible: boolean;
  axionCelebrating: boolean;
  walletBalanceCents: number;
  missionSubtitle: string;
  missionRarityLabel: string;
  missionProgressPercent: number;
  activeGoalTitle: string;
  activeGoalTargetLabel: string;
  streakFreezeUsedToday: boolean;
};

export function useHomeState(input: UseHomeStateInput): HomeState {
  const missionLoopState: MissionLoopState = !input.dailyMission
    ? "locked"
    : input.dailyMission.status !== "completed"
      ? "active"
      : input.missionRewardClaimed
        ? "reward"
        : "completed";

  const axion = useAxionBehavior({
    childName: input.childName,
    usageFrequencyScore: input.usageFrequencyScore,
    missionsCompletedCount: input.missionsCompletedCount,
    offlineHours: input.offlineHours,
    loopBroken: input.loopBroken,
  });

  return useMemo(() => {
    const hasMission = Boolean(input.dailyMission);
    const completed = input.dailyMission?.status === "completed";
    const rewardAvailable = completed && !input.missionRewardClaimed;
    const isNewUser = input.routineLogsCount === 0 && input.streakCount === 0 && missionLoopState === "locked";

    const nextActionType: HomeNextActionType = hasMission
      ? !completed
        ? "mission"
        : "claim"
      : "progress";

    const nextActionLabel =
      nextActionType === "mission"
        ? missionLoopState === "active"
          ? "Continuar missão"
          : "Começar missão"
        : nextActionType === "claim"
          ? "Resgatar recompensa"
          : input.hasJourneyNodes
            ? "Continuar jornada"
            : "Explorar jornada";

    const nextActionHelper =
      nextActionType === "mission"
        ? "Missão incompleta detectada. Prioridade total nela."
        : nextActionType === "claim"
          ? "Você concluiu a missão. Resgate a recompensa para liberar o próximo ciclo."
          : "Sem missão ativa. Próximo passo: explorar a jornada.";

    const nextStepIdeal =
      nextActionType === "mission"
        ? input.dailyMission?.title?.trim() || "Concluir missão central"
        : hasMission
          ? "Resgatar recompensa da missão concluída."
          : input.hasJourneyNodes
            ? "Avançar para o próximo node da jornada."
            : "Carregar jornada de aprendizado.";
    const recentProgressLabel =
      input.logsTodayCount > 0
        ? `${input.logsTodayCount} avanço${input.logsTodayCount > 1 ? "s" : ""} hoje`
        : "Nenhum avanço hoje ainda";

    return {
      user: {
        name: input.childName,
        greeting: input.streakCount >= 5 ? "Pronto para evoluir hoje?" : "Vamos começar mais uma missão?",
        subtitle: input.childName ? `${input.childName}, seu progresso está em andamento.` : "Seu progresso está em andamento.",
        level: input.learningLevel ?? input.fallbackLevel ?? 1,
        xpPercent: Math.max(0, Math.min(100, input.xpPercent)),
        streak: input.streakCount,
        isNewUser,
      },
      mission: {
        title: input.dailyMission?.title ?? "Missão indisponível no momento",
        subtitle: input.missionSubtitle,
        rarityLabel: input.missionRarityLabel,
        progressPercent: input.missionProgressPercent,
        loopState: missionLoopState,
        completed,
        reward: {
          available: rewardAvailable,
          xp: input.dailyMission?.xp_reward ?? 0,
          coins: input.dailyMission?.coin_reward ?? 0,
        },
      },
      progression: {
        learningPath: input.learningPath,
        hasJourneyNodes: input.hasJourneyNodes,
        loading: input.progressionLoading,
        error: input.progressionError,
        nextStepIdeal,
        recentProgressLabel,
      },
      axion: {
        stage: input.axionStage,
        behaviorState: axion.state,
        visualMoodState: axion.visualMoodState,
        idleMotion: axion.idleMotion,
        headline: axion.headline,
        message: axion.message,
        dialogueMessage: input.axionDialogueMessage,
        dialogueVisible: input.axionDialogueVisible,
        celebrating: input.axionCelebrating,
      },
      economy: {
        balanceCents: input.walletBalanceCents,
        activeGoalTitle: input.activeGoalTitle,
        activeGoalTargetLabel: input.activeGoalTargetLabel,
      },
      streak: {
        freezeUsedToday: input.streakFreezeUsedToday,
      },
      nextAction: {
        type: nextActionType,
        label: nextActionLabel,
        helperText: nextActionHelper,
      },
    };
  }, [
    axion.headline,
    axion.message,
    axion.idleMotion,
    axion.state,
    axion.visualMoodState,
    input.axionCelebrating,
    input.axionDialogueMessage,
    input.axionDialogueVisible,
    input.axionStage,
    input.childName,
    input.dailyMission,
    input.fallbackLevel,
    input.hasJourneyNodes,
    input.learningPath,
    input.learningLevel,
    input.logsTodayCount,
    input.missionsCompletedCount,
    input.offlineHours,
    input.loopBroken,
    input.usageFrequencyScore,
    input.activeGoalTargetLabel,
    input.activeGoalTitle,
    input.missionRewardClaimed,
    input.missionRarityLabel,
    input.missionSubtitle,
    input.missionProgressPercent,
    input.progressionError,
    input.progressionLoading,
    input.routineLogsCount,
    input.streakCount,
    input.streakFreezeUsedToday,
    input.walletBalanceCents,
    input.xpPercent,
    missionLoopState,
  ]);
}

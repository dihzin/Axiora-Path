import { useCallback, useEffect, useMemo, useRef } from "react";

import type { ActionFeedbackState } from "@/components/action-feedback";
import type { MissionLoopState } from "@/components/mission-card-v2";
import { useTheme } from "@/components/theme-provider";
import { playSound } from "@/lib/sound-manager";
import type { AprenderSubjectOption, RoutineTaskProgress, RoutineWeekLog } from "@/lib/api/client";
import type { Mood } from "@/lib/types/mood";

import { useAxionBehavior } from "@/hooks/use-axion-behavior";
import type { AxionCelebrationType } from "@/hooks/use-axion-domain";
import { useAxionDomain } from "@/hooks/use-axion-domain";
import { useChildSession } from "@/hooks/use-child-session";
import { useEconomyDomain } from "@/hooks/use-economy-domain";
import { useMissionDomain } from "@/hooks/use-mission-domain";
import { useProgressionDomain } from "@/hooks/use-progression-domain";
import { useRoutineDomain } from "@/hooks/use-routine-domain";
import { useUserDomain } from "@/hooks/use-user-domain";

// ── Public types ──────────────────────────────────────────────────────────────

export type HomeNextActionType = "mission" | "claim" | "progress";

export type HomeNextAction = {
  type: HomeNextActionType;
  label: string;
  helperText: string;
};

export type HomeState = {
  // Derived display state
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
    reward: { available: boolean; xp: number; coins: number };
  };
  progression: {
    learningPath: ReturnType<typeof useProgressionDomain>["learningPath"];
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
    saveBalanceCents: number;
    savePercent: number;
    activeGoalTitle: string;
    activeGoalTargetLabel: string;
    activeGoalTargetCents: number | null;
    activeGoalLocked: boolean;
  };
  streak: { freezeUsedToday: boolean };
  nextAction: HomeNextAction;

  // Session
  childId: number | null;
  childName: string;
  isSchoolTenant: boolean;
  childAvatarKey: string | null;
  avatarStage: number;
  soundEnabled: boolean;
  taskView: "list" | "journey";
  todayIso: string;

  // Level
  levelUpOverlayLevel: number | null;

  // Axion companion
  todayMood: ReturnType<typeof useAxionDomain>["todayMood"];
  moodError: string | null;
  moodFeedback: ActionFeedbackState;

  // Mission
  missionFeedback: ActionFeedbackState;
  missionCompleting: boolean;

  // Routine
  taskFeedback: Record<number, ActionFeedbackState>;
  markingTaskIds: number[];
  taskStatusById: Record<number, RoutineWeekLog["status"]>;
  taskProgressById: Record<number, RoutineTaskProgress>;
  logsTodayCount: number;
  todayStatusCounts: { approved: number; pending: number; rejected: number };
  groupedWeeklyLogs: Array<{
    title: string;
    status: RoutineWeekLog["status"];
    items: RoutineWeekLog[];
  }>;

  // Progression
  journeySubjects: AprenderSubjectOption[];
  selectedJourneySubjectId: number | null;

  // Actions
  onMarkTask: (taskId: number) => Promise<void>;
  completeMission: () => Promise<void>;
  claimReward: (emitReward: (xp: number, coins: number) => void) => void;
  onSelectMood: (mood: Mood) => Promise<boolean>;
  onToggleSound: () => string;
  onToggleTaskView: (next: "list" | "journey") => void;
  onChangeSubject: (id: number | null) => void;
  dismissLevelUpOverlay: () => void;
  dismissAxionDialogue: () => void;
  dismissDailyWelcome: () => void;
};

type UseHomeStateInput = {
  showToast: (message: string, type?: "success" | "error") => void;
};

// ── Compositor ─────────────────────────────────────────────────────────────────
// Hook ordering: session → axion → economy → user → mission → routine → progression
// This order ensures each hook's dependencies are available before it's called.

export function useHomeState({ showToast }: UseHomeStateInput): HomeState {
  const { theme } = useTheme();
  const showToastRef = useRef(showToast);
  useEffect(() => { showToastRef.current = showToast; }, [showToast]);

  // ── 1. Session (no cross-domain dependencies) ─────────────────────────────
  const session = useChildSession();

  // ── 2. Axion domain (needed by callbacks in user + economy) ──────────────
  const axionDomain = useAxionDomain({
    childId: session.childId,
    todayIso: session.todayIso,
    onFeedback: showToast,
  });

  // ── 3. Economy domain (needed by mission onCompleted) ────────────────────
  const economyDomain = useEconomyDomain({
    childId: session.childId,
    onGoalCompleted: useCallback(() => {
      axionDomain.triggerCelebration("goal_completed" as AxionCelebrationType);
    }, [axionDomain.triggerCelebration]),
    onGoalNear: useCallback(() => {
      void axionDomain.fetchCoachDialogue("goal_near");
    }, [axionDomain.fetchCoachDialogue]),
  });

  // ── 4. User domain (level + streak + polling) ────────────────────────────
  // Callbacks use axionDomain actions — declared here after axionDomain is ready

  const handleLevelUp = useCallback(
    (_newLevel: number) => {
      axionDomain.triggerCelebration("level_up");
      if (session.soundEnabled && session.childId !== null) {
        playSound("level_up", { childId: session.childId, theme });
      }
      void axionDomain.fetchCoachDialogue("level_up");
    },
    [axionDomain.triggerCelebration, axionDomain.fetchCoachDialogue, session.soundEnabled, session.childId, theme],
  );

  const handleStreakMilestone = useCallback(
    (count: number) => {
      if (session.soundEnabled && session.childId !== null) {
        playSound("streak_milestone", { childId: session.childId, theme });
      }
      if (count === 7) axionDomain.triggerCelebration("streak_7");
      else if (count === 30) axionDomain.triggerCelebration("streak_30");
      else void axionDomain.fetchCoachDialogue("streak_milestone");
    },
    [axionDomain.triggerCelebration, axionDomain.fetchCoachDialogue, session.soundEnabled, session.childId, theme],
  );

  const userDomain = useUserDomain({
    childId: session.childId,
    recentXpBonus: session.recentXpBonus,
    onLevelUp: handleLevelUp,
    onStreakMilestone: handleStreakMilestone,
  });

  // ── 5. Mission domain (needs streak from userDomain, refresh from economy+user) ──
  const onMissionCompleted = useCallback(
    async (_xp: number, _coins: number) => {
      await Promise.all([
        userDomain.refreshAfterMission(),
        economyDomain.refresh(),
      ]);
    },
    [userDomain.refreshAfterMission, economyDomain.refresh],
  );

  const missionDomain = useMissionDomain({
    childId: session.childId,
    todayIso: session.todayIso,
    streak: userDomain.streak,
    onCompleted: onMissionCompleted,
    onFeedback: showToast,
  });

  // ── 6. Routine domain (independent) ──────────────────────────────────────
  const routineDomain = useRoutineDomain({
    childId: session.childId,
    todayIso: session.todayIso,
    onFeedback: showToast,
  });

  // ── 7. Progression domain (independent) ──────────────────────────────────
  const progressionDomain = useProgressionDomain({ childId: session.childId });

  // ── First-login Axion dialogue ────────────────────────────────────────────
  useEffect(() => {
    if (session.childId === null || !session.showDailyWelcome) return;
    const key = `axiora_axion_dialogue_first_login_${session.childId}_${session.todayIso}`;
    if (localStorage.getItem(key) === "1") return;
    localStorage.setItem(key, "1");
    void axionDomain.fetchCoachDialogue("first_login");
  }, [session.childId, session.showDailyWelcome, session.todayIso, axionDomain.fetchCoachDialogue]);

  // ── Derived: mission loop state ───────────────────────────────────────────
  const missionLoopState: MissionLoopState = !missionDomain.currentMission
    ? "locked"
    : missionDomain.currentMission.status !== "completed"
      ? "active"
      : missionDomain.missionRewardClaimed
        ? "reward"
        : "completed";

  const missionCompleted = missionDomain.currentMission?.status === "completed";

  // ── Derived: mission progress % ───────────────────────────────────────────
  const missionProgressPercent =
    missionCompleted
      ? 100
      : routineDomain.tasks.length > 0
        ? Math.min(
            90,
            Math.round(
              (Object.keys(routineDomain.taskStatusById).length /
                Math.max(1, routineDomain.tasks.length)) *
                100,
            ),
          )
        : 10;

  // ── Axion behavior state ──────────────────────────────────────────────────
  const offlineHours =
    routineDomain.latestActivityTimestamp > 0
      ? (Date.now() - routineDomain.latestActivityTimestamp) / (1000 * 60 * 60)
      : 72;
  const missionsCompletedCount =
    routineDomain.routineLogs.filter((l) => l.status === "APPROVED").length +
    (missionCompleted ? 1 : 0);

  const axionBehavior = useAxionBehavior({
    childName: session.childName,
    usageFrequencyScore: Math.min(10, routineDomain.routineLogs.length),
    missionsCompletedCount,
    offlineHours,
    loopBroken: false,
  });

  // ── Derived: next action ──────────────────────────────────────────────────
  const hasMission = Boolean(missionDomain.currentMission);
  const streakCount = userDomain.streak?.current ?? 0;
  const isNewUser =
    routineDomain.routineLogs.length === 0 && streakCount === 0 && missionLoopState === "locked";

  const nextActionType: HomeNextActionType = hasMission
    ? !missionCompleted ? "mission" : "claim"
    : "progress";

  const nextActionLabel =
    nextActionType === "mission"
      ? missionLoopState === "active" ? "Continuar missão" : "Começar missão"
      : nextActionType === "claim"
        ? "Resgatar recompensa"
        : progressionDomain.hasJourneyNodes ? "Continuar jornada" : "Explorar jornada";

  const nextActionHelper =
    nextActionType === "mission"
      ? "Missão incompleta detectada. Prioridade total nela."
      : nextActionType === "claim"
        ? "Você concluiu a missão. Resgate a recompensa para liberar o próximo ciclo."
        : "Sem missão ativa. Próximo passo: explorar a jornada.";

  const nextStepIdeal =
    nextActionType === "mission"
      ? missionDomain.currentMission?.title?.trim() || "Concluir missão central"
      : hasMission
        ? "Resgatar recompensa da missão concluída."
        : progressionDomain.hasJourneyNodes
          ? "Avançar para o próximo node da jornada."
          : "Carregar jornada de aprendizado.";

  const recentProgressLabel =
    routineDomain.logsTodayCount > 0
      ? `${routineDomain.logsTodayCount} avanço${routineDomain.logsTodayCount > 1 ? "s" : ""} hoje`
      : "Nenhum avanço hoje ainda";

  // ── Stable display state (memoized to avoid cascading re-renders) ─────────
  const user = useMemo(
    () => ({
      name: session.childName,
      greeting: streakCount >= 5 ? "Pronto para evoluir hoje?" : "Vamos começar mais uma missão?",
      subtitle: session.childName
        ? `${session.childName}, seu progresso está em andamento.`
        : "Seu progresso está em andamento.",
      level: userDomain.learningLevel ?? userDomain.level?.level ?? 1,
      xpPercent: Math.max(0, Math.min(100, userDomain.xpBarPercent)),
      streak: streakCount,
      isNewUser,
    }),
    [session.childName, streakCount, userDomain.learningLevel, userDomain.level, userDomain.xpBarPercent, isNewUser],
  );

  const mission = useMemo(
    () => ({
      title: missionDomain.currentMission?.title ?? "Missão indisponível no momento",
      subtitle: missionDomain.missionSubtitle,
      rarityLabel: missionDomain.missionRarityLabel,
      progressPercent: missionProgressPercent,
      loopState: missionLoopState,
      completed: missionCompleted,
      reward: {
        available: missionCompleted && !missionDomain.missionRewardClaimed,
        xp: missionDomain.currentMission?.xp_reward ?? 0,
        coins: missionDomain.currentMission?.coin_reward ?? 0,
      },
    }),
    [missionDomain, missionProgressPercent, missionLoopState, missionCompleted],
  );

  const progression = useMemo(
    () => ({
      learningPath: progressionDomain.learningPath,
      hasJourneyNodes: progressionDomain.hasJourneyNodes,
      loading: progressionDomain.learningPathLoading,
      error: progressionDomain.learningPathError,
      nextStepIdeal,
      recentProgressLabel,
    }),
    [progressionDomain, nextStepIdeal, recentProgressLabel],
  );

  const axion = useMemo(
    () => ({
      stage: axionDomain.axionState?.stage ?? 1,
      behaviorState: axionBehavior.state,
      visualMoodState: axionBehavior.visualMoodState,
      idleMotion: axionBehavior.idleMotion,
      headline: axionBehavior.headline,
      message: axionBehavior.message,
      dialogueMessage: axionDomain.axionDialogue.message,
      dialogueVisible: axionDomain.axionDialogue.visible,
      celebrating: axionDomain.axionCelebration !== null,
    }),
    [axionDomain, axionBehavior],
  );

  // ── Actions ───────────────────────────────────────────────────────────────
  const onToggleSound = useCallback((): string => {
    const next = session.toggleSound();
    showToastRef.current(`Som ${next ? "ativado" : "desativado"}`, "success");
    return next ? "ativado" : "desativado";
  }, [session.toggleSound]);

  const onToggleTaskView = useCallback(
    (next: "list" | "journey") => {
      session.setTaskView(next);
      showToastRef.current(next === "list" ? "Modo lista ativo" : "Modo jornada ativo", "success");
    },
    [session.setTaskView],
  );

  const claimReward = useCallback(
    (emitReward: (xp: number, coins: number) => void) => {
      const xp = missionDomain.currentMission?.xp_reward ?? 0;
      const coins = missionDomain.currentMission?.coin_reward ?? 0;
      missionDomain.claimReward();
      emitReward(xp, coins);
      if (session.soundEnabled && session.childId !== null) {
        playSound("level_up", { childId: session.childId, theme });
      }
    },
    [missionDomain.currentMission, missionDomain.claimReward, session.soundEnabled, session.childId, theme],
  );

  // ── Final return ──────────────────────────────────────────────────────────
  return {
    // Derived buckets
    user,
    mission,
    progression,
    axion,
    economy: {
      balanceCents: economyDomain.walletBalanceCents,
      saveBalanceCents: economyDomain.saveBalanceCents,
      savePercent: economyDomain.savePercent,
      activeGoalTitle: economyDomain.activeGoalTitle,
      activeGoalTargetLabel: economyDomain.activeGoalTargetLabel,
      activeGoalTargetCents: economyDomain.activeGoal?.target_cents ?? null,
      activeGoalLocked: economyDomain.activeGoal?.is_locked ?? false,
    },
    streak: { freezeUsedToday: Boolean(userDomain.streak?.freeze_used_today) },
    nextAction: { type: nextActionType, label: nextActionLabel, helperText: nextActionHelper },

    // Session
    childId: session.childId,
    childName: session.childName,
    isSchoolTenant: session.isSchoolTenant,
    childAvatarKey: session.childAvatarKey,
    // userDomain.avatarStage defaults to 1 until getLevels responds; fall back to getMe's value
    avatarStage: userDomain.avatarStage !== 1 ? userDomain.avatarStage : session.initialAvatarStage,
    soundEnabled: session.soundEnabled,
    taskView: session.taskView,
    todayIso: session.todayIso,

    // Level
    levelUpOverlayLevel: userDomain.levelUpOverlayLevel,

    // Axion companion
    todayMood: axionDomain.todayMood,
    moodError: axionDomain.moodError,
    moodFeedback: axionDomain.moodFeedback,

    // Mission
    missionFeedback: missionDomain.missionFeedback,
    missionCompleting: missionDomain.missionCompleting,

    // Routine
    taskFeedback: routineDomain.taskFeedback,
    markingTaskIds: routineDomain.markingTaskIds,
    taskStatusById: routineDomain.taskStatusById,
    taskProgressById: routineDomain.taskProgressById,
    logsTodayCount: routineDomain.logsTodayCount,
    todayStatusCounts: routineDomain.todayStatusCounts,
    groupedWeeklyLogs: routineDomain.groupedWeeklyLogs,

    // Progression
    journeySubjects: progressionDomain.journeySubjects,
    selectedJourneySubjectId: progressionDomain.selectedJourneySubjectId,

    // Actions
    onMarkTask: routineDomain.onMarkTask,
    completeMission: missionDomain.completeMission,
    claimReward,
    onSelectMood: axionDomain.onSelectMood,
    onToggleSound,
    onToggleTaskView,
    onChangeSubject: progressionDomain.setSelectedSubjectId,
    dismissLevelUpOverlay: userDomain.dismissLevelUp,
    dismissAxionDialogue: axionDomain.dismissDialogue,
    dismissDailyWelcome: session.dismissDailyWelcome,
  };
}

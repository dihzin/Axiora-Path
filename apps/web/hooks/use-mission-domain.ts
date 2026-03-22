import { useCallback, useEffect, useRef, useState } from "react";

import type { ActionFeedbackState } from "@/components/action-feedback";
import {
  ApiError,
  completeDailyMission,
  getDailyMission,
  getApiErrorMessage,
  type DailyMissionResponse,
  type StreakResponse,
} from "@/lib/api/client";
import { enqueueDailyMissionComplete } from "@/lib/offline-queue";
import { useDailyEngagement } from "@/hooks/use-daily-engagement";

type FeedbackCallback = (message: string, type?: "success" | "error") => void;

type UseMissionDomainInput = {
  childId: number | null;
  todayIso: string;
  streak: StreakResponse | null;
  /** Called on successful completion (online or offline-queued) */
  onCompleted?: (xp: number, coins: number) => void;
  onFeedback?: FeedbackCallback;
};

export type MissionDomainState = {
  dailyMission: DailyMissionResponse | null;
  currentMission: DailyMissionResponse | null;
  missionRewardClaimed: boolean;
  missionCompleting: boolean;
  missionFeedback: ActionFeedbackState;
  missionLoadError: boolean;
  missionSubtitle: string;
  missionRarityLabel: string;
  /** Complete the active mission (handles online + offline) */
  completeMission: () => Promise<void>;
  /** Mark the reward as claimed (visual-only state flip) */
  claimReward: () => void;
};

function setTransientFeedback(
  setState: React.Dispatch<React.SetStateAction<ActionFeedbackState>>,
  timerRef: React.MutableRefObject<number | null>,
  state: Exclude<ActionFeedbackState, "loading">,
) {
  setState(state);
  if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  timerRef.current = window.setTimeout(() => setState("idle"), 650);
}

function missionRarityLabel(rarity: DailyMissionResponse["rarity"]): string {
  if (rarity === "epic") return "Épica";
  if (rarity === "special") return "Especial";
  return "Normal";
}

export function useMissionDomain({
  childId,
  todayIso,
  streak,
  onCompleted,
  onFeedback,
}: UseMissionDomainInput): MissionDomainState {
  const [dailyMission, setDailyMission] = useState<DailyMissionResponse | null>(null);
  const [missionRewardClaimed, setMissionRewardClaimed] = useState(false);
  const [missionCompleting, setMissionCompleting] = useState(false);
  const [missionFeedback, setMissionFeedback] = useState<ActionFeedbackState>("idle");
  const [missionLoadError, setMissionLoadError] = useState(false);

  const missionFeedbackTimerRef = useRef<number | null>(null);
  const missionResetSyncRef = useRef<string | null>(null);
  const onCompletedRef = useRef(onCompleted);
  const onFeedbackRef = useRef(onFeedback);
  useEffect(() => { onCompletedRef.current = onCompleted; }, [onCompleted]);
  useEffect(() => { onFeedbackRef.current = onFeedback; }, [onFeedback]);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (childId === null) return;
    getDailyMission(childId)
      .then((data) => {
        setDailyMission(data);
        setMissionLoadError(false);
      })
      .catch(() => {
        setDailyMission(null);
        setMissionLoadError(true);
      });
  }, [childId]);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (missionFeedbackTimerRef.current !== null) {
        window.clearTimeout(missionFeedbackTimerRef.current);
      }
    };
  }, []);

  const engagement = useDailyEngagement({
    childId,
    todayIso,
    streak,
    mission: dailyMission,
  });

  const currentMission = engagement.effectiveMission;

  // ── Reset sync: fetch new mission after a daily reset ────────────────────
  useEffect(() => {
    if (childId === null) return;
    if (!engagement.missionResetApplied) {
      missionResetSyncRef.current = null;
      return;
    }
    const syncKey = `${childId}-${todayIso}`;
    if (missionResetSyncRef.current === syncKey) return;
    missionResetSyncRef.current = syncKey;
    getDailyMission(childId)
      .then((next) => setDailyMission(next))
      .catch(() => {
        // Keep stale state until next navigation
      });
  }, [childId, engagement.missionResetApplied, todayIso]);

  // ── Reset reward-claimed flag when mission changes ────────────────────────
  useEffect(() => {
    if (!currentMission || currentMission.status !== "completed") {
      setMissionRewardClaimed(false);
    }
  }, [currentMission?.id, currentMission?.status]);

  // ── Derived labels ────────────────────────────────────────────────────────
  const missionSubtitle = currentMission
    ? "Complete a missão central para manter o ritmo e acelerar sua evolução."
    : engagement.missionResetApplied
      ? "Nova missão diária será liberada automaticamente."
      : missionLoadError
        ? "Não foi possível carregar a missão de hoje."
        : "Missão ainda não foi gerada para este perfil.";

  const rarityLabel = currentMission
    ? missionRarityLabel(currentMission.rarity)
    : "Sem missão";

  // ── Actions ───────────────────────────────────────────────────────────────
  const completeMission = useCallback(async () => {
    if (!currentMission || missionCompleting || currentMission.status === "completed") return;

    setMissionCompleting(true);
    setMissionFeedback("loading");

    const markDone = (xp: number, coins: number) => {
      setDailyMission((prev) => (prev ? { ...prev, status: "completed" } : prev));
      setMissionRewardClaimed(true);
      setTransientFeedback(setMissionFeedback, missionFeedbackTimerRef, "success");
      onCompletedRef.current?.(xp, coins);
    };

    if (!navigator.onLine) {
      await enqueueDailyMissionComplete({ mission_id: currentMission.id });
      markDone(currentMission.xp_reward, currentMission.coin_reward);
      onFeedbackRef.current?.(
        "Missão concluída offline. Vai sincronizar ao reconectar.",
        "success",
      );
      setMissionCompleting(false);
      return;
    }

    try {
      await completeDailyMission(currentMission.id);
      markDone(currentMission.xp_reward, currentMission.coin_reward);
      onFeedbackRef.current?.("Missão concluída!", "success");
    } catch (err) {
      if (!(err instanceof ApiError)) {
        await enqueueDailyMissionComplete({ mission_id: currentMission.id });
        markDone(currentMission.xp_reward, currentMission.coin_reward);
        onFeedbackRef.current?.(
          "Sem conexão. Missão enfileirada para sincronizar.",
          "success",
        );
      } else {
        setTransientFeedback(setMissionFeedback, missionFeedbackTimerRef, "error");
        onFeedbackRef.current?.(
          getApiErrorMessage(err, "Não foi possível concluir a missão."),
          "error",
        );
      }
    } finally {
      setMissionCompleting(false);
    }
  }, [currentMission, missionCompleting]);

  const claimReward = useCallback(() => {
    setMissionRewardClaimed(true);
    setTransientFeedback(setMissionFeedback, missionFeedbackTimerRef, "success");
    onFeedbackRef.current?.("Recompensa resgatada!", "success");
  }, []);

  return {
    dailyMission,
    currentMission,
    missionRewardClaimed,
    missionCompleting,
    missionFeedback,
    missionLoadError,
    missionSubtitle,
    missionRarityLabel: rarityLabel,
    completeMission,
    claimReward,
  };
}

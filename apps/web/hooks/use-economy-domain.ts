import { useCallback, useEffect, useRef, useState } from "react";

import {
  getGoals,
  getWalletSummary,
  type GoalOut,
  type WalletSummaryResponse,
} from "@/lib/api/client";

type UseEconomyDomainInput = {
  childId: number | null;
  /** Called once when the active goal transitions from locked → unlocked */
  onGoalCompleted?: () => void;
  /** Called once when save progress reaches 80–99% */
  onGoalNear?: () => void;
};

export type EconomyDomainState = {
  walletSummary: WalletSummaryResponse | null;
  goals: GoalOut[];
  activeGoal: GoalOut | null;
  walletBalanceCents: number;
  saveBalanceCents: number;
  savePercent: number;
  activeGoalTitle: string;
  activeGoalTargetLabel: string;
  /** Re-fetch wallet and goals — call after mission completion */
  refresh: () => Promise<void>;
};

function formatBRL(valueCents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valueCents / 100);
}

export function useEconomyDomain({
  childId,
  onGoalCompleted,
  onGoalNear,
}: UseEconomyDomainInput): EconomyDomainState {
  const [walletSummary, setWalletSummary] = useState<WalletSummaryResponse | null>(null);
  const [goals, setGoals] = useState<GoalOut[]>([]);

  const previousGoalRef = useRef<{ id: number; isLocked: boolean } | null>(null);
  const goalNearShownRef = useRef(false);
  const onGoalCompletedRef = useRef(onGoalCompleted);
  const onGoalNearRef = useRef(onGoalNear);
  useEffect(() => { onGoalCompletedRef.current = onGoalCompleted; }, [onGoalCompleted]);
  useEffect(() => { onGoalNearRef.current = onGoalNear; }, [onGoalNear]);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (childId === null) return;
    getWalletSummary(childId)
      .then((data) => setWalletSummary(data))
      .catch(() => setWalletSummary(null));
    getGoals(childId)
      .then((data) => setGoals(data))
      .catch(() => setGoals([]));
  }, [childId]);

  // ── Derived economy values ────────────────────────────────────────────────
  const activeGoal = goals[0] ?? null;
  const saveBalanceCents = walletSummary?.pot_balances_cents.SAVE ?? 0;
  const walletBalanceCents = walletSummary?.total_balance_cents ?? 0;
  const nextGoal = activeGoal?.target_cents ?? null;
  const savePercent = nextGoal && nextGoal > 0 ? (saveBalanceCents / nextGoal) * 100 : 0;
  const activeGoalTitle = activeGoal ? activeGoal.title : "Definir objetivo";
  const activeGoalTargetLabel = activeGoal ? formatBRL(activeGoal.target_cents) : "Sem objetivo ativo";

  // ── Goal near detection ───────────────────────────────────────────────────
  useEffect(() => {
    const nearCompletion = savePercent >= 80 && savePercent < 100;
    if (nearCompletion && !goalNearShownRef.current) {
      goalNearShownRef.current = true;
      onGoalNearRef.current?.();
      return;
    }
    if (!nearCompletion) goalNearShownRef.current = false;
  }, [savePercent]);

  // ── Goal completion detection (locked → unlocked) ────────────────────────
  useEffect(() => {
    if (!activeGoal) {
      previousGoalRef.current = null;
      return;
    }
    const previous = previousGoalRef.current;
    if (!previous) {
      previousGoalRef.current = { id: activeGoal.id, isLocked: activeGoal.is_locked };
      return;
    }
    if (previous.id !== activeGoal.id) {
      previousGoalRef.current = { id: activeGoal.id, isLocked: activeGoal.is_locked };
      return;
    }
    if (previous.isLocked && !activeGoal.is_locked) {
      onGoalCompletedRef.current?.();
    }
    previousGoalRef.current = { id: activeGoal.id, isLocked: activeGoal.is_locked };
  }, [activeGoal?.id, activeGoal?.is_locked]);

  // ── Refresh (called after mission completion) ─────────────────────────────
  const refresh = useCallback(async () => {
    if (childId === null) return;
    await Promise.all([
      getWalletSummary(childId).then((d) => setWalletSummary(d)).catch(() => null),
      getGoals(childId).then((d) => setGoals(d)).catch(() => null),
    ]);
  }, [childId]);

  return {
    walletSummary,
    goals,
    activeGoal,
    walletBalanceCents,
    saveBalanceCents,
    savePercent,
    activeGoalTitle,
    activeGoalTargetLabel,
    refresh,
  };
}

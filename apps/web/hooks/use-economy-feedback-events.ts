import { useCallback, useEffect, useRef, useState } from "react";

type RewardKind = "xp" | "coins";

export type EconomyFloatingEvent = {
  id: number;
  kind: RewardKind;
  label: string;
};

type UseEconomyFeedbackEventsInput = {
  xpPercent: number;
  balanceCents: number;
};

type UseEconomyFeedbackEventsResult = {
  coinRainKey: number;
  xpRiseKey: number;
  floatingEvents: EconomyFloatingEvent[];
  emitXp: (amount: number) => void;
  emitCoins: (amount: number) => void;
};

function parsePositiveInt(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

export function useEconomyFeedbackEvents({
  xpPercent,
  balanceCents,
}: UseEconomyFeedbackEventsInput): UseEconomyFeedbackEventsResult {
  const [coinRainKey, setCoinRainKey] = useState(0);
  const [xpRiseKey, setXpRiseKey] = useState(0);
  const [floatingEvents, setFloatingEvents] = useState<EconomyFloatingEvent[]>([]);
  const eventIdRef = useRef(1);
  const prevXpRef = useRef(Math.max(0, Math.round(xpPercent)));
  const prevBalanceRef = useRef(parsePositiveInt(balanceCents));

  const enqueueEvent = useCallback((kind: RewardKind, label: string) => {
    const id = eventIdRef.current++;
    setFloatingEvents((prev) => [...prev, { id, kind, label }]);
    window.setTimeout(() => {
      setFloatingEvents((prev) => prev.filter((item) => item.id !== id));
    }, 1300);
  }, []);

  const emitXp = useCallback(
    (amount: number) => {
      const safeAmount = parsePositiveInt(amount);
      if (safeAmount <= 0) return;
      setXpRiseKey((prev) => prev + 1);
      enqueueEvent("xp", `+${safeAmount} XP`);
    },
    [enqueueEvent],
  );

  const emitCoins = useCallback(
    (amount: number) => {
      const safeAmount = parsePositiveInt(amount);
      if (safeAmount <= 0) return;
      setCoinRainKey((prev) => prev + 1);
      enqueueEvent("coins", `+${safeAmount} moedas`);
    },
    [enqueueEvent],
  );

  useEffect(() => {
    const safeXp = Math.max(0, Math.round(xpPercent));
    const delta = safeXp - prevXpRef.current;
    if (delta > 0) {
      setXpRiseKey((prev) => prev + 1);
      enqueueEvent("xp", `+${delta} XP`);
    }
    prevXpRef.current = safeXp;
  }, [enqueueEvent, xpPercent]);

  useEffect(() => {
    const safeBalance = parsePositiveInt(balanceCents);
    const deltaCents = safeBalance - prevBalanceRef.current;
    if (deltaCents > 0) {
      setCoinRainKey((prev) => prev + 1);
      enqueueEvent("coins", "+ moedas");
    }
    prevBalanceRef.current = safeBalance;
  }, [balanceCents, enqueueEvent]);

  return {
    coinRainKey,
    xpRiseKey,
    floatingEvents,
    emitXp,
    emitCoins,
  };
}


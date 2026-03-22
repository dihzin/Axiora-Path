import { useCallback, useEffect, useRef, useState } from "react";

import {
  getAprenderLearningProfile,
  getLevels,
  getStreak,
  type LevelResponse,
  type StreakResponse,
} from "@/lib/api/client";

type UseUserDomainInput = {
  childId: number | null;
  recentXpBonus: number;
  /** Called when the polled level is higher than the last known level */
  onLevelUp?: (newLevel: number) => void;
  /** Called when streak reaches a milestone (7, 14, 21, 30) after a change */
  onStreakMilestone?: (count: number) => void;
};

export type UserDomainState = {
  level: LevelResponse | null;
  learningLevel: number | null;
  learningXpPercent: number | null;
  xpBarPercent: number;
  avatarStage: number;
  streak: StreakResponse | null;
  levelUpOverlayLevel: number | null;
  dismissLevelUp: () => void;
  /** Re-fetches levels, learning profile and streak — call after mission completion */
  refreshAfterMission: () => Promise<void>;
};

export function useUserDomain({
  childId,
  recentXpBonus,
  onLevelUp,
  onStreakMilestone,
}: UseUserDomainInput): UserDomainState {
  const [level, setLevel] = useState<LevelResponse | null>(null);
  const [learningLevel, setLearningLevel] = useState<number | null>(null);
  const [learningXpPercent, setLearningXpPercent] = useState<number | null>(null);
  const [xpBarPercent, setXpBarPercent] = useState(0);
  const [avatarStage, setAvatarStage] = useState(1);
  const [streak, setStreak] = useState<StreakResponse | null>(null);
  const [levelUpOverlayLevel, setLevelUpOverlayLevel] = useState<number | null>(null);

  const lastKnownLevelRef = useRef<number | null>(null);
  const lastKnownStreakRef = useRef<number | null>(null);
  // Callback refs so effects don't need callbacks in their dep arrays
  const onLevelUpRef = useRef(onLevelUp);
  const onStreakMilestoneRef = useRef(onStreakMilestone);
  useEffect(() => { onLevelUpRef.current = onLevelUp; }, [onLevelUp]);
  useEffect(() => { onStreakMilestoneRef.current = onStreakMilestone; }, [onStreakMilestone]);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (childId === null) return;

    getLevels(childId)
      .then((data) => {
        lastKnownLevelRef.current = data.level;
        setLevel(data);
        setAvatarStage(data.avatar_stage);
      })
      .catch(() => setLevel(null));

    getAprenderLearningProfile()
      .then((data) => {
        setLearningLevel(Math.max(1, Math.round(data.level ?? 1)));
        setLearningXpPercent(Math.max(0, Math.min(100, Math.round(data.xpLevelPercent ?? 0))));
      })
      .catch(() => {
        setLearningLevel(null);
        setLearningXpPercent(null);
      });

    getStreak(childId)
      .then((data) => {
        lastKnownStreakRef.current = data.current;
        setStreak(data);
      })
      .catch(() => setStreak(null));
  }, [childId]);

  // ── XP bar animation (80ms delay to let layout settle) ───────────────────
  useEffect(() => {
    const hasLearningSnapshot = learningXpPercent !== null;
    const base = hasLearningSnapshot
      ? learningXpPercent
      : (level?.level_progress_percent ?? 0);
    const bonus = hasLearningSnapshot ? 0 : recentXpBonus;
    const next = Math.max(0, Math.min(100, base + bonus));
    const timer = window.setTimeout(() => setXpBarPercent(next), 80);
    return () => window.clearTimeout(timer);
  }, [learningXpPercent, level?.level_progress_percent, level?.xp_total, recentXpBonus]);

  // ── Streak milestone detection ────────────────────────────────────────────
  useEffect(() => {
    if (streak === null) return;
    const current = streak.current;
    const previous = lastKnownStreakRef.current;
    if (
      previous !== null &&
      current > previous &&
      (current === 7 || current === 14 || current === 21 || current === 30)
    ) {
      onStreakMilestoneRef.current?.(current);
    }
    lastKnownStreakRef.current = current;
  }, [streak]);

  // ── Polling every 20s (paused when tab is hidden) ────────────────────────
  useEffect(() => {
    if (childId === null) return;

    const poll = async () => {
      if (document.hidden) return;
      try {
        const data = await getLevels(childId);
        const previous = lastKnownLevelRef.current;
        if (previous !== null && data.level > previous) {
          setLevelUpOverlayLevel(data.level);
          onLevelUpRef.current?.(data.level);
        }
        lastKnownLevelRef.current = data.level;
        setLevel(data);
        setAvatarStage(data.avatar_stage);

        const profile = await getAprenderLearningProfile();
        setLearningLevel(Math.max(1, Math.round(profile.level ?? 1)));
        setLearningXpPercent(Math.max(0, Math.min(100, Math.round(profile.xpLevelPercent ?? 0))));
      } catch {
        // Silent — polling errors are non-critical
      }
    };

    const interval = window.setInterval(() => void poll(), 20000);
    return () => window.clearInterval(interval);
  }, [childId]);

  const dismissLevelUp = useCallback(() => setLevelUpOverlayLevel(null), []);

  // Called by coordinator after mission completion for immediate refresh
  const refreshAfterMission = useCallback(async () => {
    if (childId === null) return;
    try {
      const [data, profile, streakData] = await Promise.all([
        getLevels(childId),
        getAprenderLearningProfile(),
        getStreak(childId),
      ]);

      const previous = lastKnownLevelRef.current;
      if (previous !== null && data.level > previous) {
        setLevelUpOverlayLevel(data.level);
        onLevelUpRef.current?.(data.level);
      }
      lastKnownLevelRef.current = data.level;
      setLevel(data);
      setAvatarStage(data.avatar_stage);

      setLearningLevel(Math.max(1, Math.round(profile.level ?? 1)));
      setLearningXpPercent(Math.max(0, Math.min(100, Math.round(profile.xpLevelPercent ?? 0))));

      const prevStreak = lastKnownStreakRef.current;
      const curr = streakData.current;
      if (
        prevStreak !== null &&
        curr > prevStreak &&
        (curr === 7 || curr === 14 || curr === 21 || curr === 30)
      ) {
        onStreakMilestoneRef.current?.(curr);
      }
      lastKnownStreakRef.current = curr;
      setStreak(streakData);
    } catch {
      // Silent — page will poll again in 20s
    }
  }, [childId]);

  return {
    level,
    learningLevel,
    learningXpPercent,
    xpBarPercent,
    avatarStage,
    streak,
    levelUpOverlayLevel,
    dismissLevelUp,
    refreshAfterMission,
  };
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { getMe } from "@/lib/api/client";
import { useTheme } from "@/components/theme-provider";
import { enforceProfileCompletionRedirect } from "@/lib/profile-completion-middleware";
import { readRecentLearningReward } from "@/lib/learning/reward-cache";
import {
  getSoundEnabled as getChildSoundEnabled,
  setSoundEnabled as setChildSoundEnabled,
} from "@/lib/sound-manager";

export type ChildSessionState = {
  childId: number | null;
  childName: string;
  isSchoolTenant: boolean;
  childAvatarKey: string | null;
  initialAvatarStage: number;
  soundEnabled: boolean;
  taskView: "list" | "journey";
  showDailyWelcome: boolean;
  todayIso: string;
  recentXpBonus: number;
  /** Returns the new sound state */
  toggleSound: () => boolean;
  setTaskView: (next: "list" | "journey") => void;
  dismissDailyWelcome: () => void;
};

export function useChildSession(): ChildSessionState {
  const router = useRouter();
  const { setTheme } = useTheme();

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const [childId, setChildId] = useState<number | null>(null);
  const [childName, setChildName] = useState("");
  const [isSchoolTenant, setIsSchoolTenant] = useState(false);
  const [childAvatarKey, setChildAvatarKey] = useState<string | null>(null);
  const [initialAvatarStage, setInitialAvatarStage] = useState(1);
  const [soundEnabled, setSoundEnabledState] = useState(true);
  const [taskView, setTaskViewState] = useState<"list" | "journey">("list");
  const [showDailyWelcome, setShowDailyWelcome] = useState(false);
  const [recentXpBonus, setRecentXpBonus] = useState(0);

  // Profile completion redirect (separate from bootstrap to run independently)
  useEffect(() => {
    const raw = sessionStorage.getItem("axiora_child_id");
    const parsed = raw ? Number(raw) : NaN;
    const cid = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    void enforceProfileCompletionRedirect({
      childId: cid,
      redirect: (target) => router.replace(target),
    });
  }, [router]);

  // Session bootstrap: reads storage, redirects if missing, loads profile
  useEffect(() => {
    const raw = sessionStorage.getItem("axiora_child_id");
    if (!raw) {
      router.push("/select-child");
      return;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      router.push("/select-child");
      return;
    }

    const rawName = sessionStorage.getItem("axiora_child_name");
    if (rawName) setChildName(rawName);
    setChildId(parsed);
    setRecentXpBonus(Math.max(0, readRecentLearningReward(parsed).xp));
    setSoundEnabledState(getChildSoundEnabled(parsed));

    const savedView = localStorage.getItem("axiora_task_view");
    if (savedView === "journey" || savedView === "list") setTaskViewState(savedView);

    setShowDailyWelcome(
      localStorage.getItem(`axiora_daily_welcome_${parsed}_${todayIso}`) !== "1",
    );

    getMe()
      .then((data) => {
        setIsSchoolTenant(data.membership.tenant_type === "SCHOOL");
        const child =
          data.child_profiles.find((c) => c.id === parsed) ?? data.child_profiles[0];
        if (!child) {
          router.push("/select-child");
          return;
        }
        if (child.id !== parsed) {
          sessionStorage.setItem("axiora_child_id", String(child.id));
          setChildId(child.id);
        }
        sessionStorage.setItem("axiora_child_name", child.display_name);
        setChildName(child.display_name);
        setTheme(child.theme);
        setInitialAvatarStage(child.avatar_stage);
        setChildAvatarKey(child.avatar_key ?? null);
      })
      .catch(() => {
        // Keep defaults — theme bootstraps on next full load
      });
  }, [router, setTheme, todayIso]);

  const toggleSound = useCallback((): boolean => {
    const next = !soundEnabled;
    setSoundEnabledState(next);
    if (childId !== null) setChildSoundEnabled(childId, next);
    return next;
  }, [childId, soundEnabled]);

  const setTaskView = useCallback((next: "list" | "journey") => {
    setTaskViewState(next);
    localStorage.setItem("axiora_task_view", next);
  }, []);

  const dismissDailyWelcome = useCallback(() => setShowDailyWelcome(false), []);

  return {
    childId,
    childName,
    isSchoolTenant,
    childAvatarKey,
    initialAvatarStage,
    soundEnabled,
    taskView,
    showDailyWelcome,
    todayIso,
    recentXpBonus,
    toggleSound,
    setTaskView,
    dismissDailyWelcome,
  };
}

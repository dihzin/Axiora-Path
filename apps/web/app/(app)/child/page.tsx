"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { ChildBottomNav } from "@/components/child-bottom-nav";
import { LevelUpOverlay } from "@/components/level-up-overlay";
import { ProgressHUD } from "@/components/progress-hud";
import type { MissionLoopState } from "@/components/mission-card-v2";
import { useChangePulse } from "@/hooks/use-change-pulse";
import { useEconomyFeedbackEvents } from "@/hooks/use-economy-feedback-events";
import { useHomeState } from "@/hooks/use-home-state";
import { useMeasuredViewportContainer } from "@/hooks/useMeasuredViewportContainer";
import { cn } from "@/lib/utils";

import { HomeContainer } from "@/components/home/home-container";
import { HeroSection } from "@/components/home/hero-section";
import { MissionSection } from "@/components/home/mission-section";
import { CompanionSection } from "@/components/home/companion-section";
import { EconomyHud } from "@/components/home/economy-hud";
import { JourneySection } from "@/components/home/journey-section";
import { PulseSection } from "@/components/home/pulse-section";

// ── Skeleton de loading ───────────────────────────────────────────────────────

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-pulse rounded-2xl bg-white/60 backdrop-blur",
        className,
      )}
    />
  );
}

function HomeSkeletonFallback() {
  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      {/* HUD */}
      <SkeletonBlock className="h-24 w-full" />
      {/* Hero */}
      <SkeletonBlock className="h-44 w-full" />
      {/* Grid */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          <SkeletonBlock className="h-32 w-full" />
          <SkeletonBlock className="h-24 w-full" />
        </div>
        <div className="flex flex-col gap-5">
          <SkeletonBlock className="h-20 w-full" />
          <SkeletonBlock className="h-36 w-full" />
          <SkeletonBlock className="h-16 w-full" />
        </div>
      </div>
    </div>
  );
}

// ── Page component ────────────────────────────────────────────────────────────

export default function ChildPage() {
  const router = useRouter();
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const missionSectionRef = useRef<HTMLElement | null>(null);

  // ── Visual-only state ─────────────────────────────────────────────────────
  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    if (type === "error") {
      toast.error(message);
    } else {
      toast.success(message);
    }
  }, []);

  // ── Viewport measurement ──────────────────────────────────────────────────
  const { width: layoutWidth, height: layoutHeight } = useMeasuredViewportContainer(layoutRef, {
    initialWidth: 1366,
    initialHeight: 768,
    minWidth: 320,
    minHeight: 1,
  });
  const [viewportHeight, setViewportHeight] = useState(768);
  const [viewportWidth, setViewportWidth] = useState(1366);
  useEffect(() => {
    const onResize = () => {
      setViewportHeight(window.innerHeight || 768);
      setViewportWidth(window.innerWidth || 1366);
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ── Domain state (single call) ────────────────────────────────────────────
  const home = useHomeState({ showToast });

  // ── Economy animations ────────────────────────────────────────────────────
  const economyEvents = useEconomyFeedbackEvents({
    xpPercent: home.user.xpPercent,
    balanceCents: home.economy.balanceCents,
  });

  // ── Visual animation helpers ──────────────────────────────────────────────
  const heroXpPulsing = useChangePulse(Math.round(home.user.xpPercent));

  // ── Layout scaling ────────────────────────────────────────────────────────
  const effectiveViewportHeight = Math.min(layoutHeight, viewportHeight);
  const effectiveViewportWidth = Math.min(layoutWidth, viewportWidth);
  const shouldAutoFitDesktop = effectiveViewportWidth >= 1024;
  const desktopScale = (() => {
    if (!shouldAutoFitDesktop) return 1;
    const widthScale = Math.min(1, effectiveViewportWidth / 1720);
    const heightScale = Math.min(1, Math.max(0.74, (effectiveViewportHeight - 22) / 980));
    return Math.max(0.74, Math.min(widthScale, heightScale));
  })();
  const denseDesktop = shouldAutoFitDesktop && (desktopScale < 0.93 || effectiveViewportWidth <= 1600 || effectiveViewportHeight <= 980);
  const ultraDenseDesktop = denseDesktop && (desktopScale < 0.86 || effectiveViewportHeight <= 900);

  // ── Page-level action handlers ────────────────────────────────────────────
  const onMissionCardAction = useCallback(
    async (state: MissionLoopState) => {
      if (state === "active") {
        await home.completeMission();
        economyEvents.emitXp(home.mission.reward.xp);
        economyEvents.emitCoins(home.mission.reward.coins);
        return;
      }
      if (state === "completed") {
        home.claimReward((xp, coins) => {
          economyEvents.emitXp(xp);
          economyEvents.emitCoins(coins);
        });
      }
    },
    [home, economyEvents],
  );

  const onPrimaryHomeAction = useCallback(() => {
    if (home.nextAction.type === "progress") {
      router.push("/child/aprender");
      return;
    }
    if (home.nextAction.type === "claim") {
      void onMissionCardAction("completed");
      return;
    }
    if (home.nextAction.type === "mission") {
      missionSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [home.nextAction.type, onMissionCardAction, router]);

  // ── Render ────────────────────────────────────────────────────────────────
  const isLoading = home.childId === null;

  return (
    <div ref={layoutRef} className="relative h-screen overflow-x-hidden">
      {isLoading ? <HomeSkeletonFallback /> : null}

      {home.levelUpOverlayLevel !== null ? (
        <LevelUpOverlay
          level={home.levelUpOverlayLevel}
          onDismiss={home.dismissLevelUpOverlay}
        />
      ) : null}

      <div className={cn(isLoading && "invisible")}>
      <HomeContainer
        density={denseDesktop ? "dense" : "regular"}
        contentScale={desktopScale}
        ultraDense={ultraDenseDesktop}
      >
        {/* ── Progress HUD ─────────────────────────────────────────────── */}
        <ProgressHUD
          level={home.user.level}
          xpPercent={home.user.xpPercent}
          nextObjective={home.progression.nextStepIdeal}
          recentProgressLabel={home.progression.recentProgressLabel}
          levelUpSignal={home.levelUpOverlayLevel}
          className={cn(ultraDenseDesktop && "lg:!p-2.5")}
        />

        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <HeroSection
          identity={{
            name: home.childName,
            greeting: home.user.greeting,
            subtitle: home.user.subtitle,
            avatarKey: home.childAvatarKey,
            avatarStage: home.avatarStage,
          }}
          stats={{
            level: home.user.level,
            xpPercent: home.user.xpPercent,
            xpPulsing: heroXpPulsing,
            streak: home.user.streak,
            balanceCents: home.economy.balanceCents,
            isSchoolTenant: home.isSchoolTenant,
          }}
          nextAction={home.nextAction}
          nextStepHint={home.progression.nextStepIdeal}
          soundEnabled={home.soundEnabled}
          onPrimaryAction={onPrimaryHomeAction}
          onToggleSound={home.onToggleSound}
          onParentMode={() => router.push("/parent-pin")}
        />

        {/* ── Mission + Companion | Economy + Journey + Pulse grid ─────── */}
        <section
          className={cn(
            "grid items-start lg:flex-1 lg:min-h-0",
            ultraDenseDesktop ? "gap-3" : denseDesktop ? "gap-4" : "gap-5",
            home.isSchoolTenant
              ? "xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]"
              : "lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]",
          )}
        >
          {/* Left column */}
          <div className={cn("flex flex-col", ultraDenseDesktop ? "gap-3" : denseDesktop ? "gap-4" : "gap-5")}>
            <MissionSection
              mission={home.mission}
              missionCompleting={home.missionCompleting}
              soundEnabled={home.soundEnabled}
              childId={home.childId}
              sectionRef={missionSectionRef}
              onAction={onMissionCardAction}
            />
            <CompanionSection
              companion={home.axion}
              mood={{
                todayMood: home.todayMood,
                moodError: home.moodError,
                moodFeedback: home.moodFeedback,
                isSchoolTenant: home.isSchoolTenant,
              }}
              onDismissDialogue={home.dismissAxionDialogue}
              onSelectMood={home.onSelectMood}
            />
          </div>

          {/* Right column */}
          <div className={cn("flex h-full flex-col", ultraDenseDesktop ? "gap-3" : denseDesktop ? "gap-4" : "gap-5")}>
            <EconomyHud
              balance={{
                balanceCents: home.economy.balanceCents,
                saveBalanceCents: home.economy.saveBalanceCents,
                savePercent: home.economy.savePercent,
              }}
              goal={{
                title: home.economy.activeGoalTitle,
                targetLabel: home.economy.activeGoalTargetLabel,
                targetCents: home.economy.activeGoalTargetCents,
                locked: home.economy.activeGoalLocked,
              }}
            />
            <JourneySection
              progression={home.progression}
              subjects={{
                options: home.journeySubjects.map((s) => ({ id: s.id, name: s.name })),
                selectedId: home.selectedJourneySubjectId,
              }}
              dense={denseDesktop}
              ultraDense={ultraDenseDesktop}
              onChangeSubject={home.onChangeSubject}
              onContinueJourney={() => router.push("/child/aprender")}
            />
            <PulseSection
              stats={{
                logsTodayCount: home.logsTodayCount,
                missionProgressPercent: home.mission.progressPercent,
                todayStatusCounts: home.todayStatusCounts,
                activeGoalTitle: home.economy.activeGoalTitle,
                activeGoalTargetLabel: home.economy.activeGoalTargetLabel,
              }}
            />
          </div>
        </section>

        <ChildBottomNav />
      </HomeContainer>
      </div>
    </div>
  );
}

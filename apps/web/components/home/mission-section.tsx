"use client";

import type React from "react";
import { motion } from "framer-motion";

import { MissionCardV2, type MissionLoopState } from "@/components/mission-card-v2";
import { playSound } from "@/lib/sound-manager";
import { useTheme } from "@/components/theme-provider";

type MissionSectionProps = {
  mission: {
    title: string;
    subtitle: string;
    rarityLabel: string;
    progressPercent: number;
    loopState: MissionLoopState;
    reward: { xp: number; coins: number };
  };
  missionCompleting: boolean;
  soundEnabled: boolean;
  childId: number | null;
  sectionRef: React.RefObject<HTMLElement | null>;
  onAction: (state: MissionLoopState) => Promise<void>;
};

// Framer-motion boxShadow por estado — breathing no active, flash no completed
// Valores calibrados para light bg (#f8fafc): glow quente e suave
const ringVariants = {
  active: {
    boxShadow: [
      "0 0 0 1.5px rgba(251,146,60,0.32), 0 8px 28px rgba(251,146,60,0.16), 0 24px 44px rgba(0,0,0,0.06)",
      "0 0 0 2.5px rgba(251,146,60,0.52), 0 12px 38px rgba(251,146,60,0.28), 0 24px 44px rgba(0,0,0,0.08)",
      "0 0 0 1.5px rgba(251,146,60,0.32), 0 8px 28px rgba(251,146,60,0.16), 0 24px 44px rgba(0,0,0,0.06)",
    ],
  },
  completed: {
    boxShadow: "0 0 0 2px rgba(14,143,98,0.40), 0 8px 28px rgba(14,143,98,0.18), 0 20px 40px rgba(0,0,0,0.06)",
  },
  idle: {
    boxShadow: "0 0 0 1px rgba(148,163,184,0.22), 0 4px 16px rgba(0,0,0,0.05), 0 16px 32px rgba(0,0,0,0.04)",
  },
};

export function MissionSection({
  mission,
  missionCompleting,
  soundEnabled,
  childId,
  sectionRef,
  onAction,
}: MissionSectionProps) {
  const { theme } = useTheme();

  const isActive = mission.loopState === "active";
  const isCompleted = mission.loopState === "completed";

  const variant = isActive ? "active" : isCompleted ? "completed" : "idle";

  return (
    <div className="relative">
      {/* Halo quente — atmosphere leve no active state */}
      {isActive && (
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-8 rounded-3xl"
          style={{
            background:
              "radial-gradient(ellipse at 50% 55%, rgba(251,146,60,0.14) 0%, rgba(253,186,116,0.06) 50%, transparent 72%)",
            filter: "blur(20px)",
          }}
        />
      )}
    <motion.section
      ref={sectionRef as React.RefObject<HTMLElement>}
      className="relative rounded-2xl"
      animate={variant}
      variants={ringVariants}
      transition={
        isActive
          ? { duration: 2.6, ease: "easeInOut", repeat: Infinity }
          : { duration: 0.5, ease: "easeOut" }
      }
    >
      <MissionCardV2
        state={mission.loopState}
        title={mission.title}
        subtitle={mission.subtitle}
        progress={mission.progressPercent}
        xpReward={mission.reward.xp}
        coinReward={mission.reward.coins}
        rarityLabel={mission.rarityLabel}
        loading={missionCompleting}
        disabled={mission.loopState === "locked"}
        soundEnabled={soundEnabled}
        onPlayRewardSound={() => {
          if (childId !== null) {
            playSound("level_up", { childId, theme });
          }
        }}
        onAction={(state) => void onAction(state)}
      />
    </motion.section>
    </div>
  );
}

"use client";

import { AxionCompanion } from "@/components/axion-companion";
import type { ActionFeedbackState } from "@/components/action-feedback";
import type { Mood } from "@/lib/types/mood";
import type { useAxionBehavior } from "@/hooks/use-axion-behavior";

type CompanionSectionProps = {
  companion: {
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
  mood: {
    todayMood: Mood | null;
    moodError: string | null;
    moodFeedback: ActionFeedbackState;
    isSchoolTenant: boolean;
  };
  onDismissDialogue: () => void;
  onSelectMood: (mood: Mood) => Promise<boolean>;
};

export function CompanionSection({
  companion,
  mood,
  onDismissDialogue,
  onSelectMood,
}: CompanionSectionProps) {
  return (
    // Wrapper com hover lift suave — Axion "se aproxima" no hover
    <div className="relative transition-transform duration-300 ease-out hover:-translate-y-0.5">
      {/* Aura luminosa atrás do Axion — presença suave e convidativa */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-4 -z-10 rounded-3xl"
        style={{
          background:
            "radial-gradient(ellipse at 50% 65%, rgba(56,189,248,0.10) 0%, rgba(251,146,60,0.07) 45%, transparent 70%)",
          filter: "blur(18px)",
        }}
      />
      <AxionCompanion
        stage={companion.stage}
        visualMoodState={companion.visualMoodState}
        behaviorState={companion.behaviorState}
        idleMotion={companion.idleMotion}
        headline={companion.headline}
        message={companion.message}
        dialogueMessage={companion.dialogueMessage}
        dialogueVisible={companion.dialogueVisible}
        todayMood={mood.todayMood}
        moodError={mood.moodError}
        moodFeedback={mood.moodFeedback}
        reducedMotion={mood.isSchoolTenant}
        celebrating={companion.celebrating}
        compact
        onDismissDialogue={onDismissDialogue}
        onChangeMood={(m) => void onSelectMood(m)}
      />
    </div>
  );
}

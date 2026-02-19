"use client";

import { AxionMascot } from "@/components/axion-mascot";
import type { Mood } from "@/lib/types/mood";

type AxionCharacterProps = {
  stage: number;
  moodState: string;
  celebrating?: boolean;
  reducedMotion?: boolean;
};

function normalizeMood(moodState: string): string {
  return moodState.toUpperCase();
}

function glowClassByMood(moodState: string): string {
  const mood = normalizeMood(moodState);
  if (mood === "CELEBRATING") return "axion-glow-celebrating";
  if (mood === "EXCITED") return "axion-glow-excited";
  if (mood === "PROUD") return "axion-glow-proud";
  if (mood === "CONCERNED") return "axion-glow-concerned";
  return "axion-glow-neutral";
}

function scaleClassByStage(stage: number): string {
  if (stage >= 3) return "axion-stage-3";
  if (stage === 2) return "axion-stage-2";
  return "axion-stage-1";
}

function mascotMoodByState(moodState: string): Mood {
  const mood = normalizeMood(moodState);
  if (mood === "ANGRY") return "angry";
  if (mood === "TIRED") return "tired";
  if (mood === "SAD" || mood === "CONCERNED") return "sad";
  if (mood === "CELEBRATING" || mood === "EXCITED" || mood === "PROUD" || mood === "HAPPY") return "happy";
  return "neutral";
}

function mascotSizeByStage(stage: number): number {
  if (stage >= 3) return 168;
  if (stage === 2) return 156;
  return 146;
}

export function AxionCharacter({ stage, moodState, celebrating = false, reducedMotion = false }: AxionCharacterProps) {
  const mood = mascotMoodByState(moodState);
  return (
    <div
      className={`relative mx-auto flex items-center justify-center ${scaleClassByStage(stage)} ${reducedMotion ? "" : "axion-float"} ${celebrating && !reducedMotion ? "axion-celebrate" : ""}`}
    >
      <div className={`${reducedMotion ? "axion-glow-static" : "axion-glow"} ${glowClassByMood(moodState)} absolute inset-0 rounded-full`} />
      <AxionMascot mood={mood} size={mascotSizeByStage(stage)} animated={!reducedMotion} className="relative" />
    </div>
  );
}

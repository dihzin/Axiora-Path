"use client";

import { motion } from "framer-motion";

import type { ActionFeedbackState } from "@/components/action-feedback";
import { AxionCharacter } from "@/components/axion-character";
import { AxionDialogue } from "@/components/axion-dialogue";
import { MoodSelector } from "@/components/axiora/MoodSelector";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Mood } from "@/lib/types/mood";
import type { AxionBehaviorState } from "@/hooks/use-axion-behavior";

type AxionCompanionProps = {
  stage: number;
  visualMoodState: string;
  behaviorState: AxionBehaviorState;
  idleMotion: "calm" | "active" | "energetic";
  headline: string;
  message: string;
  dialogueMessage: string;
  dialogueVisible: boolean;
  todayMood: Mood | null;
  moodError: string | null;
  moodFeedback: ActionFeedbackState;
  reducedMotion?: boolean;
  celebrating?: boolean;
  compact?: boolean;
  onDismissDialogue: () => void;
  onChangeMood: (mood: Mood) => void;
};

function behaviorBadgeLabel(state: AxionBehaviorState): string {
  if (state === "on_fire") return "On Fire";
  if (state === "focused") return "Focado";
  if (state === "warming_up") return "Aquecendo";
  return "Inativo";
}

export function AxionCompanion({
  stage,
  visualMoodState,
  behaviorState,
  idleMotion,
  headline,
  message,
  dialogueMessage,
  dialogueVisible,
  todayMood,
  moodError,
  moodFeedback,
  reducedMotion = false,
  celebrating = false,
  compact = false,
  onDismissDialogue,
  onChangeMood,
}: AxionCompanionProps) {
  const idleAnimation = reducedMotion
    ? { y: 0 }
    : idleMotion === "energetic"
      ? { y: [0, -5, 0] }
      : idleMotion === "active"
        ? { y: [0, -3, 0] }
        : { y: [0, -1.5, 0] };
  const idleDuration = idleMotion === "energetic" ? 1.8 : idleMotion === "active" ? 2.6 : 3.4;

  return (
    <Card variant="subtle" className="axiora-surface-glass relative overflow-hidden rounded-2xl">
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0",
          behaviorState === "on_fire" && "bg-[radial-gradient(circle_at_20%_14%,rgba(251,146,60,0.22),rgba(251,146,60,0)_58%)]",
          behaviorState === "focused" && "bg-[radial-gradient(circle_at_18%_14%,rgba(56,189,248,0.14),rgba(56,189,248,0)_58%)]",
          behaviorState === "warming_up" && "bg-[radial-gradient(circle_at_18%_14%,rgba(74,222,128,0.14),rgba(74,222,128,0)_58%)]",
          behaviorState === "inactive" && "bg-[radial-gradient(circle_at_18%_14%,rgba(148,163,184,0.10),rgba(148,163,184,0)_58%)]",
        )}
      />
      <CardHeader className={cn("relative z-[1]", compact ? "pb-1.5" : "pb-2")}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className={cn("axiora-title font-extrabold", compact ? "text-base" : "text-lg")}>Axion Companion</CardTitle>
            <p className={cn("axiora-subtitle", compact ? "text-xs" : "text-sm")}>Mentor + companheiro da sua missão</p>
          </div>
          <span className="rounded-full border border-[#E5E7EB] bg-[#F8FAFC] px-2 py-0.5 text-[11px] font-black uppercase tracking-[0.08em] text-[#64748B]">
            {behaviorBadgeLabel(behaviorState)}
          </span>
        </div>
      </CardHeader>
      <CardContent className={cn("relative z-[1]", compact ? "space-y-2" : "space-y-3")}>
        {compact ? (
          <div className="grid gap-2 md:grid-cols-[auto_minmax(0,1fr)] md:items-center">
            <motion.div
              initial={false}
              animate={idleAnimation}
              transition={reducedMotion ? undefined : { duration: idleDuration, repeat: Infinity, ease: "easeInOut" }}
              className="mx-auto w-fit rounded-full border border-[#E5E7EB] bg-[radial-gradient(circle_at_50%_35%,rgba(251,146,60,0.10),rgba(30,42,56,0.02)_70%)] p-1.5"
            >
              <AxionCharacter stage={stage} moodState={visualMoodState} celebrating={celebrating} reducedMotion={reducedMotion} />
            </motion.div>
            <div className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-2.5">
              <p className="axiora-title text-[15px] font-bold">{headline}</p>
              <p className="axiora-subtitle mt-1 text-[13px]">{message}</p>
            </div>
          </div>
        ) : (
          <>
            <motion.div
              initial={false}
              animate={idleAnimation}
              transition={reducedMotion ? undefined : { duration: idleDuration, repeat: Infinity, ease: "easeInOut" }}
              className="mx-auto w-fit rounded-full border border-[#E5E7EB] bg-[radial-gradient(circle_at_50%_35%,rgba(251,146,60,0.10),rgba(30,42,56,0.02)_70%)] p-2.5"
            >
              <AxionCharacter stage={stage} moodState={visualMoodState} celebrating={celebrating} reducedMotion={reducedMotion} />
            </motion.div>
            <div className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-3">
              <p className="axiora-title text-base font-bold">{headline}</p>
              <p className="axiora-subtitle mt-1 text-sm">{message}</p>
            </div>
          </>
        )}

        <AxionDialogue message={dialogueMessage} visible={dialogueVisible} onDismiss={onDismissDialogue} reducedMotion={reducedMotion} />

        {compact ? (
          <details className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-2.5">
            <summary className="axiora-subtitle cursor-pointer list-none text-[11px] font-black uppercase tracking-[0.08em]">
              Humor rápido
            </summary>
            <div className="mt-2 space-y-2">
              <MoodSelector value={todayMood ?? undefined} onChange={onChangeMood} />
              {moodFeedback === "loading" ? <p className="text-xs text-[#64748B]">Salvando humor...</p> : null}
              {moodFeedback === "success" ? <p className="text-xs text-[#166534]">Humor salvo!</p> : null}
              {moodFeedback === "error" ? <p className="text-xs text-destructive">Não foi possível salvar.</p> : null}
              {moodError ? <p className="text-xs text-destructive">{moodError}</p> : null}
            </div>
          </details>
        ) : (
          <div className="space-y-2 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-3">
            <p className="axiora-subtitle text-[11px] font-black uppercase tracking-[0.08em]">Humor rápido</p>
            <MoodSelector value={todayMood ?? undefined} onChange={onChangeMood} />
            {moodFeedback === "loading" ? <p className="text-xs text-[#64748B]">Salvando humor...</p> : null}
            {moodFeedback === "success" ? <p className="text-xs text-[#166534]">Humor salvo!</p> : null}
            {moodFeedback === "error" ? <p className="text-xs text-destructive">Não foi possível salvar.</p> : null}
            {moodError ? <p className="text-xs text-destructive">{moodError}</p> : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

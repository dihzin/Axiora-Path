"use client";

import { JourneyPreview } from "@/components/trail/journey-preview";
import { cn } from "@/lib/utils";
import type { LearningPathResponse } from "@/lib/api/client";

type JourneySectionProps = {
  progression: {
    learningPath: LearningPathResponse | null;
    loading: boolean;
    error: string | null;
  };
  subjects: {
    options: Array<{ id: number; name: string }>;
    selectedId: number | null;
  };
  dense: boolean;
  ultraDense: boolean;
  onChangeSubject: (id: number | null) => void;
  onContinueJourney: () => void;
};

export function JourneySection({
  progression,
  subjects,
  dense,
  ultraDense,
  onChangeSubject,
  onContinueJourney,
}: JourneySectionProps) {
  // [&_button.axiora-control-btn--orange] reduz o "Continuar jornada" para não concorrer com o CTA principal
  return (
    <div className="rounded-2xl border border-white/50 bg-white/60 px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.90),0_4px_20px_rgba(0,0,0,0.05)] backdrop-blur">
      <div className="mb-1 flex items-baseline gap-2">
        <p className="axiora-title text-[16px] font-extrabold">Jornada</p>
        <p className="axiora-subtitle text-[11px] opacity-50">prévia da trilha</p>
      </div>
      <div className={cn(ultraDense ? "pt-1.5" : dense ? "pt-2" : "pt-2.5")}>
        <JourneyPreview
          learningPath={progression.learningPath}
          subjectOptions={subjects.options}
          selectedSubjectId={subjects.selectedId}
          onChangeSubject={onChangeSubject}
          loading={progression.loading}
          error={progression.error}
          onContinueJourney={onContinueJourney}
        />
      </div>
    </div>
  );
}

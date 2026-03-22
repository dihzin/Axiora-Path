import { useEffect, useState } from "react";

import {
  getAprenderSubjects,
  getLearningPath,
  type AprenderSubjectOption,
  type LearningPathResponse,
} from "@/lib/api/client";

type UseProgressionDomainInput = {
  childId: number | null;
};

export type ProgressionDomainState = {
  journeySubjects: AprenderSubjectOption[];
  selectedJourneySubjectId: number | null;
  learningPath: LearningPathResponse | null;
  learningPathLoading: boolean;
  learningPathError: string | null;
  hasJourneyNodes: boolean;
  setSelectedSubjectId: (id: number | null) => void;
};

export function useProgressionDomain({
  childId,
}: UseProgressionDomainInput): ProgressionDomainState {
  const [journeySubjects, setJourneySubjects] = useState<AprenderSubjectOption[]>([]);
  const [selectedJourneySubjectId, setSelectedJourneySubjectId] = useState<number | null>(null);
  const [learningPath, setLearningPath] = useState<LearningPathResponse | null>(null);
  const [learningPathLoading, setLearningPathLoading] = useState(false);
  const [learningPathError, setLearningPathError] = useState<string | null>(null);

  // ── Load subjects when childId is available ───────────────────────────────
  useEffect(() => {
    if (childId === null) return;
    let cancelled = false;
    getAprenderSubjects({ childId })
      .then((subjects) => {
        if (cancelled) return;
        const ordered = [...subjects].sort((a, b) => a.order - b.order);
        setJourneySubjects(ordered);
        if (ordered.length === 0) {
          setSelectedJourneySubjectId(null);
          return;
        }
        setSelectedJourneySubjectId((prev) => {
          if (prev !== null && ordered.some((s) => s.id === prev)) return prev;
          return ordered[0].id;
        });
      })
      .catch(() => {
        if (cancelled) return;
        setJourneySubjects([]);
        setSelectedJourneySubjectId(null);
      });
    return () => { cancelled = true; };
  }, [childId]);

  // ── Load learning path whenever childId or selected subject changes ───────
  useEffect(() => {
    if (childId === null) return;
    let cancelled = false;
    setLearningPathLoading(true);
    setLearningPathError(null);
    getLearningPath(selectedJourneySubjectId ?? undefined, childId)
      .then((data) => {
        if (cancelled) return;
        setLearningPath(data);
      })
      .catch(() => {
        if (cancelled) return;
        setLearningPath(null);
        setLearningPathError("Não foi possível carregar sua trilha agora.");
      })
      .finally(() => {
        if (!cancelled) setLearningPathLoading(false);
      });
    return () => { cancelled = true; };
  }, [childId, selectedJourneySubjectId]);

  const hasJourneyNodes = (learningPath?.units ?? []).some((u) => u.nodes.length > 0);

  return {
    journeySubjects,
    selectedJourneySubjectId,
    learningPath,
    learningPathLoading,
    learningPathError,
    hasJourneyNodes,
    setSelectedSubjectId: setSelectedJourneySubjectId,
  };
}

"use client";

import { startTransition, useEffect, useMemo, useRef, useState } from "react";

import {
  completeLearnLesson,
  getLearnNext,
  getLearnSkills,
  getLearnSubjects,
  startLearnLesson,
  type AprenderSubjectOption,
  type LearnLessonResponse,
  type LearnRecommendation,
  type LearnSkillGraphEntry,
  type LearningPathResponse,
  type LearningPathUnit,
} from "@/lib/api/client";

type UseLearningStateOptions = {
  initialSubjectId?: number | null;
};

type BackendSubjectOption = AprenderSubjectOption & {
  slug: string;
};

type CompleteProgressInput = {
  subject: string;
  skill: string;
  lesson: string;
  score: number;
  stars?: number;
  timeSpent?: number;
  mastery?: number;
  confidence?: number;
  velocity?: number;
};

type LearningState = {
  subjects: AprenderSubjectOption[];
  selectedSubject: BackendSubjectOption | null;
  setSelectedSubjectId: (subjectId: number) => void;
  skills: string[];
  skillGraph: LearnSkillGraphEntry[];
  path: LearningPathResponse | null;
  currentLesson: LearnLessonResponse | null;
  nextRecommendation: LearnRecommendation | null;
  lessonSkillMap: Record<number, string>;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  startLesson: (skill?: string) => Promise<LearnLessonResponse | null>;
  updateProgress: (input: CompleteProgressInput) => Promise<LearnLessonResponse | null>;
};

function stableId(value: string): number {
  // djb2 hash — position-sensitive, so anagrams produce different IDs
  let hash = 5381;
  const str = String(value || "");
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xffffffff;
  }
  return Math.abs(hash) || 1;
}

function titleize(value: string): string {
  return String(value || "")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildSubjectOptions(subjects: string[]): BackendSubjectOption[] {
  return subjects.map((subject, index) => ({
    id: stableId(subject),
    slug: subject,
    name: titleize(subject),
    ageGroup: "9-12",
    ageMin: 9,
    ageMax: 12,
    icon: null,
    color: null,
    order: index + 1,
  }));
}

function buildSyntheticPath(
  subject: BackendSubjectOption | null,
  skillGraph: LearnSkillGraphEntry[],
  recommendation: LearnRecommendation | null,
): { path: LearningPathResponse | null; lessonSkillMap: Record<number, string> } {
  if (!subject) {
    return { path: null, lessonSkillMap: {} };
  }

  const recommendedLesson = recommendation?.lesson ?? null;
  const lessonSkillMap: Record<number, string> = {};

  const units: LearningPathUnit[] = skillGraph.map((skillEntry, unitIndex) => {
    const nodes = skillEntry.lessons.map((lesson, lessonIndex) => {
      lessonSkillMap[lesson.lessonId] = skillEntry.skill;
      const isRecommendedLesson = recommendedLesson === lesson.lesson;
      return {
        kind: "LESSON" as const,
        orderIndex: lessonIndex + 1,
        lesson: {
          id: lesson.lessonId,
          title: titleize(lesson.lesson),
          order: lessonIndex + 1,
          xpReward: Math.max(0, lesson.difficulty === "hard" ? 40 : lesson.difficulty === "medium" ? 30 : 20),
          unlocked: lesson.unlocked,
          completed: lesson.completed,
          score: lesson.completed ? 100 : null,
          starsEarned: lesson.stars,
          skill: skillEntry.skill,
          difficulty: lesson.difficulty,
          lessonKey: lesson.lesson,
          prerequisiteSkill: skillEntry.prerequisiteSkill,
          prerequisiteMastery: skillEntry.prerequisiteMastery,
          prerequisiteThreshold: skillEntry.prerequisiteThreshold,
          isRecommended: isRecommendedLesson,
        },
        event: null,
      };
    });
    const completedInUnit = nodes.filter((node) => node.lesson?.completed).length;

    return {
      id: unitIndex + 1,
      title: titleize(skillEntry.skill),
      description:
        skillEntry.prerequisiteSkill == null
          ? `Comece por ${titleize(skillEntry.skill)}.`
          : `Desbloqueie ao atingir o dominio minimo em ${titleize(skillEntry.prerequisiteSkill)}.`,
      order: unitIndex + 1,
      completionRate: nodes.length > 0 ? completedInUnit / nodes.length : 0,
      nodes,
    };
  });

  const totalLessons = skillGraph.reduce((sum, item) => sum + item.lessons.length, 0);
  const completedLessons = skillGraph.reduce(
    (sum, item) => sum + item.lessons.filter((lesson) => lesson.completed).length,
    0,
  );

  return {
    lessonSkillMap,
    path: {
      subjectId: subject.id,
      subjectName: subject.name,
      ageGroup: subject.ageGroup,
      dueReviewsCount: recommendation?.reason.includes("review") ? 1 : 0,
      streakDays: 0,
      masteryAverage: totalLessons > 0 ? completedLessons / totalLessons : 0,
      units,
    },
  };
}

export function useLearningState(options: UseLearningStateOptions = {}): LearningState {
  const [subjects, setSubjects] = useState<AprenderSubjectOption[]>([]);
  const [subjectOptions, setSubjectOptions] = useState<BackendSubjectOption[]>([]);
  const [selectedSubjectId, setSelectedSubjectIdState] = useState<number | null>(options.initialSubjectId ?? null);
  const [skills, setSkills] = useState<string[]>([]);
  const [skillGraph, setSkillGraph] = useState<LearnSkillGraphEntry[]>([]);
  const [currentLesson, setCurrentLesson] = useState<LearnLessonResponse | null>(null);
  const [nextLesson, setNextLesson] = useState<LearnLessonResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Ref to avoid currentLesson in the skills effect dependency array (would cause loop)
  const currentLessonRef = useRef(currentLesson);
  useEffect(() => {
    currentLessonRef.current = currentLesson;
  }, [currentLesson]);

  const selectedSubject = useMemo(
    () => subjectOptions.find((subject) => subject.id === selectedSubjectId) ?? null,
    [selectedSubjectId, subjectOptions],
  );

  const nextRecommendation = nextLesson?.nextRecommendation ?? currentLesson?.nextRecommendation ?? null;

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        setLoading(true);
        const [subjectsResponse, nextResponse] = await Promise.all([getLearnSubjects(), getLearnNext()]);
        if (!active) return;
        const nextSubjects = buildSubjectOptions(subjectsResponse.subjects);
        setSubjectOptions(nextSubjects);
        setSubjects(nextSubjects);
        setNextLesson(nextResponse);
        setCurrentLesson({
          lesson: nextResponse.lesson,
          difficulty: nextResponse.difficulty,
          xpReward: nextResponse.xpReward,
          nextRecommendation: nextResponse.nextRecommendation,
        });
        const preferredSubject = nextResponse.nextRecommendation?.subject ?? subjectsResponse.nextRecommendation?.subject ?? null;
        const matched = nextSubjects.find((subject) => subject.slug === preferredSubject);
        const fallback = matched ?? nextSubjects.find((subject) => subject.id === (options.initialSubjectId ?? null)) ?? nextSubjects[0] ?? null;
        startTransition(() => {
          setSelectedSubjectIdState(fallback?.id ?? null);
        });
        setError(null);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Nao foi possivel carregar o aprendizado.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [options.initialSubjectId]);

  useEffect(() => {
    if (!selectedSubject) return;
    let active = true;
    void (async () => {
      try {
        setRefreshing(true);
        const response = await getLearnSkills(selectedSubject.slug);
        if (!active) return;
        setSkills(response.skills);
        setSkillGraph(response.skillGraph);
        if (!currentLessonRef.current?.lesson) {
          setCurrentLesson({
            lesson: response.lesson,
            difficulty: response.difficulty,
            xpReward: response.xpReward,
            nextRecommendation: response.nextRecommendation,
          });
        }
        setNextLesson((prev) => ({
          lesson: response.lesson ?? prev?.lesson ?? null,
          difficulty: response.difficulty ?? prev?.difficulty ?? null,
          xpReward: response.xpReward ?? prev?.xpReward ?? 0,
          nextRecommendation: response.nextRecommendation ?? prev?.nextRecommendation ?? null,
        }));
        setError(null);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Nao foi possivel carregar as habilidades.");
      } finally {
        if (active) setRefreshing(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [selectedSubject]);

  const { path, lessonSkillMap } = useMemo(
    () => buildSyntheticPath(selectedSubject, skillGraph, nextRecommendation),
    [nextRecommendation, selectedSubject, skillGraph],
  );

  const refresh = async () => {
    if (!selectedSubject) return;
    setRefreshing(true);
    try {
        const [skillsResponse, nextResponse] = await Promise.all([
        getLearnSkills(selectedSubject.slug),
        getLearnNext(),
      ]);
      setSkills(skillsResponse.skills);
      setSkillGraph(skillsResponse.skillGraph);
      setNextLesson(nextResponse);
      setCurrentLesson((prev) => ({
        lesson: prev?.lesson ?? nextResponse.lesson,
        difficulty: prev?.difficulty ?? nextResponse.difficulty,
        xpReward: prev?.xpReward ?? nextResponse.xpReward,
        nextRecommendation: nextResponse.nextRecommendation,
      }));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel atualizar o aprendizado.");
    } finally {
      setRefreshing(false);
    }
  };

  const startLesson = async (skill?: string) => {
    try {
      const response = await startLearnLesson({
        skill,
        subject: selectedSubject?.slug,
      });
      setCurrentLesson(response);
      setNextLesson((prev) => ({
        lesson: prev?.lesson ?? response.lesson,
        difficulty: prev?.difficulty ?? response.difficulty,
        xpReward: prev?.xpReward ?? response.xpReward,
        nextRecommendation: response.nextRecommendation ?? prev?.nextRecommendation ?? null,
      }));
      return response;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel iniciar a lição.");
      return null;
    }
  };

  const updateProgress = async (input: CompleteProgressInput) => {
    try {
      const response = await completeLearnLesson({
        subject: input.subject,
        skill: input.skill,
        lesson: input.lesson,
        score: input.score,
        stars: input.stars ?? 0,
        timeSpent: input.timeSpent ?? 0,
        mastery: input.mastery,
        confidence: input.confidence,
        velocity: input.velocity,
      });
      setCurrentLesson(null);
      setNextLesson(response);
      return response;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel atualizar o progresso.");
      return null;
    }
  };

  return {
    subjects,
    selectedSubject,
    setSelectedSubjectId: (subjectId: number) => {
      startTransition(() => {
        setSelectedSubjectIdState(subjectId);
      });
    },
    skills,
    skillGraph,
    path,
    currentLesson,
    nextRecommendation,
    lessonSkillMap,
    loading,
    refreshing,
    error,
    refresh,
    startLesson,
    updateProgress,
  };
}

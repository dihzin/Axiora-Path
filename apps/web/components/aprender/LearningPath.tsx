"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";

import { LearningSection } from "@/components/aprender/LearningSection";
import type { LearningPathEventNode, LearningPathLessonNode, LearningPathUnit } from "@/lib/api/client";
import { trackAprenderEvent } from "@/lib/learning/analytics";

type LearningPathProps = {
  units: LearningPathUnit[];
  dueReviewsCount: number;
  masteryAverage: number;
  pathPriority: "review-first" | "advance-first" | "recovery";
  learningMode: "default" | "focus" | "calm";
  onLessonPress: (lesson: LearningPathLessonNode) => void;
  onEventPress: (event: LearningPathEventNode) => void;
  celebrateLessonId?: number | null;
  mascot?: {
    visible: boolean;
    message: string;
    onDismiss: () => void;
  };
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
};

export function LearningPath({
  units,
  dueReviewsCount,
  masteryAverage,
  pathPriority,
  learningMode,
  onLessonPress,
  onEventPress,
  celebrateLessonId = null,
  mascot,
  scrollContainerRef,
}: LearningPathProps) {
  const currentLessonId = useMemo(
    () => units.flatMap((unit) => unit.nodes).find((node) => node.lesson && node.lesson.unlocked && !node.lesson.completed)?.lesson?.id ?? null,
    [units],
  );

  const [pulseLessonId, setPulseLessonId] = useState<number | null>(null);
  const hasAutoScrolledRef = useRef(false);
  const userInteractedRef = useRef(false);

  useEffect(() => {
    const onUserIntent = () => {
      userInteractedRef.current = true;
    };
    const scrollHost = scrollContainerRef?.current;
    const target = scrollHost ?? window;
    target.addEventListener("wheel", onUserIntent, { passive: true });
    target.addEventListener("touchstart", onUserIntent, { passive: true });
    window.addEventListener("keydown", onUserIntent);
    return () => {
      target.removeEventListener("wheel", onUserIntent);
      target.removeEventListener("touchstart", onUserIntent);
      window.removeEventListener("keydown", onUserIntent);
    };
  }, [scrollContainerRef]);

  useEffect(() => {
    if (!celebrateLessonId) return;
    const flatNodes = units.flatMap((unit) => unit.nodes);
    const completedIndex = flatNodes.findIndex((node) => node.lesson?.id === celebrateLessonId);
    if (completedIndex < 0) return;

    for (let index = completedIndex + 1; index < flatNodes.length; index += 1) {
      const lesson = flatNodes[index].lesson;
      if (!lesson) continue;
      if (lesson.unlocked && !lesson.completed) {
        setPulseLessonId(lesson.id);
      }
      break;
    }

    const clearTimer = window.setTimeout(() => setPulseLessonId(null), 900);
    return () => window.clearTimeout(clearTimer);
  }, [celebrateLessonId, units]);

  useEffect(() => {
    if (hasAutoScrolledRef.current || userInteractedRef.current) return;
    const scrollHost = scrollContainerRef?.current;
    if (!scrollHost) return;

    const targetNode = scrollHost.querySelector<HTMLElement>("[data-current-node='true']");
    if (!targetNode) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const targetY = Math.max(0, targetNode.offsetTop - scrollHost.clientHeight * 0.35);
    hasAutoScrolledRef.current = true;

    trackAprenderEvent("path_scrolled_to_active", {
      active_lesson_id: currentLessonId,
      priority: pathPriority,
      mode: learningMode,
    });

    scrollHost.scrollTo({ top: targetY, behavior: prefersReducedMotion ? "auto" : "smooth" });
  }, [currentLessonId, learningMode, pathPriority, scrollContainerRef, units]);

  return (
    <LearningSection
      units={units}
      pathPriority={pathPriority}
      dueReviewsCount={dueReviewsCount}
      masteryAverage={masteryAverage}
      currentLessonId={currentLessonId}
      celebrateLessonId={celebrateLessonId}
      pulseLessonId={pulseLessonId}
      onLessonPress={onLessonPress}
      onEventPress={onEventPress}
      mascot={mascot}
      scrollContainerRef={scrollContainerRef}
    />
  );
}

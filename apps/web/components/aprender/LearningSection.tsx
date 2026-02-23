"use client";

import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";

import { SkillPath } from "@/components/aprender/SkillPath";
import { StickySectionCard } from "@/components/aprender/StickySectionCard";
import type { LearningPathEventNode, LearningPathLessonNode, LearningPathUnit } from "@/lib/api/client";

type LearningSectionProps = {
  units: LearningPathUnit[];
  pathPriority: "review-first" | "advance-first" | "recovery";
  dueReviewsCount: number;
  masteryAverage: number;
  currentLessonId: number | null;
  celebrateLessonId: number | null;
  pulseLessonId: number | null;
  onLessonPress: (lesson: LearningPathLessonNode) => void;
  onEventPress: (event: LearningPathEventNode) => void;
  mascot?: {
    visible: boolean;
    message: string;
    onDismiss: () => void;
  };
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
};

export function LearningSection({
  units,
  pathPriority,
  dueReviewsCount,
  masteryAverage,
  currentLessonId,
  celebrateLessonId,
  pulseLessonId,
  onLessonPress,
  onEventPress,
  mascot,
  scrollContainerRef,
}: LearningSectionProps) {
  const [activeUnitIndex, setActiveUnitIndex] = useState(0);
  const [animationKey, setAnimationKey] = useState(0);
  const stickyMeasureRef = useRef<HTMLDivElement | null>(null);
  const [stickyHeight, setStickyHeight] = useState(172);
  const [needsTopInset, setNeedsTopInset] = useState(false);

  const unitSummaries = useMemo(() => {
    return units.map((unit) => {
      const lessons = unit.nodes.flatMap((node) => (node.lesson ? [node.lesson] : []));
      const completedLessons = lessons.filter((lesson) => lesson.completed).length;
      const hasCurrentLesson = lessons.some((lesson) => lesson.id === currentLessonId);
      const firstLesson = lessons[0] ?? null;
      const isLocked = Boolean(firstLesson && !firstLesson.unlocked);
      const isCompleted = unit.completionRate >= 1;
      const isInProgress = !isCompleted && unit.completionRate > 0;
      const state: "default" | "completed" | "locked" | "inProgress" = isLocked
        ? "locked"
        : isCompleted
          ? "completed"
          : isInProgress
            ? "inProgress"
            : "default";
      return {
        unit,
        completedLessons,
        totalLessons: lessons.length,
        hasCurrentLesson,
        state,
      };
    });
  }, [currentLessonId, units]);

  const activeSummary = unitSummaries[activeUnitIndex] ?? unitSummaries[0];

  useLayoutEffect(() => {
    const node = stickyMeasureRef.current;
    if (!node) return;
    const ro = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.height;
      if (next && next > 0) {
        setStickyHeight(Math.ceil(next));
      }
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    const scrollEl = scrollContainerRef?.current;
    if (!scrollEl) return;

    const measureInset = () => {
      const firstNode = scrollEl.querySelector<HTMLElement>("[data-first-node='true']");
      if (!firstNode) {
        setNeedsTopInset(false);
        return;
      }
      const scrollTop = scrollEl.getBoundingClientRect().top;
      const firstTop = firstNode.getBoundingClientRect().top;
      setNeedsTopInset(firstTop < scrollTop + 4);
    };

    const raf = window.requestAnimationFrame(measureInset);
    const ro = new ResizeObserver(measureInset);
    ro.observe(scrollEl);
    window.addEventListener("resize", measureInset);

    return () => {
      window.cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", measureInset);
    };
  }, [scrollContainerRef, stickyHeight, units]);

  return (
    <section className="h-full overflow-hidden" aria-label="Learning Section">
      <div className="sticky top-0 z-20 bg-[color:var(--path-surface-alt)] px-4 pb-0 pt-3">
        <div ref={stickyMeasureRef}>
          {activeSummary ? (
            <StickySectionCard
              unit={activeSummary.unit}
              sectionOrder={activeUnitIndex + 1}
              completedLessons={activeSummary.completedLessons}
              totalLessons={activeSummary.totalLessons}
              active={activeSummary.hasCurrentLesson}
              animationKey={animationKey}
              variant="compact"
              state={activeSummary.state}
            />
          ) : null}
        </div>
      </div>

      <div
        ref={scrollContainerRef}
        data-scroll-area="aprender-path"
        className="relative z-0 h-full snap-y snap-proximity overflow-y-auto overscroll-y-contain scroll-smooth px-4 [scrollbar-gutter:stable] [-webkit-overflow-scrolling:touch]"
        style={{ height: `calc(100% - ${stickyHeight}px)`, paddingTop: needsTopInset ? 8 : 0 }}
      >
        <SkillPath
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
          scrollRootRef={scrollContainerRef}
          onActiveUnitChange={(nextIndex) => {
            setActiveUnitIndex((prev) => {
              if (prev === nextIndex) return prev;
              setAnimationKey((key) => key + 1);
              return nextIndex;
            });
          }}
        />
      </div>
    </section>
  );
}

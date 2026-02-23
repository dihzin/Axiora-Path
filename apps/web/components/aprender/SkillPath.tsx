"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";

import { PathMascot } from "@/components/aprender/PathMascot";
import { SkillPathUnit } from "@/components/aprender/SkillPathUnit";
import { UnitDivider } from "@/components/aprender/UnitDivider";
import type { LearningPathEventNode, LearningPathLessonNode, LearningPathUnit } from "@/lib/api/client";

type SkillPathProps = {
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
  scrollRootRef?: RefObject<HTMLElement | null>;
  onActiveUnitChange?: (unitIndex: number) => void;
  onPathReady?: () => void;
};

export function SkillPath({
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
  scrollRootRef,
  onActiveUnitChange,
  onPathReady,
}: SkillPathProps) {
  const UNIT_GAP_MIN = 96;
  const UNIT_GAP_MAX = 136;
  const unitRefs = useRef<Array<HTMLElement | null>>([]);
  const activeUnitIndexRef = useRef(0);
  const [activeUnitIndex, setActiveUnitIndex] = useState(0);

  const startOffsets = useMemo(() => {
    let offset = 0;
    return units.map((unit) => {
      const current = offset;
      offset += unit.nodes.length;
      return current;
    });
  }, [units]);

  const recoveryLessonId = useMemo(() => {
    if (masteryAverage >= 0.55) return null;
    const candidate = units
      .flatMap((unit) => unit.nodes)
      .find((node) => node.lesson && node.lesson.unlocked && !node.lesson.completed)?.lesson;
    return candidate?.id ?? null;
  }, [masteryAverage, units]);

  const reviewAnchorLessonId = useMemo(() => {
    if (pathPriority !== "review-first" || dueReviewsCount <= 0) return null;
    const completedLessons = units
      .flatMap((unit) => unit.nodes)
      .map((node) => node.lesson)
      .filter((lesson): lesson is LearningPathLessonNode => Boolean(lesson && lesson.completed));
    return completedLessons[completedLessons.length - 1]?.id ?? null;
  }, [dueReviewsCount, pathPriority, units]);

  const unitGapHeights = useMemo(() => {
    return units.map((unit, index) => {
      if (index === units.length - 1) return 0;
      const raw = Math.sin((unit.id + index) * 0.73);
      const normalized = (raw + 1) / 2;
      return Math.round(UNIT_GAP_MIN + normalized * (UNIT_GAP_MAX - UNIT_GAP_MIN));
    });
  }, [units]);

  useEffect(() => {
    const targets = unitRefs.current.filter((node): node is HTMLElement => Boolean(node));
    if (targets.length === 0) return;
    const root = scrollRootRef?.current ?? null;
    let rafId: number | null = null;

    const pick = () => {
      const rootRect = root?.getBoundingClientRect();
      const threshold = rootRect ? rootRect.top + Math.min(168, rootRect.height * 0.34) : 72 + 96;
      let selected = 0;
      for (let i = 0; i < targets.length; i += 1) {
        const top = targets[i].getBoundingClientRect().top;
        if (top <= threshold) selected = i;
      }
      if (selected === activeUnitIndexRef.current) return;
      activeUnitIndexRef.current = selected;
      setActiveUnitIndex(selected);
      onActiveUnitChange?.(selected);
    };

    const schedulePick = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        pick();
      });
    };

    const observer = new IntersectionObserver(schedulePick, {
      root,
      threshold: [0, 0.25, 0.5, 0.75, 1],
      rootMargin: "-12% 0px -45% 0px",
    });
    targets.forEach((node) => observer.observe(node));
    pick();
    onPathReady?.();

    if (root) {
      root.addEventListener("scroll", schedulePick, { passive: true });
    } else {
      window.addEventListener("scroll", schedulePick, { passive: true });
    }
    window.addEventListener("resize", schedulePick);

    return () => {
      observer.disconnect();
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      if (root) {
        root.removeEventListener("scroll", schedulePick);
      } else {
        window.removeEventListener("scroll", schedulePick);
      }
      window.removeEventListener("resize", schedulePick);
    };
  }, [onActiveUnitChange, onPathReady, scrollRootRef, units.length]);

  const mascotAnchor = useMemo(() => {
    const x = activeUnitIndex % 2 === 0 ? 28 : 62;
    const y = 128 + activeUnitIndex * 24;
    return { x, y };
  }, [activeUnitIndex]);

  return (
    <div className="relative z-0 px-1 pb-8">
      {units.map((unit, unitIndex) => {
        const nextUnit = units[unitIndex + 1];
        const previousCompleted = unit.nodes
          .flatMap((node) => (node.lesson ? [node.lesson] : []))
          .every((lesson) => lesson.completed);
        const nextUnitFirstLesson = nextUnit?.nodes.find((node) => node.lesson)?.lesson ?? null;
        const nextUnitLocked = Boolean(nextUnitFirstLesson && !nextUnitFirstLesson.unlocked);

        return (
          <div key={unit.id} className="last:mb-0">
            <section
              ref={(node) => {
                unitRefs.current[unitIndex] = node;
              }}
              className="snap-start"
              data-unit-index={unitIndex}
            >
              <SkillPathUnit
                unit={unit}
                unitIndex={unitIndex}
                startNodeIndex={startOffsets[unitIndex] ?? 0}
                currentLessonId={currentLessonId}
                celebrateLessonId={celebrateLessonId}
                recoveryLessonId={recoveryLessonId}
                reviewAnchorLessonId={reviewAnchorLessonId}
                pulseLessonId={pulseLessonId}
                onLessonPress={onLessonPress}
                onEventPress={onEventPress}
              />
            </section>

            {nextUnit ? (
              <UnitDivider
                nextUnitLabel={`Unidade ${nextUnit.order}`}
                completed={previousCompleted}
                locked={nextUnitLocked}
                gapHeight={unitGapHeights[unitIndex]}
              />
            ) : null}
          </div>
        );
      })}

      {mascot ? (
        <div className="pointer-events-none absolute inset-x-0 top-0">
          <PathMascot
            message={mascot.message}
            visible={mascot.visible}
            onDismiss={mascot.onDismiss}
            x={mascotAnchor.x}
            y={mascotAnchor.y}
          />
        </div>
      ) : null}
    </div>
  );
}

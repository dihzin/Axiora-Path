"use client";

import { memo, useMemo } from "react";

import { Node } from "@/components/aprender/Node";
import { BadgeIcon } from "@/components/icons/badges/BadgeIcon";
import type { LearningPathEventNode, LearningPathLessonNode, LearningPathUnit } from "@/lib/api/client";

type Point = { x: number; y: number };

type SkillPathUnitProps = {
  unit: LearningPathUnit;
  unitIndex: number;
  startNodeIndex: number;
  currentLessonId: number | null;
  celebrateLessonId: number | null;
  recoveryLessonId: number | null;
  reviewAnchorLessonId: number | null;
  pulseLessonId: number | null;
  onLessonPress: (lesson: LearningPathLessonNode) => void;
  onEventPress: (event: LearningPathEventNode) => void;
};

function seeded(index: number, unitIndex: number, seed: number): number {
  const n = index * 12.9898 + unitIndex * 78.233 + seed;
  const s = Math.sin(n) * 43758.5453;
  return s - Math.floor(s);
}

function catmullRomToBezier(points: Point[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function eventGlyph(event: LearningPathEventNode, state: "locked" | "available" | "active" | "done") {
  if (event.type === "CHEST") return <BadgeIcon type="chest" state={state} size={30} />;
  if (event.type === "CHECKPOINT") return <BadgeIcon type="star" state={state} size={30} />;
  if (event.type === "MINI_BOSS") return <BadgeIcon type="dumbbell" state={state} size={30} />;
  if (event.type === "BOOST") return <BadgeIcon type="lesson" state={state} size={30} />;
  return <BadgeIcon type="star" state={state} size={30} />;
}

function checkpointGlyph(seedIndex: number) {
  const variant = seedIndex % 3;
  if (variant === 0) return <BadgeIcon type="star" state="available" size={30} />;
  if (variant === 1) return <BadgeIcon type="chest" state="available" size={30} />;
  return <BadgeIcon type="book" state="available" size={30} />;
}

function milestoneGlyph(seedIndex: number) {
  return seedIndex % 2 === 0 ? <BadgeIcon type="star" state="available" size={30} /> : <BadgeIcon type="chest" state="available" size={30} />;
}

function lessonStatus(lesson: LearningPathLessonNode, currentLessonId: number | null): "completed" | "current" | "available" | "locked" {
  if (lesson.completed) return "completed";
  if (!lesson.unlocked) return "locked";
  if (lesson.id === currentLessonId) return "current";
  return "available";
}

function SkillPathUnitComponent({
  unit,
  unitIndex,
  startNodeIndex,
  currentLessonId,
  celebrateLessonId,
  recoveryLessonId,
  reviewAnchorLessonId,
  pulseLessonId,
  onLessonPress,
  onEventPress,
}: SkillPathUnitProps) {
  const nodes = unit.nodes;
  const NODE_GAP_MIN = 22;
  const NODE_GAP_MAX = 32;
  const NODE_STEP_BASE = 102;

  const points = useMemo(() => {
    let y = 92;
    return nodes.map((_, index) => {
      const globalIndex = startNodeIndex + index;
      const swing = Math.sin((globalIndex + 1) * 0.78 + unitIndex * 0.24) * 10;
      const jitter = (seeded(globalIndex, unitIndex, 41.9) - 0.5) * 4;
      const x = Math.max(34, Math.min(66, 50 + swing + jitter));
      if (index > 0) {
        const gap = NODE_GAP_MIN + Math.round(seeded(globalIndex, unitIndex, 77.4) * (NODE_GAP_MAX - NODE_GAP_MIN));
        const spacing = NODE_STEP_BASE + gap;
        y += spacing;
      }
      return { x, y };
    });
  }, [nodes, startNodeIndex, unitIndex]);

  const sectionHeight = useMemo(() => {
    if (points.length === 0) return 420;
    return Math.max(420, Math.ceil(points[points.length - 1].y + 88));
  }, [points]);

  const pathD = useMemo(() => {
    const svgPoints = points.map((point) => ({ x: (point.x / 100) * 360, y: point.y }));
    return catmullRomToBezier(svgPoints);
  }, [points]);

  const unitProgress = useMemo(() => {
    if (nodes.length <= 1) return 0;
    let sequentialProgressIndex = -1;
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      if (node.lesson) {
        if (!node.lesson.completed) break;
        sequentialProgressIndex = index;
        continue;
      }
      if (node.event?.status === "COMPLETED") {
        sequentialProgressIndex = index;
      }
    }
    if (sequentialProgressIndex < 0) return 0;
    return sequentialProgressIndex / (nodes.length - 1);
  }, [nodes]);
  const hasUnlockedPending = useMemo(
    () => nodes.some((node) => node.lesson && node.lesson.unlocked && !node.lesson.completed),
    [nodes],
  );
  const progressHead = useMemo(() => Math.max(unitProgress, Math.min(1, unitProgress + 0.08)), [unitProgress]);
  const progressSegment = useMemo(() => Math.max(0, progressHead - unitProgress), [progressHead, unitProgress]);

  const lessons = useMemo(() => nodes.flatMap((node) => (node.lesson ? [node.lesson] : [])), [nodes]);
  const checkpointLessons = useMemo(() => {
    const set = new Set<number>();
    lessons.forEach((lesson, idx) => {
      if ((idx + 1) % 5 === 0 || idx === lessons.length - 1) set.add(lesson.id);
    });
    return set;
  }, [lessons]);
  const milestoneLessonId = lessons.length > 0 ? lessons[lessons.length - 1].id : null;

  return (
    <section className="relative snap-start px-1" style={{ minHeight: sectionHeight }} aria-label={`Unidade ${unit.order}`}>
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 360 ${sectionHeight}`} preserveAspectRatio="none" aria-hidden>
        <path
          d={pathD}
          fill="none"
          stroke="rgba(55,72,98,0.2)"
          strokeWidth={6.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          transform="translate(0 1)"
        />
        <path
          d={pathD}
          fill="none"
          stroke="rgba(201,212,224,0.95)"
          strokeWidth={5.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={pathD}
          fill="none"
          stroke="var(--path-success)"
          strokeWidth={4.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          style={{
            strokeDasharray: "1",
            strokeDashoffset: `${1 - unitProgress}`,
            transition: "stroke-dashoffset 250ms ease",
          }}
        />
        {hasUnlockedPending && progressSegment > 0 ? (
          <path
            d={pathD}
            fill="none"
            stroke="var(--path-primary)"
            strokeWidth={4.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            style={{
              strokeDasharray: `${progressSegment} ${1 - progressSegment}`,
              strokeDashoffset: `${1 - progressHead}`,
              transition: "stroke-dashoffset 250ms ease, stroke-dasharray 250ms ease",
            }}
          />
        ) : null}
      </svg>

      {nodes.map((node, index) => {
        const point = points[index];
        if (!point) return null;
        const globalIndex = startNodeIndex + index;
        const isEdge = Math.abs(point.x - 50) > 22;

        if (node.lesson) {
          const lesson = node.lesson;
          const isCurrent = lesson.id === currentLessonId;
          const status = lessonStatus(lesson, currentLessonId);
          const isCheckpoint = checkpointLessons.has(lesson.id);
          const isMilestone = milestoneLessonId === lesson.id;
          const isRecovery = recoveryLessonId === lesson.id;
          const isReviewAnchor = reviewAnchorLessonId === lesson.id;
          const size: "hero" | "default" | "small" | "checkpoint" = isCurrent
            ? "hero"
            : isMilestone || isCheckpoint
              ? "checkpoint"
              : !lesson.unlocked || isEdge
                ? "small"
                : "default";

          return (
            <div
              key={`lesson-${lesson.id}`}
              className="absolute"
              data-current-node={isCurrent ? "true" : undefined}
              data-first-node={startNodeIndex === 0 && index === 0 ? "true" : undefined}
              style={{ left: `${point.x}%`, top: point.y, transform: "translate(-50%, -50%)" }}
            >
              <Node
                label={String(lesson.order)}
                ariaLabel={`Lição ${lesson.order}`}
                state={status === "completed" ? "done" : status === "current" ? "active" : status}
                celebrate={celebrateLessonId === lesson.id}
                disabled={!lesson.unlocked}
                size={size}
                checkpoint={isCheckpoint}
                        checkpointIcon={
                          isRecovery
                            ? <BadgeIcon type="lesson" state="active" size={30} />
                            : isReviewAnchor
                              ? <BadgeIcon type="book" state="active" size={30} />
                              : isCheckpoint
                                ? checkpointGlyph(globalIndex)
                                : undefined
                }
                milestone={isMilestone}
                milestoneIcon={isMilestone ? milestoneGlyph(globalIndex) : undefined}
                pulseOnce={pulseLessonId === lesson.id}
                startLabel={isCurrent ? "Começar" : null}
                onClick={() => onLessonPress(lesson)}
              />
            </div>
          );
        }

        if (node.event) {
                  const eventStatus =
                    node.event.status === "COMPLETED"
                      ? "completed"
                      : node.event.status === "LOCKED"
                        ? "locked"
                        : "available";
                  const iconState = node.event.status === "COMPLETED" ? "done" : node.event.status === "LOCKED" ? "locked" : "available";
                  return (
            <div
              key={`event-${node.event.id}`}
              className="absolute"
              style={{ left: `${point.x}%`, top: point.y, transform: "translate(-50%, -50%)" }}
            >
              <Node
                label="E"
                ariaLabel={`Evento ${node.event.title}`}
                state={eventStatus === "completed" ? "done" : eventStatus}
                disabled={node.event.status === "LOCKED"}
                icon={eventGlyph(node.event, iconState)}
                size={isEdge ? "small" : "default"}
                onClick={() => onEventPress(node.event!)}
              />
            </div>
          );
        }

        return null;
      })}
    </section>
  );
}

export const SkillPathUnit = memo(SkillPathUnitComponent);

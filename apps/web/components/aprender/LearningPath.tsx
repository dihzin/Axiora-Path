"use client";

import { Flag, Gift, Sparkles, Swords, Zap } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { LessonBadge } from "@/components/aprender/LessonBadge";
import { PathMascot } from "@/components/aprender/PathMascot";
import { PathSvg } from "@/components/aprender/PathSvg";
import { UnitCard } from "@/components/aprender/UnitCard";
import type { LearningPathEventNode, LearningPathLessonNode, LearningPathUnit } from "@/lib/api/client";

type Entry = {
  globalIndex: number;
  unitIndex: number;
  unitId: number;
  node: LearningPathUnit["nodes"][number];
};

type Point = { x: number; y: number };
const UNIT_CHAPTER_GAP = 280;
const CARD_HEIGHT_ESTIMATE = 212;
const CARD_TO_FIRST_NODE_GAP = 36;
const PREV_NODE_TO_CARD_GAP = 26;
const BADGE_HALF_BOX = 58;
const PAGE_TOP_GAP = 12;

function eventGlyph(event: LearningPathEventNode) {
  if (event.type === "CHEST") return <Gift className="h-4.5 w-4.5" aria-hidden />;
  if (event.type === "CHECKPOINT") return <Flag className="h-4.5 w-4.5" aria-hidden />;
  if (event.type === "MINI_BOSS") return <Swords className="h-4.5 w-4.5" aria-hidden />;
  if (event.type === "BOOST") return <Zap className="h-4.5 w-4.5" aria-hidden />;
  return <Sparkles className="h-4.5 w-4.5" aria-hidden />;
}

function checkpointGlyph(seedIndex: number) {
  const variant = seedIndex % 3;
  if (variant === 0) return <Flag className="h-5 w-5" aria-hidden />;
  if (variant === 1) return <Gift className="h-5 w-5" aria-hidden />;
  return <Sparkles className="h-5 w-5" aria-hidden />;
}

function lessonStatus(lesson: LearningPathLessonNode, currentLessonId: number | null): "completed" | "current" | "available" | "locked" {
  if (lesson.completed) return "completed";
  if (!lesson.unlocked) return "locked";
  if (lesson.id === currentLessonId) return "current";
  return "available";
}

function seeded(index: number, unitIndex: number, seed: number): number {
  const n = index * 12.9898 + unitIndex * 78.233 + seed;
  const s = Math.sin(n) * 43758.5453;
  return s - Math.floor(s);
}

function pathScale(index: number, unitIndex: number): number {
  const n = index + unitIndex * 13;
  const base = 0.94 + ((n * 23) % 13) / 100;
  const emphasis = (n % 6 === 0 ? 0.01 : 0) + (n % 10 === 3 ? 0.01 : 0);
  return Math.min(1.06, Number((base + emphasis).toFixed(2)));
}

function badgeVariance(index: number, unitIndex: number): { scaleAdjust: number } {
  const n = index + unitIndex * 17;
  const scaleBucket = n % 7;
  const scaleAdjust = scaleBucket === 1 ? 1.04 : scaleBucket === 4 ? 0.97 : 1;
  return { scaleAdjust };
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

function withUnitBridgePoints(entries: Entry[], points: Point[]): Point[] {
  if (points.length < 2) return points;
  const enhanced: Point[] = [];
  for (let i = 0; i < points.length; i += 1) {
    enhanced.push(points[i]);
    if (i === points.length - 1) continue;
    const current = entries[i];
    const next = entries[i + 1];
    if (current.unitId !== next.unitId) {
      const from = points[i];
      const to = points[i + 1];
      enhanced.push({
        x: from.x + (to.x - from.x) * 0.45,
        y: from.y + (to.y - from.y) * 0.5,
      });
      enhanced.push({
        x: from.x + (to.x - from.x) * 0.75,
        y: from.y + (to.y - from.y) * 0.78,
      });
    }
  }
  return enhanced;
}

type LearningPathProps = {
  units: LearningPathUnit[];
  onLessonPress: (lesson: LearningPathLessonNode) => void;
  onEventPress: (event: LearningPathEventNode) => void;
  celebrateLessonId?: number | null;
  mascot?: {
    visible: boolean;
    message: string;
    onDismiss: () => void;
  };
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function LearningPath({ units, onLessonPress, onEventPress, celebrateLessonId = null, mascot }: LearningPathProps) {
  const currentLessonId =
    units
      .flatMap((unit) => unit.nodes)
      .find((node) => node.lesson && node.lesson.unlocked && !node.lesson.completed)?.lesson?.id ?? null;

  const entries = useMemo<Entry[]>(() => {
    let globalIndex = 0;
    const list: Entry[] = [];
    units.forEach((unit, unitIndex) => {
      unit.nodes.forEach((node) => {
        list.push({ globalIndex, unitIndex, unitId: unit.id, node });
        globalIndex += 1;
      });
    });
    return list;
  }, [units]);

  const progressRatio = useMemo(() => {
    if (entries.length <= 1) return 0;
    let sequentialProgressIndex = -1;
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      if (entry.node.lesson) {
        if (!entry.node.lesson.completed) break;
        sequentialProgressIndex = index;
        continue;
      }
      if (entry.node.event) {
        if (entry.node.event.status === "COMPLETED") {
          sequentialProgressIndex = index;
        }
        continue;
      }
    }
    if (sequentialProgressIndex < 0) return 0;
    return sequentialProgressIndex / (entries.length - 1);
  }, [entries]);

  const checkpointLessons = useMemo(() => {
    const map = new Map<number, number>();
    units.forEach((unit, unitIndex) => {
      const lessons = unit.nodes.flatMap((node) => (node.lesson ? [node.lesson] : []));
      lessons.forEach((lesson, lessonIndex) => {
        const isFiveStep = (lessonIndex + 1) % 5 === 0;
        const isUnitEnd = lessonIndex === lessons.length - 1;
        if (isFiveStep || isUnitEnd) {
          map.set(lesson.id, unitIndex + lessonIndex);
        }
      });
    });
    return map;
  }, [units]);

  const measureRef = useRef<HTMLDivElement | null>(null);
  const pathRef = useRef<SVGPathElement | null>(null);
  const hasAutoScrolledRef = useRef(false);
  const userInteractedRef = useRef(false);
  const [width, setWidth] = useState(390);
  const [pathPoints, setPathPoints] = useState<Point[]>([]);

  useLayoutEffect(() => {
    const node = measureRef.current;
    if (!node) return;
    const ro = new ResizeObserver((entriesRo) => {
      const next = entriesRo[0]?.contentRect.width;
      if (next && next > 0) setWidth(next);
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  const basePoints = useMemo(() => {
    const xCenter = width / 2;
    const freq = 0.78 + seeded(entries.length || 1, 1, 41.7) * 0.14;
    const phase = seeded(entries.length || 1, 0, 13.2) * Math.PI * 2;
    const amplitude = 100 + Math.round(seeded(entries.length || 1, 2, 19.5) * 50);
    let y = 40;
    return entries.map((entry) => {
      if (entry.globalIndex > 0) {
        const prev = entries[entry.globalIndex - 1];
        if (prev && prev.unitId !== entry.unitId) y += UNIT_CHAPTER_GAP;
      }
      const step = 120 + Math.round(seeded(entry.globalIndex, entry.unitIndex, 149.4) * 30); // 120..150
      y += step;
      const xBase = xCenter + Math.sin(entry.globalIndex * freq + phase) * amplitude;
      return { x: xBase, y };
    });
  }, [entries, width]);

  const pathD = useMemo(() => catmullRomToBezier(basePoints), [basePoints]);

  const unitRanges = useMemo(() => {
    const ranges: Array<{ unitId: number; unitIndex: number; start: number; end: number }> = [];
    entries.forEach((entry, idx) => {
      const last = ranges[ranges.length - 1];
      if (!last || last.unitId !== entry.unitId) {
        ranges.push({ unitId: entry.unitId, unitIndex: entry.unitIndex, start: idx, end: idx });
      } else {
        last.end = idx;
      }
    });
    return ranges;
  }, [entries]);

  const controlPoints = useMemo(() => withUnitBridgePoints(entries, basePoints), [basePoints, entries]);
  const enhancedPathD = useMemo(() => catmullRomToBezier(controlPoints), [controlPoints]);

  const getNodePosition = useCallback(
    (index: number): Point => {
      const pathEl = pathRef.current;
      if (!pathEl || entries.length === 0) {
        return basePoints[index] ?? { x: width / 2, y: 60 + index * 130 };
      }
      const totalLength = pathEl.getTotalLength();
      const step = entries.length > 1 ? totalLength / (entries.length - 1) : 0;
      const point = pathEl.getPointAtLength(Math.max(0, Math.min(totalLength, index * step)));
      return { x: point.x, y: point.y };
    },
    [basePoints, entries.length, width],
  );

  useLayoutEffect(() => {
    const pathEl = pathRef.current;
    if (!pathEl || entries.length === 0) {
      setPathPoints([]);
      return;
    }
    const sampled = entries.map((entry) => getNodePosition(entry.globalIndex));
    const adjusted = sampled.map((point) => ({ ...point }));

    for (let i = 0; i < unitRanges.length; i += 1) {
      const range = unitRanges[i];
      const firstIdx = range.start;
      const minFirstYFromTop = PAGE_TOP_GAP + CARD_HEIGHT_ESTIMATE + CARD_TO_FIRST_NODE_GAP + BADGE_HALF_BOX;
      let requiredFirstY = minFirstYFromTop;

      if (i > 0) {
        const prevRange = unitRanges[i - 1];
        const prevLastY = adjusted[prevRange.end]?.y ?? 0;
        const unitBridge =
          prevLastY +
          BADGE_HALF_BOX +
          PREV_NODE_TO_CARD_GAP +
          CARD_HEIGHT_ESTIMATE +
          CARD_TO_FIRST_NODE_GAP +
          BADGE_HALF_BOX;
        requiredFirstY = Math.max(requiredFirstY, unitBridge);
      }

      const firstY = adjusted[firstIdx]?.y ?? 0;
      if (firstY < requiredFirstY) {
        const delta = requiredFirstY - firstY;
        for (let j = firstIdx; j < adjusted.length; j += 1) {
          adjusted[j].y += delta;
        }
      }
    }

    setPathPoints(adjusted);
  }, [entries, enhancedPathD, getNodePosition, unitRanges]);

  const maxY = pathPoints.length > 0 ? Math.max(...pathPoints.map((p) => p.y)) : 640;
  const canvasHeight = Math.max(720, Math.ceil(maxY + 180));
  const visualControlPoints = useMemo(
    () => withUnitBridgePoints(entries, pathPoints.length > 0 ? pathPoints : basePoints),
    [basePoints, entries, pathPoints],
  );
  const visualPathD = useMemo(() => catmullRomToBezier(visualControlPoints), [visualControlPoints]);

  const unitMap = useMemo(() => {
    const map = new Map<number, Array<{ entry: Entry; point: Point; unit: LearningPathUnit }>>();
    entries.forEach((entry) => {
      const point = pathPoints[entry.globalIndex] ?? basePoints[entry.globalIndex] ?? { x: width / 2, y: 60 + entry.globalIndex * 130 };
      const unit = units[entry.unitIndex];
      const list = map.get(entry.unitId) ?? [];
      list.push({ entry, point, unit });
      map.set(entry.unitId, list);
    });
    return map;
  }, [basePoints, entries, pathPoints, units, width]);

  const activeNodeIndex = useMemo(() => {
    const currentIndex = entries.findIndex((entry) => entry.node.lesson?.id === currentLessonId);
    if (currentIndex >= 0) return currentIndex;
    const nextLessonIndex = entries.findIndex((entry) => Boolean(entry.node.lesson && !entry.node.lesson.completed && entry.node.lesson.unlocked));
    if (nextLessonIndex >= 0) return nextLessonIndex;
    const anyPendingIndex = entries.findIndex((entry) => Boolean(entry.node.lesson && !entry.node.lesson.completed));
    if (anyPendingIndex >= 0) return anyPendingIndex;
    return 0;
  }, [currentLessonId, entries]);

  useEffect(() => {
    const onUserIntent = () => {
      userInteractedRef.current = true;
    };
    window.addEventListener("wheel", onUserIntent, { passive: true });
    window.addEventListener("touchstart", onUserIntent, { passive: true });
    window.addEventListener("keydown", onUserIntent);
    return () => {
      window.removeEventListener("wheel", onUserIntent);
      window.removeEventListener("touchstart", onUserIntent);
      window.removeEventListener("keydown", onUserIntent);
    };
  }, []);

  useEffect(() => {
    if (hasAutoScrolledRef.current) return;
    if (userInteractedRef.current) return;
    if (pathPoints.length === 0) return;
    const container = measureRef.current;
    const activePoint = pathPoints[activeNodeIndex];
    if (!container || !activePoint) return;
    if (window.scrollY > 40) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const viewportTarget = window.innerHeight * 0.35;
    const containerTop = container.getBoundingClientRect().top + window.scrollY;
    const targetY = Math.max(0, containerTop + activePoint.y - viewportTarget);
    hasAutoScrolledRef.current = true;
    window.scrollTo({
      top: targetY,
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  }, [activeNodeIndex, pathPoints]);

  const mascotAnchor = useMemo(() => {
    if (entries.length === 0) return { x: 16, y: 16 };
    const activeIndex = entries.findIndex((entry) => entry.node.lesson?.id === currentLessonId);
    const nextCheckpointIndex = entries.findIndex((entry) => {
      const lesson = entry.node.lesson;
      return Boolean(lesson && checkpointLessons.has(lesson.id) && !lesson.completed);
    });
    const fallbackIndex = entries.findIndex((entry) => Boolean(entry.node.lesson && !entry.node.lesson.completed));
    const anchorIndex = activeIndex >= 0 ? activeIndex : nextCheckpointIndex >= 0 ? nextCheckpointIndex : fallbackIndex >= 0 ? fallbackIndex : 0;
    const point = pathPoints[anchorIndex] ?? basePoints[anchorIndex] ?? { x: width / 2, y: 80 };
    return {
      x: clamp(point.x + 54, 10, width - 128),
      y: clamp(point.y - 28, 8, canvasHeight - 56),
    };
  }, [basePoints, canvasHeight, checkpointLessons, currentLessonId, entries, pathPoints, width]);

  return (
    <section ref={measureRef} className="space-y-[var(--path-space-3)]" aria-label="Trilha de aprendizado">
      <div className="relative bg-transparent" style={{ height: `${canvasHeight}px` }}>
        <PathSvg
          samplePathRef={pathRef}
          samplePathD={enhancedPathD}
          visualPathD={visualPathD}
          width={width}
          height={canvasHeight}
          progressRatio={progressRatio}
        />

        {units.map((unit, unitIndex) => {
          const items = unitMap.get(unit.id) ?? [];
          const unitTop = items.length > 0 ? Math.min(...items.map((item) => item.point.y)) : 0;
          const previousUnit = unitIndex > 0 ? units[unitIndex - 1] : null;
          const previousItems = previousUnit ? unitMap.get(previousUnit.id) ?? [] : [];
          const previousUnitBottomNodeY = previousItems.length > 0 ? Math.max(...previousItems.map((item) => item.point.y)) : null;
          const idealCardTop = unitTop - (CARD_HEIGHT_ESTIMATE + CARD_TO_FIRST_NODE_GAP + BADGE_HALF_BOX);
          const minCardTop =
            previousUnitBottomNodeY === null ? PAGE_TOP_GAP : previousUnitBottomNodeY + BADGE_HALF_BOX + PREV_NODE_TO_CARD_GAP;
          const unitCardTop = Math.max(minCardTop, idealCardTop);
          const lessons = unit.nodes.flatMap((node) => (node.lesson ? [node.lesson] : []));
          const completedLessons = lessons.filter((lesson) => lesson.completed).length;
          const hasCurrentLesson = lessons.some((lesson) => lesson.id === currentLessonId);

          return (
            <div key={unit.id}>
              <div className="absolute left-0 right-0 px-1" style={{ top: `${unitCardTop}px` }}>
                <UnitCard
                  sectionOrder={unitIndex + 1}
                  order={unit.order}
                  title={unit.title}
                  completionRate={unit.completionRate}
                  completedLessons={completedLessons}
                  totalLessons={lessons.length}
                  active={hasCurrentLesson}
                />
              </div>

              {items.map(({ entry, point }) => {
                const node = entry.node;
                const isCurrent = node.lesson?.id === currentLessonId;
                const variance = badgeVariance(entry.globalIndex, entry.unitIndex);
                const scale = isCurrent ? 1 : Number((pathScale(entry.globalIndex, entry.unitIndex) * variance.scaleAdjust).toFixed(2));
                const xPercent = (point.x / width) * 100;
                const isEdge = Math.abs(xPercent - 50) > 22;

                if (node.lesson) {
                  const status = lessonStatus(node.lesson, currentLessonId);
                  const isCheckpoint = checkpointLessons.has(node.lesson.id);
                  const size: "hero" | "default" | "small" | "checkpoint" = isCurrent
                    ? "hero"
                    : isCheckpoint
                      ? "checkpoint"
                      : !node.lesson.unlocked || isEdge
                        ? "small"
                        : "default";
                  return (
                    <div
                      key={`lesson-${node.lesson.id}`}
                      className="absolute"
                      style={{ left: 0, top: 0, transform: `translate3d(${point.x}px, ${point.y}px, 0) translate(-50%, -50%) scale(${scale})`, willChange: "transform" }}
                    >
                      <LessonBadge
                        label={String(node.lesson.order)}
                        ariaLabel={`Lição ${node.lesson.order}`}
                        status={status}
                        celebrate={celebrateLessonId === node.lesson.id}
                        disabled={!node.lesson.unlocked}
                        size={size}
                        checkpoint={isCheckpoint}
                        checkpointIcon={isCheckpoint ? checkpointGlyph(checkpointLessons.get(node.lesson.id) ?? entry.globalIndex) : undefined}
                        startLabel={isCurrent ? "Começar" : null}
                        onClick={() => onLessonPress(node.lesson!)}
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
                  return (
                    <div
                      key={`event-${node.event.id}`}
                      className="absolute"
                      style={{ left: 0, top: 0, transform: `translate3d(${point.x}px, ${point.y}px, 0) translate(-50%, -50%) scale(${scale})`, willChange: "transform" }}
                    >
                      <LessonBadge
                        label="E"
                        ariaLabel={`Evento ${node.event.title}`}
                        status={eventStatus}
                        disabled={node.event.status === "LOCKED"}
                        icon={eventGlyph(node.event)}
                        size={isEdge ? "small" : "default"}
                        onClick={() => onEventPress(node.event!)}
                      />
                    </div>
                  );
                }

                return null;
              })}
            </div>
          );
        })}

        {mascot ? (
          <PathMascot
            message={mascot.message}
            visible={mascot.visible}
            onDismiss={mascot.onDismiss}
            x={mascotAnchor.x}
            y={mascotAnchor.y}
          />
        ) : null}
      </div>
    </section>
  );
}

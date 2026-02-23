"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { TrailLessonNode, TrailUnit } from "@/lib/trail-types";
import { AxionCharacter } from "@/components/axion-character";
import { ChildNavIcon, type ChildNavIconKey } from "@/components/child-bottom-nav";
import { BottomNav } from "@/components/trail/BottomNav";
import { DesktopUnitHeader } from "@/components/trail/DesktopUnitHeader";
import { DesktopRightRail } from "@/components/trail/DesktopRightRail";
import { SubjectSelector } from "@/components/trail/SubjectSelector";
import { TrailPath } from "@/components/trail/TrailPath";
import { UnitBanner } from "@/components/trail/UnitBanner";
import {
  ApiError,
  claimMission,
  getApiErrorMessage,
  getAprenderSubjects,
  getCurrentMissions,
  getLearningInsights,
  getLearningPath,
  type AprenderSubjectOption,
  type LearningInsightsResponse,
  type LearningPathResponse,
  type MissionsCurrentResponse,
} from "@/lib/api/client";

const LOCAL_COMPLETED_LESSONS_KEY = "axiora_learning_completed_lessons";
const DESKTOP_BREAKPOINT_PX = 1024;
const DESKTOP_ACTIVE_THRESHOLD_PX = 188;
const MOBILE_ACTIVE_THRESHOLD_OFFSET_PX = 146;
const ACTIVE_NODE_VIEWPORT_TARGET_RATIO = 0.35;

function mapPosition(index: number): "left" | "center" | "right" {
  const pattern: Array<"left" | "center" | "right" | "center"> = ["center", "right", "center", "left"];
  return pattern[index % pattern.length];
}

function normalizeSubjectName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function normalizeUnitTitle(order: number, rawTitle: string): string {
  const title = rawTitle.trim();
  const duplicatedPrefix = new RegExp(`^unidade\\s*${order}\\s*:\\s*`, "i");
  const cleaned = title.replace(duplicatedPrefix, "").trim();
  return `Unidade ${order}: ${cleaned || title}`;
}

function getOptimisticIdsValidForPath(path: LearningPathResponse, optimisticIds: Set<number>) {
  const validIds = new Set<number>();
  path.units.forEach((unit) => {
    unit.nodes.forEach((node) => {
      const lesson = node.lesson;
      if (!lesson) return;
      if (!lesson.completed && optimisticIds.has(lesson.id)) {
        validIds.add(lesson.id);
      }
    });
  });
  return validIds;
}

function getCurrentUnitIndex(path: LearningPathResponse): number {
  const byUnlockedPending = path.units.findIndex((unit) =>
    unit.nodes.some((node) => node.lesson && node.lesson.unlocked && !node.lesson.completed),
  );
  if (byUnlockedPending >= 0) return byUnlockedPending;
  const byIncomplete = path.units.findIndex((unit) => unit.completionRate < 1);
  if (byIncomplete >= 0) return byIncomplete;
  return Math.max(0, path.units.length - 1);
}

function toTrailUnits(path: LearningPathResponse, optimisticCompletedLessonIds: Set<number>): TrailUnit[] {
  const currentUnitIndex = getCurrentUnitIndex(path);
  let activeAssigned = false;

  return path.units.map((unit, unitIndex) => {
    const isFutureUnit = unitIndex > currentUnitIndex;
    const sortedLessons = [...unit.nodes]
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((node) => node.lesson)
      .filter((lesson): lesson is NonNullable<typeof lesson> => Boolean(lesson));

    // Enforce contiguous progression to avoid visual states like done -> locked -> done.
    let contiguousDoneCount = 0;
    for (let i = 0; i < sortedLessons.length; i += 1) {
      const lesson = sortedLessons[i];
      const completed = lesson.completed || optimisticCompletedLessonIds.has(lesson.id);
      if (!completed) break;
      contiguousDoneCount += 1;
    }

    const lessonNodesRaw: TrailLessonNode[] = sortedLessons.map((lesson, index) => {
      let type: TrailLessonNode["type"] = "locked";
      if (!isFutureUnit && index < contiguousDoneCount) {
        type = "completed";
      } else if (!isFutureUnit && !activeAssigned && index === contiguousDoneCount) {
        type = "active";
        activeAssigned = true;
      }

      return {
        id: `lesson-${lesson.id}`,
        title: lesson.title,
        position: mapPosition(index),
        type,
      };
    });

    return {
      id: String(unit.id),
      section: `Seção ${unit.order}, Unidade ${unit.order}`,
      title: normalizeUnitTitle(unit.order, unit.title),
      progress: Math.round(Math.max(0, Math.min(100, unit.completionRate * 100))),
      nodes: lessonNodesRaw,
    };
  });
}

export function TrailScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [path, setPath] = useState<LearningPathResponse | null>(null);
  const [subjects, setSubjects] = useState<AprenderSubjectOption[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null);
  const [coins] = useState(277);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pathRefreshing, setPathRefreshing] = useState(false);
  const desktopMainColumnRef = useRef<HTMLDivElement | null>(null);
  const desktopRightColumnRef = useRef<HTMLElement | null>(null);
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Array<HTMLElement | null>>([]);
  const [activeUnitIndex, setActiveUnitIndex] = useState(0);
  const [desktopUnitCardRect, setDesktopUnitCardRect] = useState<{ left: number; width: number } | null>(null);
  const [desktopRightPanelRect, setDesktopRightPanelRect] = useState<{ left: number; width: number } | null>(null);
  const [optimisticCompletedLessons, setOptimisticCompletedLessons] = useState<Set<number>>(new Set());
  const [insights, setInsights] = useState<LearningInsightsResponse | null>(null);
  const [missions, setMissions] = useState<MissionsCurrentResponse | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [missionsLoading, setMissionsLoading] = useState(true);
  const [claimingMissionId, setClaimingMissionId] = useState<string | null>(null);
  const hasLoadedPathRef = useRef(false);
  const lastAutoScrollKeyRef = useRef<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(LOCAL_COMPLETED_LESSONS_KEY);
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      const list = Array.isArray(parsed) ? parsed.filter((item): item is number => typeof item === "number" && Number.isFinite(item)) : [];
      setOptimisticCompletedLessons(new Set(list));
    } catch {
      setOptimisticCompletedLessons(new Set());
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const completedLessonIdRaw = searchParams.get("completedLessonId");
    const completedLessonId = completedLessonIdRaw ? Number(completedLessonIdRaw) : NaN;
    if (!Number.isFinite(completedLessonId) || completedLessonId <= 0) return;

    setOptimisticCompletedLessons((prev) => {
      if (prev.has(completedLessonId)) return prev;
      const next = new Set(prev);
      next.add(completedLessonId);
      try {
        window.localStorage.setItem(LOCAL_COMPLETED_LESSONS_KEY, JSON.stringify(Array.from(next)));
      } catch {
        // no-op
      }
      return next;
    });
  }, [searchParams]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const list = await getAprenderSubjects();
        if (!active) return;
        const sorted = [...list].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name) || a.id - b.id);
        const uniqByName = new Map<string, AprenderSubjectOption>();
        sorted.forEach((item) => {
          const key = normalizeSubjectName(item.name);
          if (!uniqByName.has(key)) {
            uniqByName.set(key, item);
          }
        });
        setSubjects(Array.from(uniqByName.values()));
      } catch {
        if (active) setSubjects([]);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (hasLoadedPathRef.current) {
          setPathRefreshing(true);
        } else {
          setLoading(true);
        }
        const data = await getLearningPath(selectedSubjectId ?? undefined);
        if (!active) return;
        setPath(data);
        hasLoadedPathRef.current = true;
        setOptimisticCompletedLessons((prev) => {
          const next = getOptimisticIdsValidForPath(data, prev);
          const changed = next.size !== prev.size || Array.from(next).some((id) => !prev.has(id));
          if (changed && typeof window !== "undefined") {
            try {
              window.localStorage.setItem(LOCAL_COMPLETED_LESSONS_KEY, JSON.stringify(Array.from(next)));
            } catch {
              // no-op
            }
          }
          return changed ? next : prev;
        });
        setError(null);
      } catch (err: unknown) {
        if (!active) return;
        const message =
          err instanceof ApiError
            ? getApiErrorMessage(err, "Nao foi possivel carregar a trilha.")
            : "Nao foi possivel carregar a trilha.";
        setError(message);
      } finally {
        if (active) {
          setLoading(false);
          setPathRefreshing(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [selectedSubjectId]);

  useEffect(() => {
    let active = true;
    (async () => {
      setInsightsLoading(true);
      setMissionsLoading(true);
      const [insightsResult, missionsResult] = await Promise.allSettled([getLearningInsights(), getCurrentMissions()]);
      if (!active) return;
      if (insightsResult.status === "fulfilled") setInsights(insightsResult.value);
      if (missionsResult.status === "fulfilled") setMissions(missionsResult.value);
      setInsightsLoading(false);
      setMissionsLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [selectedSubjectId]);

  const units = useMemo(() => (path ? toTrailUnits(path, optimisticCompletedLessons) : []), [path, optimisticCompletedLessons]);
  const selectedSubjectName = useMemo(() => {
    if (path?.subjectName) return path.subjectName;
    const fallback = subjects.find((item) => item.id === selectedSubjectId);
    return fallback?.name ?? "Matéria";
  }, [path?.subjectName, selectedSubjectId, subjects]);
  const onClaimMission = async (missionId: string) => {
    if (!missionId || claimingMissionId) return;
    setClaimingMissionId(missionId);
    try {
      await claimMission(missionId);
      setMissions((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          missions: prev.missions.map((mission) =>
            mission.missionId === missionId
              ? {
                  ...mission,
                  completed: true,
                  rewardGranted: true,
                  completedAt: mission.completedAt ?? new Date().toISOString(),
                  currentValue: Math.max(mission.currentValue, mission.targetValue),
                  progressPercent: 100,
                }
              : mission,
          ),
        };
      });
    } catch {
      // keep silent to avoid visual noise in desktop side panel
    } finally {
      setClaimingMissionId(null);
    }
  };

  const onNodeClick = (node: TrailLessonNode) => {
    if (node.type === "locked") return;
    if (node.id.startsWith("lesson-")) {
      const id = Number(node.id.replace("lesson-", ""));
      if (Number.isFinite(id) && id > 0) router.push(`/child/aprender/lesson/${id}`);
    }
  };

  useEffect(() => {
    if (units.length === 0) return;
    const root = scrollRootRef.current;
    const sections = sectionRefs.current.slice(0, units.length).filter((node): node is HTMLElement => Boolean(node));
    if (sections.length === 0) return;

    const isDesktop = typeof window !== "undefined" && window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT_PX}px)`).matches;

    let rafId: number | null = null;
    const pickActive = () => {
      const threshold = isDesktop
        ? DESKTOP_ACTIVE_THRESHOLD_PX
        : root
          ? root.getBoundingClientRect().top + MOBILE_ACTIVE_THRESHOLD_OFFSET_PX
          : DESKTOP_ACTIVE_THRESHOLD_PX;
      let selected = -1;
      for (let i = 0; i < sections.length; i += 1) {
        const top = sections[i].getBoundingClientRect().top;
        if (top <= threshold) selected = i;
      }
      if (selected < 0) {
        let nearestIndex = 0;
        let nearestDistance = Number.POSITIVE_INFINITY;
        for (let i = 0; i < sections.length; i += 1) {
          const distance = Math.abs(sections[i].getBoundingClientRect().top - threshold);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestIndex = i;
          }
        }
        selected = nearestIndex;
      }
      setActiveUnitIndex((prev) => (prev === selected ? prev : selected));
    };

    const schedulePick = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        pickActive();
      });
    };

    pickActive();
    if (isDesktop) {
      window.addEventListener("scroll", schedulePick, { passive: true });
    } else if (root) {
      root.addEventListener("scroll", schedulePick, { passive: true });
    }
    window.addEventListener("resize", schedulePick);

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      if (isDesktop) {
        window.removeEventListener("scroll", schedulePick);
      } else if (root) {
        root.removeEventListener("scroll", schedulePick);
      }
      window.removeEventListener("resize", schedulePick);
    };
  }, [units]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (loading || units.length === 0) return;
    const autoKey = `${path?.subjectId ?? "none"}:${path?.units.length ?? 0}`;
    if (lastAutoScrollKeyRef.current === autoKey) return;

    const isDesktop = window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT_PX}px)`).matches;
    const mobileRoot = scrollRootRef.current;
    if (isDesktop && window.scrollY > 24) return;
    if (!isDesktop && mobileRoot && mobileRoot.scrollTop > 24) return;

    const searchRoot: ParentNode = isDesktop ? document : mobileRoot ?? document;
    const activeNode = searchRoot.querySelector('button[data-node-state="active"]') as HTMLElement | null;
    if (!activeNode) return;

    const targetRect = activeNode.getBoundingClientRect();
    const desiredTop = window.innerHeight * ACTIVE_NODE_VIEWPORT_TARGET_RATIO;
    const delta = targetRect.top - desiredTop;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const behavior: ScrollBehavior = prefersReducedMotion ? "auto" : "smooth";
    if (isDesktop) {
      window.scrollTo({ top: window.scrollY + delta, behavior });
    } else if (mobileRoot) {
      mobileRoot.scrollTo({ top: mobileRoot.scrollTop + delta, behavior });
    }

    lastAutoScrollKeyRef.current = autoKey;
  }, [loading, path?.subjectId, path?.units.length, units.length]);

  useEffect(() => {
    const updateDesktopRect = () => {
      if (typeof window === "undefined") return;
      if (window.innerWidth < DESKTOP_BREAKPOINT_PX) {
        setDesktopUnitCardRect(null);
        setDesktopRightPanelRect(null);
        return;
      }
      const mainRect = desktopMainColumnRef.current?.getBoundingClientRect();
      if (mainRect) {
        setDesktopUnitCardRect({ left: Math.round(mainRect.left), width: Math.round(mainRect.width) });
      }
      const rightRect = desktopRightColumnRef.current?.getBoundingClientRect();
      if (rightRect) {
        setDesktopRightPanelRect({ left: Math.round(rightRect.left), width: Math.round(rightRect.width) });
      }
    };

    updateDesktopRect();
    window.addEventListener("resize", updateDesktopRect);
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            updateDesktopRect();
          })
        : null;
    if (observer) {
      if (desktopMainColumnRef.current) observer.observe(desktopMainColumnRef.current);
      if (desktopRightColumnRef.current) observer.observe(desktopRightColumnRef.current);
    }

    return () => {
      window.removeEventListener("resize", updateDesktopRect);
      observer?.disconnect();
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#F4F7FC]">
      <div className="w-full lg:pl-[208px]">
        <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-20 lg:flex lg:w-[208px] lg:flex-col lg:gap-1 lg:border-r lg:border-[#E2E8F2] lg:bg-[#F4F7FC] lg:px-3 lg:py-5">
          <div className="mb-0.5 flex justify-center">
            <AxionCharacter stage={1} moodState="NEUTRAL" reducedMotion={false} />
          </div>
          <DesktopNavItem href="/child" active={pathname === "/child"} iconName="inicio" label="Início" />
          <DesktopNavItem href="/child/aprender" active={pathname.startsWith("/child/aprender")} iconName="aprender" label="Aprender" />
          <DesktopNavItem href="/child/stickers" active={pathname.startsWith("/child/stickers")} iconName="figurinhas" label="Figurinhas" />
          <DesktopNavItem href="/child/games" active={pathname.startsWith("/child/games")} iconName="jogos" label="Jogos" />
          <DesktopNavItem href="/child/store" active={pathname.startsWith("/child/store")} iconName="loja" label="Loja" />
          <DesktopNavItem href="/child/axion" active={pathname.startsWith("/child/axion")} iconName="axion" label="Axion" />
        </aside>

        <div className="mx-auto w-full lg:grid lg:max-w-[1220px] lg:grid-cols-[minmax(620px,1fr)_320px] lg:gap-7 lg:px-5 xl:px-8">
        {units.length > 0 ? <DesktopUnitHeader unit={units[activeUnitIndex] ?? units[0]} rect={desktopUnitCardRect} /> : null}
        <div
          ref={(node) => {
            desktopMainColumnRef.current = node;
            scrollRootRef.current = node;
          }}
          className="mx-auto h-[calc(100dvh-6rem)] w-full max-w-sm overflow-y-auto px-4 pb-4 pt-3 md:max-w-3xl md:px-6 lg:h-auto lg:max-w-[760px] lg:overflow-x-visible lg:overflow-y-visible lg:px-0 lg:pb-10 lg:pt-5"
        >
          {units.length > 0 ? (
            <div className="mb-4 hidden lg:block lg:opacity-0">
              <UnitBanner unit={units[activeUnitIndex] ?? units[0]} />
            </div>
          ) : null}

          <header className="sticky top-0 z-40 mb-3 lg:hidden">
            <SubjectSelector
                streak={path?.streakDays ?? 1}
                gems={coins}
                xp={Math.round((path?.masteryAverage ?? 0.31) * 100)}
                selectedSubjectName={selectedSubjectName}
                subjects={subjects}
                selectedSubjectId={selectedSubjectId}
                pathSubjectId={path?.subjectId ?? null}
                className="max-w-sm md:max-w-3xl lg:max-w-[680px]"
                onSelectSubject={setSelectedSubjectId}
              />
          </header>

          <main className="space-y-0">
            {loading && !path ? (
              <div className="rounded-2xl border border-[#E3E8F2] bg-white p-3 text-sm font-bold text-[#4E6992]">Carregando trilha...</div>
            ) : null}
            {pathRefreshing ? (
              <div className="mb-2 inline-flex items-center rounded-full border border-[#DCE5F3] bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.04em] text-[#6A7E9D]">
                Atualizando...
              </div>
            ) : null}
            {error ? <div className="rounded-2xl border border-[#E3E8F2] bg-white p-3 text-sm font-bold text-[#4E6992]">{error}</div> : null}
            {units.length > 0 ? (
              <div className="relative">
                <div className="sticky top-[88px] z-30 bg-[#F4F7FC]/95 pb-3 pt-1 [backdrop-filter:blur(1.5px)] lg:hidden">
                  <UnitBanner unit={units[activeUnitIndex] ?? units[0]} />
                </div>
                <div className="space-y-10 md:space-y-12">
                  {units.map((unit, unitIndex) => (
                    <section
                      key={unit.id}
                      ref={(node) => {
                        sectionRefs.current[unitIndex] = node;
                      }}
                      data-unit-index={unitIndex}
                      className="scroll-mt-40 space-y-4"
                    >
                      {unitIndex > 0 ? (
                        <p className="text-center text-xs font-black uppercase tracking-[0.1em] text-[#9AA8BD]">
                          UNIDADE {unitIndex + 1}
                        </p>
                      ) : null}
                      <TrailPath nodes={unit.nodes} onNodeClick={onNodeClick} />
                    </section>
                  ))}
                </div>
              </div>
            ) : null}
          </main>
        </div>

        <aside ref={desktopRightColumnRef} className="hidden lg:block lg:py-5">
          <div
            className={`space-y-4 ${
              desktopRightPanelRect ? "lg:fixed lg:top-5 lg:z-20" : "sticky top-5"
            } lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto lg:overscroll-contain lg:pr-1`}
            style={
              desktopRightPanelRect
                ? { left: desktopRightPanelRect.left, width: desktopRightPanelRect.width }
                : undefined
            }
          >
            <DesktopRightRail
              streak={path?.streakDays ?? 1}
              gems={coins}
              xp={Math.round((path?.masteryAverage ?? 0.31) * 100)}
              selectedSubjectName={selectedSubjectName}
              subjects={subjects}
              selectedSubjectId={selectedSubjectId}
              pathSubjectId={path?.subjectId ?? null}
              insights={insights}
              insightsLoading={insightsLoading}
              missions={missions}
              missionsLoading={missionsLoading}
              claimingMissionId={claimingMissionId}
              onSelectSubject={setSelectedSubjectId}
              onClaimMission={(missionId) => void onClaimMission(missionId)}
            />
          </div>
        </aside>
        </div>
      </div>
      <BottomNav />
    </div>
  );
}

function DesktopNavItem({ href, iconName, label, active }: { href: string; iconName: ChildNavIconKey; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`mx-1.5 inline-flex items-center gap-2.5 rounded-2xl px-4 py-[7px] text-[15px] font-black uppercase tracking-[0.04em] transition-colors ${
        active ? "border border-[#96D9FF] bg-[#EAF7FF] text-[#1DA1F2]" : "text-[#4A5F80] hover:bg-white"
      }`}
    >
      <span className={`${active ? "opacity-100" : "opacity-75 grayscale-[35%]"}`}>
        <ChildNavIcon name={iconName} active={active} size={42} />
      </span>
      {label}
    </Link>
  );
}

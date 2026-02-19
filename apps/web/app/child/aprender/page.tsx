"use client";

import {
  BookOpen,
  CheckCircle2,
  Coins,
  Flag,
  Flame,
  Gift,
  Lock,
  Sparkles,
  Star,
  Swords,
  Trophy,
  Volume2,
  VolumeX,
  XCircle,
  Zap,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { ChildBottomNav } from "@/components/child-bottom-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import {
  ApiError,
  claimMission,
  completeLearningPathEvent,
  getActiveSeasonEvents,
  getApiErrorMessage,
  getCalendarActivity,
  getCurrentMissions,
  getLearningPath,
  startLearningPathEvent,
  type ActiveSeasonEventsResponse,
  type LearningEventCompleteResponse,
  type LearningPathEventNode,
  type LearningPathNode,
  type LearningPathResponse,
  type LearningPathUnit,
  type MissionsCurrentResponse,
  type UserUXSettings,
} from "@/lib/api/client";
import {
  UX_SETTINGS_FALLBACK,
  effectiveReducedMotion,
  fetchUXSettings,
  hapticCompletion,
  hapticPress,
  playSfx,
  saveUXSettings,
} from "@/lib/ux-feedback";
import { cn } from "@/lib/utils";

type Point = { x: number; y: number };

type UnlockAnimation = {
  unitId: number;
  fromLessonId: number;
  toLessonId: number;
  key: string;
};

type Particle = {
  id: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
  size: number;
  delay: number;
};

function missionTypeLabel(kind: string): string {
  if (kind === "LESSONS_COMPLETED") return "Licoes";
  if (kind === "XP_GAINED") return "XP";
  if (kind === "PERFECT_SCORES") return "3 estrelas";
  if (kind === "STREAK_DAYS") return "Sequencia";
  if (kind === "MINI_BOSS_WINS") return "Mini-boss";
  return kind;
}

function daysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate();
}

function buildSerpentinePoints(count: number): Point[] {
  if (count <= 0) return [];
  const center = 50;
  const swing = 28;
  const top = 10;
  const step = 20;
  return Array.from({ length: count }, (_, index) => {
    const side = index % 2 === 0 ? -1 : 1;
    const organic = 0.8 + Math.sin((index + 1) * 0.7) * 0.2;
    return { x: center + side * swing * organic, y: top + index * step };
  });
}

function buildBezier(points: Point[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1];
    const next = points[index];
    const mid = (prev.y + next.y) / 2;
    d += ` C ${prev.x} ${mid}, ${next.x} ${mid}, ${next.x} ${next.y}`;
  }
  return d;
}

function eventIcon(event: LearningPathEventNode) {
  if (event.type === "CHEST") return <Gift className="h-4.5 w-4.5" />;
  if (event.type === "CHECKPOINT") return <Flag className="h-4.5 w-4.5" />;
  if (event.type === "MINI_BOSS") return <Swords className="h-4.5 w-4.5" />;
  if (event.type === "STORY_STOP") return <Sparkles className="h-4.5 w-4.5" />;
  if (event.type === "BOOST") return <Zap className="h-4.5 w-4.5" />;
  return <Lock className="h-4.5 w-4.5" />;
}

function eventNodeClass(event: LearningPathEventNode): string {
  if (event.status === "COMPLETED") return "border-secondary/45 bg-secondary text-white shadow-[0_10px_22px_rgba(45,212,191,0.35)]";
  if (event.status === "LOCKED") return "border-slate-300 bg-slate-300/85 text-slate-600";
  if (event.type === "MINI_BOSS") return "border-accent/45 bg-accent text-white shadow-[0_14px_30px_rgba(255,107,61,0.48)]";
  if (event.type === "CHEST") return "border-amber-400/55 bg-amber-500 text-white shadow-[0_10px_24px_rgba(245,158,11,0.38)]";
  if (event.type === "BOOST") return "border-primary/45 bg-primary text-white shadow-[0_10px_24px_rgba(29,78,216,0.36)]";
  if (event.type === "REVIEW_GATE") return "border-rose-400/50 bg-rose-500 text-white";
  return "border-primary/40 bg-primary text-white";
}

function lessonNodeClass(completed: boolean, current: boolean, unlocked: boolean): string {
  if (completed) return "border-secondary/45 bg-secondary text-white shadow-[0_10px_22px_rgba(45,212,191,0.35)]";
  if (current) return "border-accent/45 bg-accent text-white node-current shadow-[0_12px_28px_rgba(255,107,61,0.4)]";
  if (!unlocked) return "border-slate-300 bg-slate-300/85 text-slate-600";
  return "border-primary/40 bg-white text-primary shadow-[0_8px_18px_rgba(29,78,216,0.24)]";
}

function UnitPath({
  unit,
  onOpenNode,
  unlockAnimation,
  reducedMotion,
  soundEnabled,
  onUnlockDone,
}: {
  unit: LearningPathUnit;
  onOpenNode: (node: LearningPathNode) => void;
  unlockAnimation: UnlockAnimation | null;
  reducedMotion: boolean;
  soundEnabled: boolean;
  onUnlockDone: (toast: string) => void;
}) {
  const points = useMemo(() => buildSerpentinePoints(unit.nodes.length), [unit.nodes.length]);
  const path = useMemo(() => buildBezier(points), [points]);
  const viewHeight = points.length > 0 ? points[points.length - 1].y + 12 : 24;
  const pathRef = useRef<SVGPathElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const [spark, setSpark] = useState<{ x: number; y: number } | null>(null);
  const [highlightLessonId, setHighlightLessonId] = useState<number | null>(null);
  const [particles, setParticles] = useState<Particle[]>([]);

  const currentLessonId = useMemo(
    () =>
      unit.nodes
        .filter((node) => node.lesson)
        .map((node) => node.lesson)
        .find((lesson) => lesson && lesson.unlocked && !lesson.completed)?.id,
    [unit.nodes],
  );

  useEffect(() => {
    if (!unlockAnimation || unlockAnimation.unitId !== unit.id) return;
    const fromIndex = unit.nodes.findIndex((node) => node.lesson?.id === unlockAnimation.fromLessonId);
    const toIndex = unit.nodes.findIndex((node) => node.lesson?.id === unlockAnimation.toLessonId);
    if (fromIndex < 0 || toIndex < 0) return;

    const emitParticles = (toPoint: Point) => {
      const next: Particle[] = Array.from({ length: 8 }, (_, index) => ({
        id: `${unit.id}-p-${index}-${Date.now()}`,
        x: toPoint.x,
        y: toPoint.y,
        dx: (Math.random() - 0.5) * 14,
        dy: -8 - Math.random() * 8,
        size: 3 + Math.random() * 3,
        delay: Math.random() * 100,
      }));
      setParticles(next);
      window.setTimeout(() => setParticles([]), 700);
    };

    const toPoint = points[toIndex];
    if (!toPoint) return;

    if (reducedMotion) {
      setHighlightLessonId(unlockAnimation.toLessonId);
      emitParticles(toPoint);
      onUnlockDone("Desbloqueado!");
      return;
    }

    const pathEl = pathRef.current;
    if (!pathEl) return;
    const total = pathEl.getTotalLength();
    const startLen = (fromIndex / Math.max(1, unit.nodes.length - 1)) * total;
    const endLen = (toIndex / Math.max(1, unit.nodes.length - 1)) * total;
    const duration = 900;
    const startedAt = performance.now();
    playSfx("/sfx/unlock-sparkle.ogg", soundEnabled);

    const tick = (now: number) => {
      const elapsed = Math.max(0, now - startedAt);
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - (1 - progress) * (1 - progress);
      const currentLen = startLen + (endLen - startLen) * eased;
      const p = pathEl.getPointAtLength(currentLen);
      setSpark({ x: p.x, y: p.y });
      if (progress >= 1) {
        setSpark(null);
        setHighlightLessonId(unlockAnimation.toLessonId);
        emitParticles(toPoint);
        onUnlockDone("Desbloqueado!");
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [onUnlockDone, pathRef, points, reducedMotion, soundEnabled, unit.id, unit.nodes, unlockAnimation]);

  return (
    <div className="space-y-3">
      <article className="relative overflow-hidden rounded-3xl border border-border bg-[linear-gradient(120deg,rgba(255,255,255,0.98),rgba(240,248,255,0.95))] p-4 shadow-[0_2px_0_rgba(184,200,239,0.65)]">
        <svg className="pointer-events-none absolute -right-6 -top-4 h-20 w-20 opacity-30" viewBox="0 0 120 120" aria-hidden>
          <path d="M12 72 C30 26, 92 22, 108 70 C90 88, 38 98, 12 72 Z" fill="#5EEAD4" />
        </svg>
        <p className="text-sm font-extrabold text-foreground">{unit.title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{unit.description}</p>
        <div className="mt-2">
          <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Região concluída</span>
            <span>{Math.round(unit.completionRate * 100)}%</span>
          </div>
          <ProgressBar value={Math.round(unit.completionRate * 100)} tone="secondary" />
        </div>
      </article>

      <div className="relative w-full" style={{ height: `${Math.max(24, unit.nodes.length * 5.4)}rem` }}>
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 100 ${viewHeight}`} preserveAspectRatio="none" aria-hidden>
          <defs>
            <linearGradient id={`trail-${unit.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#8DD9FF" />
              <stop offset="100%" stopColor="#2DD4BF" />
            </linearGradient>
            <filter id={`spark-glow-${unit.id}`} x="-200%" y="-200%" width="400%" height="400%">
              <feGaussianBlur stdDeviation="1.8" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <path ref={pathRef} d={path} fill="none" stroke="rgba(180,205,240,0.7)" strokeWidth="3.4" strokeLinecap="round" />
          <path d={path} fill="none" stroke={`url(#trail-${unit.id})`} strokeWidth="4.2" strokeLinecap="round" strokeDasharray={1} strokeDashoffset={1 - unit.completionRate} pathLength={1} />
          {spark ? <circle cx={spark.x} cy={spark.y} r="2.8" fill="#FFD166" filter={`url(#spark-glow-${unit.id})`} /> : null}
        </svg>

        {unit.nodes.map((node, index) => {
          const point = points[index];
          if (!point) return null;
          const top = (point.y / viewHeight) * 100;
          const left = point.x;
          const lesson = node.lesson;
          const event = node.event;
          const isRareEvent = Boolean(event && (event.rarity === "RARE" || event.rarity === "EPIC"));
          const chestIdle = Boolean(event && event.type === "CHEST");
          return (
            <div
              key={`${node.kind}-${node.orderIndex}-${lesson?.id ?? event?.id}`}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${left}%`, top: `${top}%` }}
            >
              <button
                type="button"
                className={cn(
                  "node-hover inline-flex h-16 w-16 items-center justify-center rounded-full border-4 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2",
                  lesson
                    ? lessonNodeClass(lesson.completed, lesson.id === currentLessonId, lesson.unlocked)
                    : event
                      ? eventNodeClass(event)
                      : "border-border bg-white",
                  event?.type === "MINI_BOSS" && event.status === "AVAILABLE" ? "mini-boss-aura h-18 w-18" : "",
                  isRareEvent ? "rare-shimmer" : "",
                  chestIdle ? "chest-idle" : "",
                  highlightLessonId === lesson?.id ? "unlock-pop unlock-glow" : "",
                  lesson?.completed ? "completed-check-pulse" : "",
                )}
                onClick={() => onOpenNode(node)}
              >
                {lesson ? (
                  lesson.completed ? <CheckCircle2 className="h-5 w-5" /> : lesson.unlocked ? <BookOpen className="h-5 w-5" /> : <Lock className="h-5 w-5 locked-fade" />
                ) : event ? (
                  eventIcon(event)
                ) : null}
              </button>
              <p className="mt-1 w-24 -translate-x-2 text-center text-[11px] font-semibold text-foreground">
                {lesson ? lesson.title : event?.title}
              </p>
            </div>
          );
        })}

        {particles.map((particle) => (
          <span
            key={particle.id}
            className="unlock-particle absolute rounded-full bg-amber-300"
            style={{
              left: `${particle.x}%`,
              top: `${(particle.y / viewHeight) * 100}%`,
              width: `${particle.size}px`,
              height: `${particle.size}px`,
              ["--dx" as string]: `${particle.dx}px`,
              ["--dy" as string]: `${particle.dy}px`,
              animationDelay: `${particle.delay}ms`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

export default function ChildAprenderPage() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [path, setPath] = useState<LearningPathResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<LearningPathNode | null>(null);
  const [eventStartPayload, setEventStartPayload] = useState<Record<string, unknown> | null>(null);
  const [eventComplete, setEventComplete] = useState<LearningEventCompleteResponse | null>(null);
  const [modalLoading, setModalLoading] = useState<"start" | "complete" | null>(null);
  const [uxSettings, setUxSettings] = useState<UserUXSettings>(UX_SETTINGS_FALLBACK);
  const [unlockAnimation, setUnlockAnimation] = useState<UnlockAnimation | null>(null);
  const [unlockToast, setUnlockToast] = useState<string | null>(null);
  const [missions, setMissions] = useState<MissionsCurrentResponse | null>(null);
  const [seasonal, setSeasonal] = useState<ActiveSeasonEventsResponse | null>(null);
  const [calendar, setCalendar] = useState<{
    month: number;
    year: number;
    currentStreak: number;
    longestStreak: number;
    days: Record<string, { streak: boolean; perfect: boolean; mission: boolean }>;
  } | null>(null);
  const [missionToast, setMissionToast] = useState<string | null>(null);

  const reducedMotion = effectiveReducedMotion(uxSettings);

  const loadPath = async () => {
    try {
      setLoading(true);
      const data = await getLearningPath();
      setPath(data);
      setError(null);
    } catch (err: unknown) {
      const message = err instanceof ApiError ? getApiErrorMessage(err, "Nao foi possivel carregar a trilha.") : "Nao foi possivel carregar a trilha.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const loadRetention = async () => {
    const now = new Date();
    const [missionsRes, seasonalRes, calendarRes] = await Promise.all([
      getCurrentMissions(),
      getActiveSeasonEvents(),
      getCalendarActivity({ month: now.getMonth() + 1, year: now.getFullYear() }),
    ]);
    setMissions(missionsRes);
    setSeasonal(seasonalRes);
    const daysMap = Object.fromEntries(
      calendarRes.days.map((day) => [
        day.date,
        {
          streak: day.streakMaintained,
          perfect: day.perfectSessions > 0,
          mission: day.missionsCompleted > 0,
        },
      ]),
    );
    setCalendar({
      month: calendarRes.month,
      year: calendarRes.year,
      currentStreak: calendarRes.currentStreak,
      longestStreak: calendarRes.longestStreak,
      days: daysMap,
    });
  };

  useEffect(() => {
    void loadPath();
    void loadRetention().catch(() => {
      // keep core path usable even if retention endpoints fail
    });
    void fetchUXSettings().then(setUxSettings);
  }, []);

  useEffect(() => {
    if (!path) return;
    const completedLessonId = Number(search.get("completedLessonId"));
    if (!Number.isFinite(completedLessonId) || completedLessonId <= 0) return;

    for (const unit of path.units) {
      const lessonNodes = unit.nodes.filter((node) => node.lesson);
      const completedIndex = lessonNodes.findIndex((node) => node.lesson?.id === completedLessonId);
      if (completedIndex < 0) continue;
      const next = lessonNodes.slice(completedIndex + 1).find((node) => node.lesson && node.lesson.unlocked && !node.lesson.completed);
      if (next?.lesson) {
        setUnlockAnimation({
          unitId: unit.id,
          fromLessonId: completedLessonId,
          toLessonId: next.lesson.id,
          key: `${completedLessonId}-${next.lesson.id}`,
        });
      } else {
        setUnlockToast("Desbloqueado!");
      }
      playSfx("/sfx/completion-chime.ogg", uxSettings.soundEnabled);
      hapticCompletion(uxSettings);
      router.replace(pathname, { scroll: false });
      break;
    }
  }, [path, pathname, router, search, uxSettings]);

  useEffect(() => {
    if (!unlockToast) return;
    const timer = window.setTimeout(() => setUnlockToast(null), 1900);
    return () => window.clearTimeout(timer);
  }, [unlockToast]);

  useEffect(() => {
    if (!missionToast) return;
    const timer = window.setTimeout(() => setMissionToast(null), 2200);
    return () => window.clearTimeout(timer);
  }, [missionToast]);

  const lessons = useMemo(
    () =>
      (path?.units ?? [])
        .flatMap((unit) => unit.nodes)
        .filter((node) => node.lesson)
        .map((node) => node.lesson),
    [path],
  );
  const completedLessons = lessons.filter((lesson) => lesson?.completed).length;
  const completionPercent = lessons.length > 0 ? Math.round((completedLessons / lessons.length) * 100) : 0;
  const calendarDaysCount = calendar ? daysInMonth(calendar.month, calendar.year) : 0;
  const calendarGrid = useMemo(
    () => Array.from({ length: calendarDaysCount }, (_, index) => index + 1),
    [calendarDaysCount],
  );
  const activeSeason = seasonal?.active[0] ?? null;

  const onOpenNode = (node: LearningPathNode) => {
    hapticPress(uxSettings);
    playSfx("/sfx/node-pop.ogg", uxSettings.soundEnabled);
    if (node.lesson) {
      if (!node.lesson.unlocked) return;
      router.push(`/child/aprender/lesson/${node.lesson.id}`);
      return;
    }
    setSelectedNode(node);
    setEventStartPayload(null);
    setEventComplete(null);
  };

  const onStartEvent = async () => {
    if (!selectedNode?.event) return;
    setModalLoading("start");
    try {
      const response = await startLearningPathEvent(selectedNode.event.id);
      setEventStartPayload(response.payload);
    } catch (err: unknown) {
      const message = err instanceof ApiError ? getApiErrorMessage(err, "Evento bloqueado no momento.") : "Evento bloqueado no momento.";
      setError(message);
    } finally {
      setModalLoading(null);
    }
  };

  const onCompleteEvent = async () => {
    if (!selectedNode?.event) return;
    setModalLoading("complete");
    try {
      const summary = {
        score: selectedNode.event.type === "MINI_BOSS" ? 80 : 100,
        completedAt: new Date().toISOString(),
      };
      const response = await completeLearningPathEvent({
        eventId: selectedNode.event.id,
        resultSummary: summary,
      });
      setEventComplete(response);
      if (response.passed) {
        playSfx("/sfx/completion-chime.ogg", uxSettings.soundEnabled);
        hapticCompletion(uxSettings);
      }
      await Promise.all([loadPath(), loadRetention().catch(() => undefined)]);
    } catch (err: unknown) {
      const message = err instanceof ApiError ? getApiErrorMessage(err, "Nao foi possivel concluir o evento.") : "Nao foi possivel concluir o evento.";
      setError(message);
    } finally {
      setModalLoading(null);
    }
  };

  const onClaimMission = async (missionId: string) => {
    try {
      const response = await claimMission(missionId);
      if (response.rewardGranted && (response.xpReward > 0 || response.coinReward > 0)) {
        setMissionToast(`Missao concluida! +${response.xpReward} XP e +${response.coinReward} moedas`);
        playSfx("/sfx/completion-chime.ogg", uxSettings.soundEnabled);
        hapticCompletion(uxSettings);
      }
      await loadRetention();
    } catch (err: unknown) {
      const message = err instanceof ApiError ? getApiErrorMessage(err, "Nao foi possivel resgatar a missao.") : "Nao foi possivel resgatar a missao.";
      setError(message);
    }
  };

  const updateUx = async (patch: Partial<UserUXSettings>) => {
    const next = {
      soundEnabled: patch.soundEnabled ?? uxSettings.soundEnabled,
      hapticsEnabled: patch.hapticsEnabled ?? uxSettings.hapticsEnabled,
      reducedMotion: patch.reducedMotion ?? uxSettings.reducedMotion,
    };
    setUxSettings((prev) => ({ ...prev, ...next }));
    try {
      const persisted = await saveUXSettings(next);
      setUxSettings(persisted);
    } catch {
      // keep optimistic state
    }
  };

  return (
    <>
      <main className={cn("safe-px safe-pb mx-auto min-h-screen w-full max-w-md p-4 pb-52 md:max-w-2xl md:p-6 md:pb-40", activeSeason?.themeKey === "halloween" ? "bg-[radial-gradient(circle_at_88%_2%,rgba(120,53,15,0.2),transparent_44%)]" : "")}>
        <Card className="mb-4 overflow-hidden border-border bg-[radial-gradient(circle_at_82%_14%,rgba(45,212,191,0.22),transparent_46%),linear-gradient(180deg,#ffffff_0%,#f3fbff_100%)] shadow-[0_2px_0_rgba(184,200,239,0.7),0_14px_28px_rgba(34,63,107,0.12)]">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Aprender - Mapa de Aventura</CardTitle>
              <span className="inline-flex items-center gap-1 rounded-full border border-accent/35 bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent-foreground">
                <Flame className="h-3.5 w-3.5 text-accent" />
                {path?.streakDays ?? 0} dias
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center gap-1">
              <Button size="sm" variant="secondary" className="h-8 px-2.5 text-xs" onClick={() => void updateUx({ soundEnabled: !uxSettings.soundEnabled })}>
                {uxSettings.soundEnabled ? <Volume2 className="mr-1 h-3.5 w-3.5" /> : <VolumeX className="mr-1 h-3.5 w-3.5" />}
                Som
              </Button>
              <Button size="sm" variant="secondary" className="h-8 px-2.5 text-xs" onClick={() => void updateUx({ hapticsEnabled: !uxSettings.hapticsEnabled })}>
                Haptics {uxSettings.hapticsEnabled ? "on" : "off"}
              </Button>
              <Button size="sm" variant="secondary" className="h-8 px-2.5 text-xs" onClick={() => void updateUx({ reducedMotion: !uxSettings.reducedMotion })}>
                Movimento {uxSettings.reducedMotion ? "reduzido" : "normal"}
              </Button>
            </div>
            <p className="text-muted-foreground">Explore regiões, cumpra eventos e avance na trilha do tesouro.</p>
            <div className="rounded-2xl border border-border bg-white/90 p-3">
              <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>Progresso total</span>
                <span>{completionPercent}%</span>
              </div>
              <ProgressBar value={completionPercent} tone="secondary" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-border bg-white/90 p-2 text-center">
                <p className="text-[11px] text-muted-foreground">Revisões</p>
                <p className="text-sm font-bold text-primary">{path?.dueReviewsCount ?? 0}</p>
              </div>
              <div className="rounded-xl border border-border bg-white/90 p-2 text-center">
                <p className="text-[11px] text-muted-foreground">Mastery médio</p>
                <p className="text-sm font-bold text-secondary">{Math.round((path?.masteryAverage ?? 0) * 100)}%</p>
              </div>
              <div className="rounded-xl border border-border bg-white/90 p-2 text-center">
                <p className="text-[11px] text-muted-foreground">Matéria</p>
                <p className="text-sm font-bold text-foreground">{path?.subjectName ?? "--"}</p>
              </div>
            </div>
            {missions?.almostThere ? (
              <div className="rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-xs font-semibold text-accent-foreground">Missao quase la! Continue com esse ritmo.</div>
            ) : null}
            {missions?.showNudge && !missions.almostThere ? (
              <div className="rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary">{missions.nudgeMessage}</div>
            ) : null}
            {missions?.upcomingSeasonalEvent ? (
              <div className="rounded-xl border border-secondary/30 bg-secondary/10 px-3 py-2 text-xs text-secondary">
                Proximo evento: <span className="font-semibold">{missions.upcomingSeasonalEvent.name}</span> em {Math.max(0, missions.upcomingSeasonalEvent.startsInDays)} dia(s).
              </div>
            ) : null}
            {activeSeason ? (
              <div className="rounded-xl border border-secondary/30 bg-secondary/10 px-3 py-2 text-xs text-secondary">
                Temporada ativa: <span className="font-semibold">{activeSeason.name}</span> · XP x{activeSeason.bonusXpMultiplier.toFixed(2)} · moedas x{activeSeason.bonusCoinMultiplier.toFixed(2)}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="mb-4 grid gap-3 md:grid-cols-2">
          <Card className="border-border bg-white/95">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Missoes da Semana</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(missions?.missions ?? []).slice(0, 5).map((mission) => (
                <div key={mission.missionId} className="rounded-xl border border-border bg-muted/40 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-foreground">{mission.title}</p>
                    <span className="text-[10px] text-muted-foreground">{missionTypeLabel(mission.missionType)}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">{mission.description}</p>
                  <div className="mt-2">
                    <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>
                        {mission.currentValue}/{mission.targetValue}
                      </span>
                      <span>{Math.round(mission.progressPercent)}%</span>
                    </div>
                    <ProgressBar value={Math.round(mission.progressPercent)} tone={mission.completed ? "secondary" : "primary"} />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Star className="h-3 w-3" /> +{mission.xpReward} XP</span>
                    <span className="inline-flex items-center gap-1"><Coins className="h-3 w-3" /> +{mission.coinReward}</span>
                    {mission.completed && !mission.rewardGranted ? (
                      <Button size="sm" className="h-6 px-2 text-[10px]" onClick={() => void onClaimMission(mission.missionId)}>Resgatar</Button>
                    ) : null}
                  </div>
                </div>
              ))}
              {!missions || missions.missions.length === 0 ? <p className="text-xs text-muted-foreground">Carregando missoes...</p> : null}
            </CardContent>
          </Card>

          <Card className="border-border bg-white/95">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Calendario de Constancia</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>Atual: {calendar?.currentStreak ?? 0} dias</span>
                <span>Recorde: {calendar?.longestStreak ?? 0}</span>
              </div>
              <div className="grid grid-cols-7 gap-1">
                {calendarGrid.map((day) => {
                  const key = calendar ? `${calendar.year}-${String(calendar.month).padStart(2, "0")}-${String(day).padStart(2, "0")}` : "";
                  const marker = key ? calendar?.days[key] : undefined;
                  return (
                    <div key={day} className="flex h-9 flex-col items-center justify-center rounded-md border border-border bg-muted/40 text-[10px]">
                      <span>{day}</span>
                      <span className="flex items-center gap-0.5">
                        {marker?.streak ? <Flame className="h-2.5 w-2.5 text-accent" /> : null}
                        {marker?.perfect ? <Star className="h-2.5 w-2.5 text-amber-500" /> : null}
                        {marker?.mission ? <Coins className="h-2.5 w-2.5 text-secondary" /> : null}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {loading ? <Card><CardContent className="p-6 text-sm text-muted-foreground">Carregando mapa...</CardContent></Card> : null}
        {error ? <Card><CardContent className="p-6 text-sm text-muted-foreground">{error}</CardContent></Card> : null}

        <section className="relative space-y-5 pb-24">
          <svg className="pointer-events-none absolute -left-4 top-6 h-20 w-20 opacity-25" viewBox="0 0 160 120" aria-hidden>
            <path d="M10 90 Q45 20 90 50 Q120 70 150 40" fill="none" stroke="#5EEAD4" strokeWidth="8" strokeLinecap="round" />
          </svg>
          <svg className="pointer-events-none absolute -right-4 top-60 h-24 w-24 opacity-20" viewBox="0 0 160 140" aria-hidden>
            <path d="M40 120 C20 70, 40 20, 90 20 C130 20, 150 55, 130 90 C115 115, 75 130, 40 120 Z" fill="#60A5FA" />
          </svg>
          {(path?.units ?? []).map((unit) => (
            <UnitPath
              key={unit.id}
              unit={unit}
              onOpenNode={onOpenNode}
              unlockAnimation={unlockAnimation}
              reducedMotion={reducedMotion}
              soundEnabled={uxSettings.soundEnabled}
              onUnlockDone={(toast) => {
                setUnlockToast(toast);
                setUnlockAnimation(null);
              }}
            />
          ))}
        </section>

        <ChildBottomNav />
      </main>

      {unlockToast ? (
        <div className="pointer-events-none fixed bottom-24 left-1/2 z-[60] -translate-x-1/2 rounded-full border border-secondary/30 bg-secondary px-3 py-1 text-xs font-bold text-white shadow-[0_8px_20px_rgba(14,165,164,0.34)]">
          {unlockToast}
        </div>
      ) : null}
      {missionToast ? (
        <div className="pointer-events-none fixed bottom-36 left-1/2 z-[60] -translate-x-1/2 rounded-full border border-primary/30 bg-primary px-3 py-1 text-xs font-bold text-white shadow-[0_8px_20px_rgba(29,78,216,0.34)]">
          {missionToast}
        </div>
      ) : null}

      {selectedNode?.event ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-4 md:items-center" onClick={() => setSelectedNode(null)}>
          <div className="w-full max-w-md rounded-3xl border border-border bg-white p-5 shadow-[0_24px_60px_rgba(13,25,41,0.32)]" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <p className="text-lg font-extrabold text-foreground">{selectedNode.event.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{selectedNode.event.description}</p>
            <p className="mt-2 inline-flex rounded-full border border-border bg-muted/50 px-2 py-1 text-xs font-semibold text-muted-foreground">
              <Trophy className="mr-1 h-3.5 w-3.5" />
              {selectedNode.event.type} · {selectedNode.event.rarity}
            </p>

            <div className="mt-3 rounded-2xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              <p className="font-semibold text-foreground">Regras / recompensas</p>
              <pre className="mt-1 whitespace-pre-wrap">{JSON.stringify(selectedNode.event.rules, null, 2)}</pre>
            </div>

            {eventStartPayload ? (
              <div className="mt-2 rounded-xl border border-primary/25 bg-primary/10 px-3 py-2 text-xs text-primary">
                Iniciado: {JSON.stringify(eventStartPayload)}
              </div>
            ) : null}

            {eventComplete ? (
              <div className={cn("mt-2 rounded-xl border px-3 py-2 text-xs", eventComplete.passed ? "border-secondary/30 bg-secondary/10 text-secondary" : "border-accent/30 bg-accent/10 text-accent-foreground")}>
                {eventComplete.passed ? (
                  <p className="inline-flex items-center gap-1 font-semibold">
                    <CheckCircle2 className="h-4 w-4" />
                    Evento concluído! Recompensas: {JSON.stringify(eventComplete.rewards)}
                  </p>
                ) : (
                  <p className="inline-flex items-center gap-1 font-semibold">
                    <XCircle className="h-4 w-4" />
                    Precisa tentar novamente para liberar a passagem.
                  </p>
                )}
              </div>
            ) : null}

            <div className="mt-5 flex gap-2">
              <Button variant="secondary" className="w-full" onClick={() => setSelectedNode(null)}>
                Fechar
              </Button>
              <Button className="w-full" disabled={modalLoading !== null || selectedNode.event.status === "LOCKED"} onClick={() => void onStartEvent()}>
                {modalLoading === "start" ? "Iniciando..." : "Iniciar"}
              </Button>
              <Button className="w-full" disabled={modalLoading !== null || selectedNode.event.status === "LOCKED"} onClick={() => void onCompleteEvent()}>
                {modalLoading === "complete" ? "Concluindo..." : "Concluir"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <style jsx global>{`
        @keyframes node-pulse {
          0%,
          100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.06);
          }
        }
        @keyframes unlock-pop {
          0% {
            transform: scale(0.9);
          }
          60% {
            transform: scale(1.08);
          }
          100% {
            transform: scale(1);
          }
        }
        @keyframes unlock-particle {
          0% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.7);
          }
          20% {
            opacity: 0.95;
          }
          100% {
            opacity: 0;
            transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(1);
          }
        }
        @keyframes rare-shimmer {
          0% {
            box-shadow: 0 0 0 rgba(255, 255, 255, 0);
          }
          50% {
            box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.1);
          }
          100% {
            box-shadow: 0 0 0 rgba(255, 255, 255, 0);
          }
        }
        @keyframes chest-idle {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-3px);
          }
        }
        @keyframes completed-check-pulse {
          0% {
            filter: brightness(1);
          }
          50% {
            filter: brightness(1.18);
          }
          100% {
            filter: brightness(1);
          }
        }
        .node-current {
          animation: node-pulse 2.2s ease-in-out infinite;
        }
        .node-hover:hover {
          transform: scale(1.02);
          box-shadow: 0 10px 20px rgba(32, 63, 109, 0.16);
        }
        .unlock-pop {
          animation: unlock-pop 540ms ease-out;
        }
        .unlock-glow {
          box-shadow: 0 0 0 2px rgba(45, 212, 191, 0.3), 0 0 22px rgba(45, 212, 191, 0.28);
        }
        .unlock-particle {
          animation: unlock-particle 520ms ease-out forwards;
        }
        .rare-shimmer {
          animation: rare-shimmer 4.6s ease-in-out infinite;
        }
        .chest-idle {
          animation: chest-idle 6s ease-in-out infinite;
        }
        .completed-check-pulse {
          animation: completed-check-pulse 680ms ease-out;
        }
        .locked-fade {
          opacity: 0.82;
          transition: opacity 260ms ease;
        }
        .mini-boss-aura {
          box-shadow: 0 0 0 0 rgba(255, 107, 61, 0.52), 0 0 0 12px rgba(255, 107, 61, 0.12);
        }
        @media (prefers-reduced-motion: reduce) {
          .node-current,
          .rare-shimmer,
          .chest-idle,
          .completed-check-pulse {
            animation: none;
          }
          .node-hover:hover {
            transform: none;
            box-shadow: none;
          }
        }
      `}</style>
    </>
  );
}

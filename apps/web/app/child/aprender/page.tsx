"use client";

import Image from "next/image";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
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
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ChildBottomNav } from "@/components/child-bottom-nav";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import {
  ApiError,
  claimMission,
  completeLearningPathEvent,
  getActiveSeasonEvents,
  getApiErrorMessage,
  getAprenderSubjects,
  getAxionBrief,
  getCalendarActivity,
  getCurrentMissions,
  getLearningPath,
  startLearningPathEvent,
  type ActiveSeasonEventsResponse,
  type AprenderSubjectOption,
  type LearningEventCompleteResponse,
  type LearningPathEventNode,
  type LearningPathLessonNode,
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
  if (kind === "LESSONS_COMPLETED") return "Lições";
  if (kind === "XP_GAINED") return "XP";
  if (kind === "PERFECT_SCORES") return "3 estrelas";
  if (kind === "STREAK_DAYS") return "Sequência";
  if (kind === "MINI_BOSS_WINS") return "Mini-boss";
  return kind;
}

function estimateLessonMinutes(lesson: LearningPathLessonNode): number {
  const baseByOrder = [2, 2, 3, 3, 4, 4];
  const base = baseByOrder[Math.max(0, Math.min(baseByOrder.length - 1, lesson.order - 1))] ?? 3;
  const xpFactor = lesson.xpReward >= 40 ? 1 : lesson.xpReward >= 32 ? 0.5 : 0;
  return Math.max(2, Math.round(base + xpFactor));
}

function buildCoachTip(params: { streakDays: number; dueReviews: number; completionPercent: number; subjectName: string | null }): string {
  const { streakDays, dueReviews, completionPercent, subjectName } = params;
  if (dueReviews > 8) return "Tem revisões esperando por você. Uma por vez e o caminho fica livre rapidinho.";
  if (completionPercent >= 70) return "Você está perto de fechar esta região. Mais uma missão e vai desbloquear novidades.";
  if (streakDays >= 5) return `Que constância linda! Continue em ${subjectName ?? "Aprender"} para manter o ritmo.`;
  if (streakDays === 0) return "Vamos reacender sua sequência com uma lição curtinha hoje?";
  return "Cada lição concluída deixa sua trilha mais forte. Continue nesse ritmo.";
}

function normalizePathErrorMessage(message: string): string {
  const value = (message ?? "").trim().toLowerCase();
  if (!value) return "Não foi possível carregar a trilha.";
  if (value.includes("no subject available")) return "Nenhuma matéria disponível para este perfil no momento.";
  if (value.includes("subject not available")) return "Nenhuma matéria disponível para este perfil no momento.";
  if (value.includes("trilha de aprendizado ainda não configurada")) {
    return "A trilha ainda está sendo preparada para este perfil. Tente novamente em instantes.";
  }
  return message;
}

const GENERIC_SUBJECT_NAMES = new Set(["aprender", "geral", "padrao", "default", "trilha"]);

function normalizeSubjectName(value: string | null | undefined): string {
  if (!value) return "";
  const normalized = value.trim().toLowerCase();
  const replacements: Record<string, string> = {
    á: "a",
    à: "a",
    â: "a",
    ã: "a",
    é: "e",
    ê: "e",
    í: "i",
    ó: "o",
    ô: "o",
    õ: "o",
    ú: "u",
    ç: "c",
  };
  return Object.entries(replacements).reduce((acc, [from, to]) => acc.replaceAll(from, to), normalized);
}

function isGenericSubjectName(value: string | null | undefined): boolean {
  return GENERIC_SUBJECT_NAMES.has(normalizeSubjectName(value));
}

function LearningPathSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="rounded-3xl border border-border bg-white/80 p-4">
        <div className="h-4 w-44 rounded bg-slate-200" />
        <div className="mt-2 h-3 w-64 rounded bg-slate-200" />
        <div className="mt-3 h-2.5 w-full rounded bg-slate-200" />
      </div>
      <div className="relative h-[28rem] overflow-hidden rounded-3xl border border-border bg-white/65">
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 120" preserveAspectRatio="none" aria-hidden>
          <path d="M 25 10 C 25 22, 75 22, 75 34 C 75 46, 25 46, 25 58 C 25 70, 75 70, 75 82 C 75 94, 25 94, 25 106" fill="none" stroke="rgba(191,205,226,0.9)" strokeWidth="4" strokeLinecap="round" />
        </svg>
        <div className="absolute left-[22%] top-[9%] h-14 w-14 rounded-full bg-slate-200" />
        <div className="absolute left-[68%] top-[27%] h-14 w-14 rounded-full bg-slate-200" />
        <div className="absolute left-[22%] top-[46%] h-14 w-14 rounded-full bg-slate-200" />
        <div className="absolute left-[68%] top-[64%] h-14 w-14 rounded-full bg-slate-200" />
        <div className="absolute left-[22%] top-[83%] h-14 w-14 rounded-full bg-slate-200" />
      </div>
    </div>
  );
}

function daysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate();
}

const WEEKDAY_SHORT = ["D", "S", "T", "Q", "Q", "S", "S"] as const;
const APRENDER_SUBJECT_STORAGE_KEY = "axiora_aprender_subject";

function subjectPreferenceKey(childId: number | null): string {
  if (childId && Number.isFinite(childId) && childId > 0) return `${APRENDER_SUBJECT_STORAGE_KEY}_${childId}`;
  return APRENDER_SUBJECT_STORAGE_KEY;
}

function buildSerpentinePoints(count: number): Point[] {
  if (count <= 0) return [];
  const center = 50;
  const swing = 24;
  const top = 10;
  const step = 23;
  return Array.from({ length: count }, (_, index) => {
    const side = index % 2 === 0 ? -1 : 1;
    const organic = 0.8 + Math.sin((index + 1) * 0.7) * 0.2;
    return { x: center + side * swing * organic, y: top + index * step };
  });
}

function compactNodeLabel(node: LearningPathNode): string {
  if (node.lesson) return `Lição ${node.lesson.order}`;
  if (!node.event) return "";
  if (node.event.type === "CHECKPOINT") return "Checkpoint";
  if (node.event.type === "MINI_BOSS") return "Mini-boss";
  if (node.event.type === "STORY_STOP") return "Parada narrativa";
  if (node.event.type === "REVIEW_GATE") return "Portal";
  if (node.event.type === "CHEST") return "Baú";
  if (node.event.type === "BOOST") return "Turbo";
  return node.event.title;
}

function mobileFriendlyNodeLabel(node: LearningPathNode): string {
  const base = compactNodeLabel(node);
  if (node.lesson) return base;
  const normalized = base.trim().toLowerCase();
  if (normalized === "parada narrativa") return "Parada narrativa";
  if (normalized === "mini-boss") return "Mini-boss";
  if (normalized === "checkpoint") return "Checkpoint";
  if (normalized.length > 13) return `${base.slice(0, 11).trim()}.`;
  return base;
}

function eventFriendlyDetails(event: LearningPathEventNode): { objective: string; reward: string; hint: string } {
  if (event.type === "BOOST") {
    return {
      objective: "Mantenha sua sequência de estudos para ativar este turbo.",
      reward: "Quando ativar, você ganha mais XP por tempo limitado.",
      hint: "Complete uma lição por dia para chegar lá mais rápido.",
    };
  }
  if (event.type === "CHEST") {
    return {
      objective: "Abra o baú surpresa ao avançar na trilha.",
      reward: "Você pode ganhar moedas e itens especiais.",
      hint: "Continue concluindo lições para encontrar mais baús.",
    };
  }
  if (event.type === "CHECKPOINT") {
    return {
      objective: "Revise o que aprendeu em um desafio curtinho.",
      reward: "Você fortalece suas habilidades e ganha recompensas.",
      hint: "Respire fundo, leia com calma e vá passo a passo.",
    };
  }
  if (event.type === "MINI_BOSS") {
    return {
      objective: "Encare um mini desafio final da unidade.",
      reward: "Se mandar bem, libera o próximo trecho do mapa.",
      hint: "Use suas melhores estratégias e tente novamente se precisar.",
    };
  }
  if (event.type === "REVIEW_GATE") {
    return {
      objective: "Conclua suas revisões pendentes para seguir viagem.",
      reward: "Com revisão feita, o caminho fica livre novamente.",
      hint: "Uma revisão por vez: você consegue!",
    };
  }
  return {
    objective: "Participe desta parada especial da aventura.",
    reward: "Ganhe progresso e recompensas no seu ritmo.",
    hint: "Cada tentativa ajuda você a evoluir.",
  };
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
  if (event.status === "COMPLETED") return "border-[#2BB09A]/70 bg-[#4DD9C0] text-white shadow-[0_10px_22px_rgba(45,212,191,0.35)]";
  if (event.status === "LOCKED") return "locked-node border-slate-300 bg-slate-300/85 text-slate-600";
  if (event.type === "MINI_BOSS") return "border-accent/55 bg-accent text-white shadow-[0_14px_30px_rgba(255,107,61,0.48)]";
  if (event.type === "CHEST") return "border-amber-300/70 bg-amber-400 text-amber-950 shadow-[0_10px_24px_rgba(245,166,35,0.4)]";
  if (event.type === "BOOST") return "border-sky-300/70 bg-sky-500 text-white shadow-[0_10px_24px_rgba(56,189,248,0.35)]";
  if (event.type === "REVIEW_GATE") return "border-rose-400/55 bg-rose-500 text-white";
  if (event.type === "CHECKPOINT") return "border-indigo-300/65 bg-indigo-500 text-white shadow-[0_10px_24px_rgba(99,102,241,0.33)]";
  return "border-primary/45 bg-primary text-white";
}

function lessonNodeClass(completed: boolean, current: boolean, unlocked: boolean): string {
  if (completed) return "border-[#2BB09A]/70 bg-[#4DD9C0] text-white shadow-[0_10px_22px_rgba(45,212,191,0.35)]";
  if (current) return "border-amber-300/80 bg-amber-400 text-slate-900 node-current shadow-[0_12px_28px_rgba(245,166,35,0.5)]";
  if (!unlocked) return "locked-node border-slate-300 bg-slate-300/85 text-slate-600";
  return "border-primary/45 bg-white text-primary shadow-[0_8px_18px_rgba(29,78,216,0.24)]";
}

function UnitPath({
  unit,
  onOpenNode,
  unlockAnimation,
  reducedMotion,
  soundEnabled,
  onUnlockDone,
  collapsed,
  onToggleCollapsed,
}: {
  unit: LearningPathUnit;
  onOpenNode: (node: LearningPathNode) => void;
  unlockAnimation: UnlockAnimation | null;
  reducedMotion: boolean;
  soundEnabled: boolean;
  onUnlockDone: (toast: string) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const points = useMemo(() => buildSerpentinePoints(unit.nodes.length), [unit.nodes.length]);
  const path = useMemo(() => buildBezier(points), [points]);
  const viewHeight = points.length > 0 ? points[points.length - 1].y + 12 : 24;
  const pathRef = useRef<SVGPathElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const [spark, setSpark] = useState<{ x: number; y: number } | null>(null);
  const [highlightLessonId, setHighlightLessonId] = useState<number | null>(null);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [trailLength, setTrailLength] = useState<number>(0);
  const [trailHead, setTrailHead] = useState<{ x: number; y: number } | null>(null);

  const currentLessonId = useMemo(
    () =>
      unit.nodes
        .filter((node) => node.lesson)
        .map((node) => node.lesson)
        .find((lesson) => lesson && lesson.unlocked && !lesson.completed)?.id,
    [unit.nodes],
  );
  const unitStars = useMemo(() => {
    const lessons = unit.nodes
      .filter((node) => node.lesson)
      .map((node) => node.lesson)
      .filter((lesson): lesson is NonNullable<typeof lesson> => Boolean(lesson));
    const earned = lessons.reduce((acc, lesson) => acc + Math.max(0, Math.min(3, lesson.starsEarned ?? 0)), 0);
    const total = lessons.length * 3;
    return { earned, total };
  }, [unit.nodes]);
  const trailProgressRatio = useMemo(() => {
    if (unit.nodes.length <= 1) return 0;
    const currentIndex = unit.nodes.findIndex((node) => node.lesson?.id === currentLessonId);
    if (currentIndex >= 0) {
      return Math.max(0, Math.min(1, currentIndex / (unit.nodes.length - 1)));
    }
    let lastCompletedIndex = -1;
    unit.nodes.forEach((node, index) => {
      const lessonDone = Boolean(node.lesson?.completed);
      const eventDone = Boolean(node.event?.status === "COMPLETED");
      if (lessonDone || eventDone) lastCompletedIndex = index;
    });
    if (lastCompletedIndex < 0) return 0;
    return Math.max(0, Math.min(1, lastCompletedIndex / (unit.nodes.length - 1)));
  }, [currentLessonId, unit.nodes]);

  useEffect(() => {
    const pathEl = pathRef.current;
    if (!pathEl) return;
    setTrailLength(pathEl.getTotalLength());
  }, [path, unit.nodes.length]);

  useEffect(() => {
    const pathEl = pathRef.current;
    if (reducedMotion || !pathEl || trailLength <= 0 || trailProgressRatio <= 0 || trailProgressRatio >= 1) {
      setTrailHead(null);
      return;
    }
    const p = pathEl.getPointAtLength(trailLength * trailProgressRatio);
    setTrailHead({ x: p.x, y: p.y });
  }, [reducedMotion, trailLength, trailProgressRatio]);

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
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] font-semibold text-muted-foreground">Estrelas da unidade</span>
          <span className="inline-flex items-center rounded-full border border-amber-300/40 bg-amber-100/65 px-2 py-0.5 text-[11px] font-extrabold text-amber-700">
            <Star className="mr-1 h-3.5 w-3.5 fill-amber-400 text-amber-500" />
            {unitStars.earned}/{unitStars.total}
          </span>
        </div>
        <div className="mt-3">
          <Button size="sm" variant="secondary" className="h-8 px-3 text-xs" onClick={onToggleCollapsed}>
            {collapsed ? "Expandir unidade" : "Recolher unidade"}
          </Button>
        </div>
      </article>

      {collapsed ? null : (
      <div className="relative w-full" style={{ height: `${Math.max(28, (viewHeight / 100) * 28)}rem` }}>
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 100 ${viewHeight}`} preserveAspectRatio="none" aria-hidden>
          <defs>
            <linearGradient id={`trail-${unit.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#5EEAD4" />
              <stop offset="100%" stopColor="#2BB09A" />
            </linearGradient>
            <filter id={`spark-glow-${unit.id}`} x="-200%" y="-200%" width="400%" height="400%">
              <feGaussianBlur stdDeviation="1.8" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id={`trail-head-glow-${unit.id}`} x="-300%" y="-300%" width="600%" height="600%">
              <feGaussianBlur stdDeviation="2.4" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <path
            ref={pathRef}
            d={path}
            fill="none"
            stroke="rgba(184,200,220,0.72)"
            strokeWidth="4.1"
            strokeLinecap="round"
          />
          <path
            d={path}
            fill="none"
            stroke={`url(#trail-${unit.id})`}
            strokeWidth="4.6"
            strokeLinecap="round"
            strokeDasharray={`${Math.max(0, trailLength * trailProgressRatio)} ${Math.max(1, trailLength)}`}
          />
          <path
            d={path}
            fill="none"
            stroke="rgba(255,255,255,0.33)"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeDasharray={`${Math.max(0, trailLength * trailProgressRatio)} ${Math.max(1, trailLength)}`}
          />
          {trailHead ? (
            <>
              <circle cx={trailHead.x} cy={trailHead.y} r="2.1" fill="#4DD9C0" opacity="0.9" filter={`url(#trail-head-glow-${unit.id})`} />
            </>
          ) : null}
          {spark ? <circle cx={spark.x} cy={spark.y} r="2.8" fill="#FFD166" filter={`url(#spark-glow-${unit.id})`} /> : null}
        </svg>

        {unit.nodes.map((node, index) => {
          const point = points[index];
          if (!point) return null;
          const top = (point.y / viewHeight) * 100;
          const left = point.x;
          const prevPoint = points[index - 1];
          const nextPoint = points[index + 1];
          const lesson = node.lesson;
          const event = node.event;
          const isRareEvent = Boolean(event && (event.rarity === "RARE" || event.rarity === "EPIC"));
          const chestIdle = Boolean(event && event.type === "CHEST");
          const isEventNode = Boolean(event);
          const labelSide: "left" | "right" = left <= 46
            ? "left"
            : left >= 54
              ? "right"
              : (nextPoint?.x ?? prevPoint?.x ?? 50) >= left
                ? "left"
                : "right";
          const labelOffsetPx = isEventNode ? 116 : 96;
          const isNearLeftEdge = left < 42;
          const isNearRightEdge = left > 58;
          const forceSide: "left" | "right" | null = isNearLeftEdge ? "right" : isNearRightEdge ? "left" : null;
          const safeSide = forceSide ?? labelSide;
          const lessonCompleted = Boolean(lesson?.completed);
          const lessonCurrent = Boolean(lesson?.id === currentLessonId);
          const lessonLocked = Boolean(lesson && !lesson.unlocked);
          const labelTone = lessonCompleted
            ? "border-[#2BB09A]/28 bg-[#E8FCF7] text-[#0E766A]"
            : lessonCurrent
              ? "border-amber-300/55 bg-amber-50 text-amber-800"
              : lessonLocked
                ? "border-slate-300/65 bg-slate-100 text-slate-500"
                : isEventNode
                  ? "border-primary/20 bg-[#EFF4FB] text-foreground/90"
                  : "border-primary/22 bg-white text-foreground";
          const xpTone = lessonCompleted
            ? "border-[#2BB09A]/28 bg-[#E8FCF7] text-[#0E766A]"
            : lessonCurrent
              ? "border-amber-300/55 bg-amber-50 text-amber-700"
              : "border-secondary/22 bg-[#EFFAF9] text-secondary/90";
          return (
            <div
              key={`${node.kind}-${node.orderIndex}-${lesson?.id ?? event?.id}`}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${left}%`, top: `${top}%` }}
            >
              <button
                type="button"
                aria-label={lesson ? `${compactNodeLabel(node)}${lesson.unlocked ? "" : " (bloqueada)"}` : event ? event.title : "Nó da trilha"}
                data-path-lesson-id={lesson?.id ?? undefined}
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
              <span
                aria-hidden
                className="pointer-events-none absolute top-1/2 h-[2px] w-5 -translate-y-1/2 rounded-full bg-slate-400/28"
                style={safeSide === "left" ? { right: `${labelOffsetPx - 16}px` } : { left: "64px" }}
              />
              <div
                className={cn(
                  "pointer-events-none absolute top-1/2 flex w-[120px] -translate-y-1/2 flex-col gap-0.5 sm:w-[126px]",
                  safeSide === "left" ? "items-end text-right" : "items-start text-left",
                )}
                style={safeSide === "left" ? { right: `${labelOffsetPx}px` } : { left: `${labelOffsetPx}px` }}
              >
                <p
                  className={cn(
                    "rounded-lg border px-2 py-1 leading-tight shadow-[0_0_0_4px_#EEF3FB,0_1px_0_rgba(184,200,239,0.2)]",
                    labelTone,
                    isEventNode ? "text-[10.5px] font-semibold" : "text-[11px] font-bold",
                  )}
                >
                  <span
                    className={cn(
                      "inline-block max-w-[120px] break-words align-top leading-tight [overflow-wrap:anywhere] sm:max-w-[126px]",
                      isEventNode ? "whitespace-normal" : "whitespace-normal",
                    )}
                    title={lesson ? lesson.title : event?.title ?? ""}
                  >
                    {mobileFriendlyNodeLabel(node)}
                  </span>
                </p>
                {lesson ? (
                  <p className={cn("rounded-md border px-1.5 py-0.5 text-[9px] font-bold tracking-wide shadow-[0_0_0_4px_#EEF3FB,0_1px_0_rgba(184,200,239,0.18)]", xpTone)}>
                    +{lesson.xpReward} XP
                  </p>
                ) : null}
              </div>
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
      )}
    </div>
  );
}

export default function ChildAprenderPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [completedLessonIdFromQuery, setCompletedLessonIdFromQuery] = useState<number | null>(null);
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
  const [retentionLoading, setRetentionLoading] = useState(true);
  const [retentionError, setRetentionError] = useState<string | null>(null);
  const [missionToast, setMissionToast] = useState<string | null>(null);
  const [collapsedUnits, setCollapsedUnits] = useState<Record<number, boolean>>({});
  const [availableSubjects, setAvailableSubjects] = useState<AprenderSubjectOption[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null);
  const [subjectPickerOpen, setSubjectPickerOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [expandedNoticeKeys, setExpandedNoticeKeys] = useState<Record<string, boolean>>({});
  const [missionsCollapsed, setMissionsCollapsed] = useState(true);
  const [calendarCollapsed, setCalendarCollapsed] = useState(true);
  const [noticeIndex, setNoticeIndex] = useState(0);
  const [noticePausedUntil, setNoticePausedUntil] = useState(0);
  const [childId, setChildId] = useState<number | null>(null);

  const reducedMotion = effectiveReducedMotion(uxSettings);
  const highlightNotices = useMemo(() => {
    const currentSeason = seasonal?.active[0] ?? null;
    const items: Array<{ key: string; tone: "accent" | "primary" | "secondary"; text: string }> = [];
    if (missions?.almostThere) {
      items.push({ key: "almost", tone: "accent", text: "Missão quase lá! Continue com esse ritmo." });
    } else if (missions?.showNudge && missions.nudgeMessage) {
      items.push({ key: "nudge", tone: "primary", text: missions.nudgeMessage });
    }
    if (missions?.upcomingSeasonalEvent) {
      items.push({
        key: "upcoming",
        tone: "secondary",
        text: `Próximo evento: ${missions.upcomingSeasonalEvent.name} em ${Math.max(0, missions.upcomingSeasonalEvent.startsInDays)} dia(s).`,
      });
    }
    if (currentSeason) {
      items.push({
        key: "active-season",
        tone: "secondary",
        text: `Temporada ativa: ${currentSeason.name} · XP x${currentSeason.bonusXpMultiplier.toFixed(2)} · moedas x${currentSeason.bonusCoinMultiplier.toFixed(2)}`,
      });
    }
    return items.slice(0, 2);
  }, [missions, seasonal]);

  const loadSubjects = useCallback(async (ageGroup: string, preferredSubjectId?: number) => {
    try {
      const items = await getAprenderSubjects({
        ageGroup,
        childId: childId ?? undefined,
      });
      const ordered = [...items].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "pt-BR"));
      setAvailableSubjects(ordered);
      if (preferredSubjectId && ordered.some((subject) => subject.id === preferredSubjectId)) {
        setSelectedSubjectId(preferredSubjectId);
      } else if (ordered.length > 0) {
        const raw = typeof window !== "undefined" ? window.localStorage.getItem(subjectPreferenceKey(childId)) : null;
        const saved = raw ? Number(raw) : NaN;
        const firstNonGeneric = ordered.find((subject) => !isGenericSubjectName(subject.name)) ?? ordered[0];
        if (Number.isFinite(saved) && ordered.some((subject) => subject.id === saved)) {
          const savedSubject = ordered.find((subject) => subject.id === saved) ?? null;
          if (savedSubject && !isGenericSubjectName(savedSubject.name)) {
            setSelectedSubjectId(saved);
          } else {
            setSelectedSubjectId(firstNonGeneric.id);
          }
        } else {
          setSelectedSubjectId((prev) => prev ?? firstNonGeneric.id);
        }
      }
    } catch {
      // Falha em subjects nao bloqueia trilha.
    }
  }, [childId]);

  const loadPath = useCallback(async (subjectOverride?: number) => {
    try {
      setLoading(true);
      const data = await getLearningPath(subjectOverride);
      setPath(data);
      setSelectedSubjectId(data.subjectId);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(subjectPreferenceKey(childId), String(data.subjectId));
      }
      void loadSubjects(data.ageGroup, data.subjectId);
      setError(null);
    } catch (err: unknown) {
      const message = err instanceof ApiError ? getApiErrorMessage(err, "Não foi possível carregar a trilha.") : "Não foi possível carregar a trilha.";
      setError(normalizePathErrorMessage(message));
    } finally {
      setLoading(false);
    }
  }, [childId, loadSubjects]);

  const loadRetention = async () => {
    setRetentionLoading(true);
    setRetentionError(null);
    const now = new Date();
    const [missionsResult, seasonalResult, calendarResult] = await Promise.allSettled([
      getCurrentMissions(),
      getActiveSeasonEvents(),
      getCalendarActivity({ month: now.getMonth() + 1, year: now.getFullYear() }),
    ]);
    if (missionsResult.status === "fulfilled") {
      setMissions(missionsResult.value);
    } else {
      setMissions({
        missions: [],
        currentStreak: 0,
        longestStreak: 0,
        almostThere: false,
        showNudge: false,
        nudgeMessage: "",
        upcomingSeasonalEvent: null,
      });
      setRetentionError("Missões indisponíveis agora. Tentaremos novamente.");
    }

    if (seasonalResult.status === "fulfilled") {
      setSeasonal(seasonalResult.value);
    } else {
      setSeasonal({ active: [], upcoming: null, countdownDays: null });
    }

    if (calendarResult.status === "fulfilled") {
      const calendarRes = calendarResult.value;
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
    } else {
      setCalendar({
        month: now.getMonth() + 1,
        year: now.getFullYear(),
        currentStreak: 0,
        longestStreak: 0,
        days: {},
      });
      setRetentionError((prev) => prev ?? "Calendário indisponível agora.");
    }
    setRetentionLoading(false);
  };

  useEffect(() => {
    void getAxionBrief({ context: "before_learning" }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem("axiora_child_id");
    const parsed = raw ? Number(raw) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) {
      setChildId(parsed);
    }
  }, []);

  useEffect(() => {
    void loadPath();
    void loadRetention();
    void fetchUXSettings().then(setUxSettings);
  }, [loadPath]);

  useEffect(() => {
    if (typeof window === "undefined" || childId === null) return;
    const raw = window.localStorage.getItem(subjectPreferenceKey(childId));
    const storedSubjectId = raw ? Number(raw) : NaN;
    if (!Number.isFinite(storedSubjectId) || storedSubjectId <= 0) return;
    if (storedSubjectId === selectedSubjectId) return;
    void loadPath(storedSubjectId);
  }, [childId, loadPath, selectedSubjectId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = new URLSearchParams(window.location.search).get("completedLessonId");
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      setCompletedLessonIdFromQuery(parsed);
    }
  }, []);

  useEffect(() => {
    if (!path) return;
    const completedLessonId = completedLessonIdFromQuery;
    if (completedLessonId == null || !Number.isFinite(completedLessonId) || completedLessonId <= 0) return;

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
      setCompletedLessonIdFromQuery(null);
      break;
    }
  }, [completedLessonIdFromQuery, path, pathname, router, uxSettings]);

  useEffect(() => {
    if (!path) return;
    const currentUnitIndex = path.units.findIndex((unit) =>
      unit.nodes.some((node) => node.lesson && node.lesson.unlocked && !node.lesson.completed),
    );
    const nextState: Record<number, boolean> = {};
    path.units.forEach((unit, index) => {
      const hasStarted = unit.completionRate > 0;
      const keepExpanded = index === 0 || hasStarted || (currentUnitIndex >= 0 && index <= currentUnitIndex);
      nextState[unit.id] = !keepExpanded;
    });
    setCollapsedUnits(nextState);
  }, [path]);

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncCollapseByViewport = () => {
      const isDesktop = window.matchMedia("(min-width: 768px)").matches;
      setMissionsCollapsed(!isDesktop);
      setCalendarCollapsed(!isDesktop);
    };
    syncCollapseByViewport();
    window.addEventListener("resize", syncCollapseByViewport);
    return () => window.removeEventListener("resize", syncCollapseByViewport);
  }, []);

  useEffect(() => {
    setNoticeIndex((prev) => {
      if (highlightNotices.length <= 1) return 0;
      return Math.min(prev, highlightNotices.length - 1);
    });
  }, [highlightNotices.length]);

  useEffect(() => {
    if (highlightNotices.length <= 1) return;
    const timer = window.setInterval(() => {
      if (Date.now() < noticePausedUntil) return;
      setNoticeIndex((prev) => (prev >= highlightNotices.length - 1 ? 0 : prev + 1));
    }, 5000);
    return () => window.clearInterval(timer);
  }, [highlightNotices.length, noticePausedUntil]);

  const lessons = useMemo(
    () =>
      (path?.units ?? [])
        .flatMap((unit) => unit.nodes)
        .filter((node) => node.lesson)
        .map((node) => node.lesson),
    [path],
  );
  const completedLessons = lessons.filter((lesson) => lesson?.completed).length;
  const completionPercent =
    lessons.length > 0
      ? Math.max(completedLessons > 0 ? 1 : 0, Math.round((completedLessons / lessons.length) * 100))
      : 0;
  const calendarDaysCount = calendar ? daysInMonth(calendar.month, calendar.year) : 0;
  const calendarLeadingSlots = useMemo(() => {
    if (!calendar) return 0;
    return new Date(calendar.year, calendar.month - 1, 1).getDay();
  }, [calendar]);
  const calendarGrid = useMemo(() => {
    const days = Array.from({ length: calendarDaysCount }, (_, index) => index + 1);
    return [...Array.from({ length: calendarLeadingSlots }, () => null), ...days];
  }, [calendarDaysCount, calendarLeadingSlots]);
  const todayKey = useMemo(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  }, []);
  const activeSeason = seasonal?.active[0] ?? null;
  const streakDays = path?.streakDays ?? 0;
  const streakAtRisk = streakDays <= 1;
  const displaySubjectName = useMemo(() => {
    const selected = availableSubjects.find((subject) => subject.id === (selectedSubjectId ?? path?.subjectId));
    if (selected && !isGenericSubjectName(selected.name)) return selected.name;
    if (path?.subjectName && !isGenericSubjectName(path.subjectName)) return path.subjectName;
    const firstNonGeneric = availableSubjects.find((subject) => !isGenericSubjectName(subject.name));
    if (firstNonGeneric) return firstNonGeneric.name;
    return path?.subjectName ?? selected?.name ?? "Matéria";
  }, [availableSubjects, path?.subjectId, path?.subjectName, selectedSubjectId]);

  const subjectPickerOptions = useMemo(() => {
    if (availableSubjects.length > 0) return availableSubjects;
    if (path?.subjectId) {
      return [{ id: path.subjectId, name: displaySubjectName, order: 0 } as AprenderSubjectOption];
    }
    return [];
  }, [availableSubjects, displaySubjectName, path?.subjectId]);
  const coachTip = buildCoachTip({
    streakDays,
    dueReviews: path?.dueReviewsCount ?? 0,
    completionPercent,
    subjectName: displaySubjectName,
  });
  const nextLessonNode = useMemo(() => {
    const units = path?.units ?? [];
    for (const unit of units) {
      for (const node of unit.nodes) {
        if (node.lesson && node.lesson.unlocked && !node.lesson.completed) {
          return { lesson: node.lesson, unit };
        }
      }
    }
    return null;
  }, [path]);
  const journeyContext = nextLessonNode
    ? `${nextLessonNode.unit.title} • ${compactNodeLabel({ kind: "LESSON", orderIndex: 0, lesson: nextLessonNode.lesson, event: null })}`
    : "Todas as lições desta matéria estão concluídas.";
  const nextGoalHint = useMemo(() => {
    if (!path || !nextLessonNode) return { text: "Sem meta imediata.", kind: "none" as const };
    const orderedNodes = path.units.flatMap((unit) => unit.nodes);
    const currentIndex = orderedNodes.findIndex((node) => node.lesson?.id === nextLessonNode.lesson.id);
    if (currentIndex < 0) return { text: "Sem meta imediata.", kind: "none" as const };

    let lessonsUntil = 0;
    for (let index = currentIndex; index < orderedNodes.length; index += 1) {
      const node = orderedNodes[index];
      if (node.event && node.event.status !== "COMPLETED" && node.event.status !== "SKIPPED") {
        const eventName =
          node.event.type === "CHEST"
            ? "baú"
            : node.event.type === "CHECKPOINT"
              ? "checkpoint"
              : node.event.type === "MINI_BOSS"
                ? "mini-boss"
                : "evento";
        if (lessonsUntil <= 0) {
          return { text: `Próximo ${eventName}: agora.`, kind: node.event.type };
        }
        return { text: `Faltam ${lessonsUntil} lição(ões) para o próximo ${eventName}.`, kind: node.event.type };
      }
      if (index > currentIndex && node.lesson) {
        lessonsUntil += 1;
      }
    }
    return { text: "Sem eventos pendentes nesta região.", kind: "none" as const };
  }, [nextLessonNode, path]);
  const nextLessonEtaText = nextLessonNode ? `${estimateLessonMinutes(nextLessonNode.lesson)} min` : null;
  const reviewsCount = path?.dueReviewsCount ?? 0;
  const ctaLabel = !nextLessonNode
    ? availableSubjects.length > 1
      ? "Escolher matéria"
      : "Sem nova lição"
    : reviewsCount > 0
      ? `Fazer revisão (${Math.min(5, Math.max(2, reviewsCount))} min)`
      : "Continuar jornada";
  const ctaHint = !nextLessonNode
    ? "Escolha uma matéria para continuar."
    : reviewsCount > 0
      ? `${reviewsCount} revisão(ões) pendente(s) para fortalecer sua base.`
      : "Siga para a próxima lição da trilha.";

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

  useEffect(() => {
    if (!nextLessonNode || completedLessonIdFromQuery !== null) return;
    const timer = window.setTimeout(() => {
      const selector = `[data-path-lesson-id="${nextLessonNode.lesson.id}"]`;
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement)) return;
      element.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
    }, 220);
    return () => window.clearTimeout(timer);
  }, [completedLessonIdFromQuery, nextLessonNode, path?.subjectId, reducedMotion]);

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
      const message = err instanceof ApiError ? getApiErrorMessage(err, "Não foi possível concluir o evento.") : "Não foi possível concluir o evento.";
      setError(message);
    } finally {
      setModalLoading(null);
    }
  };

  const onClaimMission = async (missionId: string) => {
    try {
      const response = await claimMission(missionId);
      if (response.rewardGranted && (response.xpReward > 0 || response.coinReward > 0)) {
        setMissionToast(`Missão concluída! +${response.xpReward} XP e +${response.coinReward} moedas`);
        playSfx("/sfx/completion-chime.ogg", uxSettings.soundEnabled);
        hapticCompletion(uxSettings);
      }
      await loadRetention();
    } catch (err: unknown) {
      const message = err instanceof ApiError ? getApiErrorMessage(err, "Não foi possível resgatar a missão.") : "Não foi possível resgatar a missão.";
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
      <PageShell tone="child" width="wide" className={cn(activeSeason?.themeKey === "halloween" ? "bg-[radial-gradient(circle_at_88%_2%,rgba(120,53,15,0.2),transparent_44%)]" : "")}>
        <Card variant="emphasis" className="mb-4 overflow-hidden border-border">
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
            <div className="flex flex-wrap items-center gap-1.5">
              <Button size="sm" variant="secondary" className="h-8 px-2.5 text-xs" onClick={() => setPreferencesOpen(true)}>
                {uxSettings.soundEnabled ? <Volume2 className="mr-1 h-3.5 w-3.5" /> : <VolumeX className="mr-1 h-3.5 w-3.5" />}
                Preferências
              </Button>
              <span className="inline-flex items-center rounded-full border border-border bg-white/85 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                Som: {uxSettings.soundEnabled ? "ligado" : "desligado"}
              </span>
            </div>
            <p className="break-words text-muted-foreground [overflow-wrap:anywhere]">Explore regiões, cumpra eventos e avance na trilha do tesouro.</p>
            <div className="rounded-xl border border-secondary/25 bg-secondary/10 px-3 py-2 text-xs">
              <p className="font-semibold text-secondary">Você está aqui</p>
              <p className="mt-0.5 break-words text-foreground [overflow-wrap:anywhere]">{journeyContext}</p>
            </div>
            <div className="rounded-2xl border border-border bg-white/90 p-3">
              <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>Progresso total</span>
                <span>{completionPercent}%</span>
              </div>
              <ProgressBar value={completionPercent} tone="secondary" />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-white/90 p-2 text-center">
                <p className="text-[11px] text-muted-foreground">Revisões</p>
                <p className="text-sm font-bold text-primary">{path?.dueReviewsCount ?? 0}</p>
              </div>
              <div className="rounded-xl border border-border bg-white/90 p-2 text-center">
                <p className="text-[11px] text-muted-foreground">Mastery médio</p>
                <p className="text-sm font-bold text-secondary">{Math.round((path?.masteryAverage ?? 0) * 100)}%</p>
              </div>
              <div className="col-span-2 rounded-xl border border-border bg-white/90 p-2 text-center sm:col-span-1">
                <p className="text-[11px] text-muted-foreground">Matéria</p>
                {subjectPickerOptions.length > 0 ? (
                  <button
                    type="button"
                    className="mt-1 inline-flex min-h-8 w-full items-center justify-between rounded-lg border border-border bg-white px-2 py-1 text-xs font-bold text-foreground transition hover:border-secondary/55"
                    onClick={() => setSubjectPickerOpen(true)}
                    aria-haspopup="dialog"
                    aria-expanded={subjectPickerOpen}
                    aria-label="Abrir seleção de matéria"
                  >
                    <span className="break-words text-left leading-tight [overflow-wrap:anywhere]">{displaySubjectName}</span>
                    <ChevronDown className="ml-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </button>
                ) : (
                  <p className="break-words text-sm font-bold leading-tight text-foreground [overflow-wrap:anywhere]">{displaySubjectName}</p>
                )}
              </div>
            </div>
            {highlightNotices.length > 0 ? (
              <div
                className={cn(
                  "rounded-xl border px-3 py-2 text-xs",
                  highlightNotices[noticeIndex]?.tone === "accent" && "border-accent/30 bg-accent/10 font-semibold text-accent-foreground",
                  highlightNotices[noticeIndex]?.tone === "primary" && "border-primary/30 bg-primary/10 text-primary",
                  highlightNotices[noticeIndex]?.tone === "secondary" && "border-secondary/30 bg-secondary/10 text-secondary",
                )}
              >
                <div className="flex items-start gap-2">
                  {highlightNotices.length > 1 ? (
                    <button
                      type="button"
                      className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border/60 bg-white/60 text-foreground/80"
                      aria-label="Aviso anterior"
                      onClick={() =>
                        (setNoticePausedUntil(Date.now() + 8000),
                        setNoticeIndex((prev) =>
                          prev <= 0 ? highlightNotices.length - 1 : prev - 1,
                        ))
                      }
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                  <div className="min-w-0 flex-1">
                <p
                  style={
                        expandedNoticeKeys[highlightNotices[noticeIndex].key]
                      ? undefined
                      : {
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }
                  }
                >
                      {highlightNotices[noticeIndex].text}
                </p>
                    {highlightNotices[noticeIndex].text.length > 86 ? (
                  <button
                    type="button"
                    className="mt-1 text-[11px] font-extrabold underline underline-offset-2"
                    onClick={() =>
                      setExpandedNoticeKeys((prev) => ({
                        ...prev,
                        [highlightNotices[noticeIndex].key]: !prev[highlightNotices[noticeIndex].key],
                      }))
                    }
                  >
                        {expandedNoticeKeys[highlightNotices[noticeIndex].key] ? "ver menos" : "ver mais"}
                  </button>
                ) : null}
                  </div>
                  {highlightNotices.length > 1 ? (
                    <button
                      type="button"
                      className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border/60 bg-white/60 text-foreground/80"
                      aria-label="Próximo aviso"
                      onClick={() =>
                        (setNoticePausedUntil(Date.now() + 8000),
                        setNoticeIndex((prev) =>
                          prev >= highlightNotices.length - 1 ? 0 : prev + 1,
                        ))
                      }
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
                {highlightNotices.length > 1 ? (
                  <div className="mt-2 flex items-center justify-center gap-1">
                    {highlightNotices.map((item, index) => (
                      <span
                        key={item.key}
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          index === noticeIndex ? "bg-current opacity-80" : "bg-current opacity-30",
                        )}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="sticky top-2 z-20 mb-4 border-secondary/35 bg-[linear-gradient(120deg,rgba(255,255,255,0.98),rgba(220,255,245,0.96))] shadow-[0_8px_20px_rgba(14,165,164,0.18)]">
          <CardContent className="p-3">
            {loading ? (
              <div className="animate-pulse">
                <div className="h-3 w-24 rounded bg-secondary/20" />
                <div className="mt-2 h-4 w-3/4 rounded bg-slate-200" />
                <div className="mt-2 h-3 w-1/2 rounded bg-slate-200" />
                <div className="mt-2 flex gap-2">
                  <div className="h-5 w-16 rounded-full bg-slate-200" />
                  <div className="h-5 w-12 rounded-full bg-slate-200" />
                  <div className="h-5 w-16 rounded-full bg-slate-200" />
                </div>
                <div className="mt-2 h-3 w-5/6 rounded bg-slate-200" />
                <div className="mt-3 h-9 w-36 rounded-lg bg-slate-200" />
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-secondary">Próxima ação</p>
                  <p className="truncate text-sm font-extrabold text-foreground">
                    {nextLessonNode ? nextLessonNode.lesson.title : "Missão concluída por enquanto"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {nextLessonNode ? `+${nextLessonNode.lesson.xpReward} XP • ~${nextLessonEtaText}` : "Escolha outra matéria para continuar"}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold">
                    <span className="inline-flex items-center rounded-full border border-secondary/30 bg-secondary/10 px-2 py-0.5 text-secondary">
                      +{nextLessonNode?.lesson.xpReward ?? 0} XP
                    </span>
                    {nextLessonNode ? (
                      <span className="inline-flex items-center rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-primary">
                        ~{nextLessonEtaText}
                      </span>
                    ) : null}
                    <span className="inline-flex items-center rounded-full border border-border bg-white/85 px-2 py-0.5 text-muted-foreground">
                      {nextGoalHint.kind === "CHEST" ? "Baú" : nextGoalHint.kind === "CHECKPOINT" ? "Checkpoint" : nextGoalHint.kind === "MINI_BOSS" ? "Mini-boss" : "Meta"}
                    </span>
                  </div>
                  <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-secondary/85">
                    {nextGoalHint.kind === "CHEST" ? <Gift className="h-3.5 w-3.5" /> : null}
                    {nextGoalHint.kind === "CHECKPOINT" ? <Flag className="h-3.5 w-3.5" /> : null}
                    {nextGoalHint.kind === "MINI_BOSS" ? <Swords className="h-3.5 w-3.5" /> : null}
                    {nextGoalHint.kind !== "CHEST" && nextGoalHint.kind !== "CHECKPOINT" && nextGoalHint.kind !== "MINI_BOSS" ? <Sparkles className="h-3.5 w-3.5" /> : null}
                    <span>{nextGoalHint.text}</span>
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{ctaHint}</p>
                </div>
                <Button
                  className="h-9 shrink-0 px-3 text-xs"
                  disabled={!nextLessonNode && availableSubjects.length <= 1}
                  onClick={() => {
                    if (!nextLessonNode) {
                      if (availableSubjects.length > 1) setSubjectPickerOpen(true);
                      return;
                    }
                    router.push(`/child/aprender/lesson/${nextLessonNode.lesson.id}`);
                  }}
                >
                  {ctaLabel}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <div
          className={cn(
            "mb-4 flex items-center gap-2 rounded-2xl border px-3 py-2.5 shadow-[0_2px_0_rgba(184,200,239,0.45)]",
            streakAtRisk
              ? "border-rose-300/55 bg-[linear-gradient(120deg,rgba(251,113,133,0.2),rgba(255,255,255,0.9))]"
              : "border-accent/35 bg-[linear-gradient(120deg,rgba(255,122,69,0.22),rgba(255,255,255,0.95))]",
          )}
        >
          <Flame className={cn("h-5 w-5", streakAtRisk ? "text-rose-500" : "text-accent")} />
          <div className="min-w-0">
            <p className={cn("text-sm font-extrabold", streakAtRisk ? "text-rose-700" : "text-accent-foreground")}>
              {streakDays > 0 ? `Sequência de ${streakDays} dia(s)` : "Sua sequência está em pausa"}
            </p>
            <p className={cn("text-[11px] font-semibold", streakAtRisk ? "text-rose-600/90" : "text-accent-foreground/85")}>
              {streakAtRisk ? "Faça uma lição hoje para proteger seu ritmo." : "Continue assim para ganhar bônus especiais."}
            </p>
          </div>
        </div>

        <div className="mb-4 grid gap-3 md:grid-cols-2">
          <Card variant="subtle" className="border-border">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">Missões da Semana</CardTitle>
                <Button size="sm" variant="secondary" className="h-8 px-2 text-xs" onClick={() => setMissionsCollapsed((prev) => !prev)}>
                  {missionsCollapsed ? (
                    <>
                      Expandir <ChevronDown className="ml-1 h-3.5 w-3.5" />
                    </>
                  ) : (
                    <>
                      Recolher <ChevronUp className="ml-1 h-3.5 w-3.5" />
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent className={cn(missionsCollapsed ? "" : "space-y-2")}>
              {missionsCollapsed ? (
                <div className="rounded-xl border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  {missions?.missions?.length ? `${missions.missions.length} missão(ões) ativa(s)` : "Sem missões ativas agora."}
                </div>
              ) : null}
              {!missionsCollapsed ? (
                <>
              {(missions?.missions ?? []).slice(0, 5).map((mission) => (
                <div key={mission.missionId} className="rounded-xl border border-border bg-muted/40 p-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 break-words text-xs font-semibold text-foreground [overflow-wrap:anywhere]">{mission.title}</p>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{missionTypeLabel(mission.missionType)}</span>
                  </div>
                  <p className="mt-1 break-words text-[11px] text-muted-foreground [overflow-wrap:anywhere]">{mission.description}</p>
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
              {retentionLoading && (!missions || missions.missions.length === 0) ? <p className="text-xs text-muted-foreground">Carregando missões...</p> : null}
              {!retentionLoading && missions && missions.missions.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                  Nenhuma missão ativa nesta semana.
                </div>
              ) : null}
              {retentionError ? (
                <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 p-2 text-[11px] text-primary">
                  <span>{retentionError}</span>
                  <Button size="sm" variant="secondary" className="h-7 px-2 text-[10px]" onClick={() => void loadRetention()}>
                    Tentar de novo
                  </Button>
                </div>
              ) : null}
                </>
              ) : null}
            </CardContent>
          </Card>

          <Card variant="subtle" className="border-border">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">Calendário de Constância</CardTitle>
                <Button size="sm" variant="secondary" className="h-8 px-2 text-xs" onClick={() => setCalendarCollapsed((prev) => !prev)}>
                  {calendarCollapsed ? (
                    <>
                      Expandir <ChevronDown className="ml-1 h-3.5 w-3.5" />
                    </>
                  ) : (
                    <>
                      Recolher <ChevronUp className="ml-1 h-3.5 w-3.5" />
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {calendarCollapsed ? (
                <div className="rounded-xl border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  Sequência atual: {calendar?.currentStreak ?? 0} dia(s) • Recorde: {calendar?.longestStreak ?? 0}
                </div>
              ) : null}
              {!calendarCollapsed ? (
                <>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-1 text-xs text-muted-foreground">
                <span>Atual: {calendar?.currentStreak ?? 0} dias</span>
                <span>Recorde: {calendar?.longestStreak ?? 0}</span>
              </div>
              <div className="mb-1 grid grid-cols-7 gap-1 px-0.5">
                {WEEKDAY_SHORT.map((label, index) => (
                  <div key={`${label}-${index}`} className="text-center text-[10px] font-semibold text-muted-foreground/85">
                    {label}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1.5">
                {calendarGrid.map((day, index) => {
                  if (day === null) {
                    return <div key={`blank-${index}`} className="h-9" aria-hidden />;
                  }
                  const key = calendar ? `${calendar.year}-${String(calendar.month).padStart(2, "0")}-${String(day).padStart(2, "0")}` : "";
                  const marker = key ? calendar?.days[key] : undefined;
                  const isToday = key === todayKey;
                  return (
                    <div key={day} className={cn("flex h-9 flex-col items-center justify-center rounded-lg text-[10px] transition-colors", marker ? "bg-primary/8" : "bg-muted/25", isToday ? "ring-1 ring-primary/45" : "")}>
                      <span className={cn("font-semibold", marker ? "text-foreground" : "text-muted-foreground")}>{day}</span>
                      <span className="mt-0.5 flex items-center gap-0.5">
                        {marker?.streak ? <Flame className="h-2.5 w-2.5 text-accent" /> : null}
                        {marker?.perfect ? <Star className="h-2.5 w-2.5 text-amber-500" /> : null}
                        {marker?.mission ? <Coins className="h-2.5 w-2.5 text-secondary" /> : null}
                      </span>
                    </div>
                  );
                })}
              </div>
                </>
              ) : null}
            </CardContent>
          </Card>
        </div>

        {loading ? <LearningPathSkeleton /> : null}
        {error && !path ? (
          <Card variant="flat">
            <CardContent className="flex items-center justify-between gap-3 p-4 text-sm text-muted-foreground">
              <span className="min-w-0 break-words [overflow-wrap:anywhere]">{error}</span>
              <Button size="sm" variant="secondary" onClick={() => void loadPath()}>
                Tentar novamente
              </Button>
            </CardContent>
          </Card>
        ) : null}
        {error && path ? (
          <div className="mb-3 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">{error}</div>
        ) : null}

        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-primary/25 bg-[linear-gradient(120deg,rgba(27,42,74,0.92),rgba(23,36,62,0.9))] px-3 py-2.5 shadow-[0_10px_22px_rgba(16,29,51,0.25)]">
          <Image src="/icons/axion.svg" alt="" aria-hidden className="h-10 w-10 shrink-0 rounded-full object-contain" draggable={false} width={40} height={40} />
          <p className="text-xs font-semibold leading-relaxed text-white/90">
            <span className="font-extrabold text-[#4DD9C0]">Dica do Axion:</span> {coachTip}
          </p>
        </div>

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
              collapsed={Boolean(collapsedUnits[unit.id])}
              onToggleCollapsed={() =>
                setCollapsedUnits((prev) => ({
                  ...prev,
                  [unit.id]: !Boolean(prev[unit.id]),
                }))
              }
              onUnlockDone={(toast) => {
                setUnlockToast(toast);
                setUnlockAnimation(null);
              }}
            />
          ))}
        </section>

        <ChildBottomNav />
      </PageShell>

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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onClick={() => setSelectedNode(null)}>
          <div className="w-full max-w-md rounded-3xl border border-border bg-white p-5 shadow-[0_24px_60px_rgba(13,25,41,0.32)]" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <p className="text-lg font-extrabold text-foreground">{selectedNode.event.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{selectedNode.event.description}</p>
            <p className="mt-2 inline-flex rounded-full border border-border bg-muted/50 px-2 py-1 text-xs font-semibold text-muted-foreground">
              <Trophy className="mr-1 h-3.5 w-3.5" />
              {selectedNode.event.type} · {selectedNode.event.rarity}
            </p>

            <div className="mt-3 rounded-2xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              <p className="font-semibold text-foreground">Missão deste evento</p>
              <p className="mt-1">{eventFriendlyDetails(selectedNode.event).objective}</p>
              <p className="mt-2 font-semibold text-foreground">Recompensa</p>
              <p className="mt-1">{eventFriendlyDetails(selectedNode.event).reward}</p>
              <p className="mt-2 font-semibold text-foreground">Dica do Axion</p>
              <p className="mt-1">{eventFriendlyDetails(selectedNode.event).hint}</p>
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
              <Button className="w-full" disabled title="Conclua a atividade para liberar esta badge." onClick={() => void onCompleteEvent()}>
                Concluir
              </Button>
            </div>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              A badge será concluída depois que a atividade for finalizada.
            </p>
          </div>
        </div>
      ) : null}

      {subjectPickerOpen ? (
        <div className="fixed inset-0 z-[70] bg-slate-950/45" onClick={() => setSubjectPickerOpen(false)}>
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-3xl border border-border bg-white px-4 pb-6 pt-4 shadow-[0_-18px_50px_rgba(15,23,42,0.28)]"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Selecionar matéria"
          >
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-200" />
            <div className="mb-3 flex items-center justify-between">
              <p className="text-base font-extrabold text-foreground">Escolher matéria</p>
              <Button size="sm" variant="secondary" className="h-8 px-3 text-xs" onClick={() => setSubjectPickerOpen(false)}>
                Fechar
              </Button>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">Selecione uma matéria para atualizar a trilha.</p>
            <div className="grid max-h-[52vh] grid-cols-1 gap-2 overflow-y-auto pr-1">
              {subjectPickerOptions.map((subject) => {
                const selected = (selectedSubjectId ?? path?.subjectId) === subject.id;
                return (
                  <button
                    key={subject.id}
                    type="button"
                    className={cn(
                      "flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition",
                      selected
                        ? "border-secondary bg-secondary/10 text-secondary shadow-[0_2px_0_rgba(45,212,191,0.35)]"
                        : "border-border bg-white text-foreground hover:border-secondary/40",
                    )}
                    onClick={() => {
                      if (!selected) {
                        setSelectedSubjectId(subject.id);
                        if (typeof window !== "undefined") {
                          window.localStorage.setItem(subjectPreferenceKey(childId), String(subject.id));
                        }
                        void loadPath(subject.id);
                      }
                      setSubjectPickerOpen(false);
                    }}
                  >
                    <span className="text-sm font-bold">{subject.name}</span>
                    {selected ? <CheckCircle2 className="h-4.5 w-4.5" /> : null}
                  </button>
                );
              })}
              {subjectPickerOptions.length === 0 ? (
                <div className="rounded-xl border border-border bg-white px-3 py-2 text-xs font-semibold text-muted-foreground">
                  Nenhuma matéria disponível no momento.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {preferencesOpen ? (
        <div className="fixed inset-0 z-[72] bg-slate-950/45" onClick={() => setPreferencesOpen(false)}>
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-3xl border border-border bg-white px-4 pb-6 pt-4 shadow-[0_-18px_50px_rgba(15,23,42,0.28)]"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Preferências de interação"
          >
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-200" />
            <div className="mb-3 flex items-center justify-between">
              <p className="text-base font-extrabold text-foreground">Preferências</p>
              <Button size="sm" variant="secondary" className="h-8 px-3 text-xs" onClick={() => setPreferencesOpen(false)}>
                Fechar
              </Button>
            </div>
            <div className="space-y-2">
              <Button
                variant="secondary"
                className="h-10 w-full justify-between px-3 text-sm"
                onClick={() => void updateUx({ soundEnabled: !uxSettings.soundEnabled })}
              >
                Som
                <span className="text-xs font-semibold text-muted-foreground">{uxSettings.soundEnabled ? "Ligado" : "Desligado"}</span>
              </Button>
              <Button
                variant="secondary"
                className="h-10 w-full justify-between px-3 text-sm"
                onClick={() => void updateUx({ hapticsEnabled: !uxSettings.hapticsEnabled })}
              >
                Haptics
                <span className="text-xs font-semibold text-muted-foreground">{uxSettings.hapticsEnabled ? "Ligado" : "Desligado"}</span>
              </Button>
              <Button
                variant="secondary"
                className="h-10 w-full justify-between px-3 text-sm"
                onClick={() => void updateUx({ reducedMotion: !uxSettings.reducedMotion })}
              >
                Movimento
                <span className="text-xs font-semibold text-muted-foreground">{uxSettings.reducedMotion ? "Reduzido" : "Normal"}</span>
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
          animation: node-pulse 1.9s ease-in-out infinite;
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
        .locked-node {
          filter: saturate(0.4) blur(0.2px);
          opacity: 0.9;
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


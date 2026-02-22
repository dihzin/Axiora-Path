"use client";

import { BookOpen, Check, ChevronDown, Flame, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { LearningPath } from "@/components/aprender/LearningPath";
import { PATH_CSS_VARS } from "@/components/aprender/path-tokens";
import { ChildBottomNav } from "@/components/child-bottom-nav";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import {
  ApiError,
  completeLearningPathEvent,
  getApiErrorMessage,
  getAprenderSubjects,
  getLearningPath,
  startLearningPathEvent,
  type AprenderSubjectOption,
  type LearningEventCompleteResponse,
  type LearningPathEventNode,
  type LearningPathResponse,
} from "@/lib/api/client";

const SUBJECT_PREF_KEY = "axiora_path_subject";

const AXION_DEFAULT_LINE = "Bora aprender?";

function getStoredSubjectId(): number | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(SUBJECT_PREF_KEY);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function setStoredSubjectId(subjectId: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SUBJECT_PREF_KEY, String(subjectId));
}

export default function LearningPathPage() {
  const router = useRouter();

  const [path, setPath] = useState<LearningPathResponse | null>(null);
  const [subjects, setSubjects] = useState<AprenderSubjectOption[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<LearningPathEventNode | null>(null);
  const [eventResult, setEventResult] = useState<LearningEventCompleteResponse | null>(null);
  const [celebrateLessonId, setCelebrateLessonId] = useState<number | null>(null);
  const [mascotVisible, setMascotVisible] = useState(false);
  const [mascotLine, setMascotLine] = useState<string>(AXION_DEFAULT_LINE);
  const [loading, setLoading] = useState(true);
  const [eventLoading, setEventLoading] = useState<"start" | "complete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subjectMenuOpen, setSubjectMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const mascotTimerRef = useRef<number | null>(null);
  const hasShownArrivalRef = useRef(false);
  const hasShownStreakRiskRef = useRef(false);
  const lastMascotAtRef = useRef(0);

  const currentSubjectId = selectedSubjectId ?? path?.subjectId ?? null;

  const showMascot = (line: string) => {
    const now = Date.now();
    if (now - lastMascotAtRef.current < 2600) return;
    lastMascotAtRef.current = now;
    if (mascotTimerRef.current) {
      window.clearTimeout(mascotTimerRef.current);
      mascotTimerRef.current = null;
    }
    setMascotLine(line);
    setMascotVisible(true);
    mascotTimerRef.current = window.setTimeout(() => {
      setMascotVisible(false);
      mascotTimerRef.current = null;
    }, 3000);
  };

  const loadPath = async (subjectId?: number) => {
    try {
      setLoading(true);
      setError(null);
      const data = await getLearningPath(subjectId);
      setPath(data);
      setSelectedSubjectId(data.subjectId);
    } catch (err: unknown) {
      const message =
        err instanceof ApiError
          ? getApiErrorMessage(err, "Nao foi possivel carregar.")
          : "Nao foi possivel carregar.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const bootstrap = async () => {
      let subjectId = getStoredSubjectId();
      try {
        const options = await getAprenderSubjects();
        setSubjects(options);
        if (!subjectId && options.length > 0) subjectId = options[0].id;
      } catch {
        setSubjects([]);
      }
      await loadPath(subjectId ?? undefined);
    };
    void bootstrap();
  }, []);

  useEffect(() => {
    return () => {
      if (mascotTimerRef.current) {
        window.clearTimeout(mascotTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!subjectMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setSubjectMenuOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [subjectMenuOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const doneId = Number(params.get("completedLessonId") ?? "");
    if (!Number.isFinite(doneId) || doneId <= 0) return;

    setCelebrateLessonId(doneId);
    showMascot("Boa! Proxima.");
    const celebrationTimer = window.setTimeout(() => setCelebrateLessonId(null), 1200);
    return () => {
      window.clearTimeout(celebrationTimer);
    };
  }, []);

  useEffect(() => {
    if (loading || !path || hasShownArrivalRef.current) return;
    hasShownArrivalRef.current = true;
    showMascot("Bora aprender?");
  }, [loading, path]);

  useEffect(() => {
    if (loading || !path || !hasShownArrivalRef.current || hasShownStreakRiskRef.current) return;
    if ((path.streakDays ?? 0) > 1) return;
    hasShownStreakRiskRef.current = true;
    const timer = window.setTimeout(() => showMascot("Proteja sua sequencia."), 2600);
    return () => window.clearTimeout(timer);
  }, [loading, path]);

  const onSubjectChange = async (subjectId: number) => {
    setStoredSubjectId(subjectId);
    setSelectedSubjectId(subjectId);
    setSubjectMenuOpen(false);
    setMascotVisible(false);
    await loadPath(subjectId);
  };

  const onLessonPress = (lessonId: number) => {
    setMascotVisible(false);
    router.push(`/child/aprender/lesson/${lessonId}`);
  };

  const onOpenEvent = (event: LearningPathEventNode) => {
    setSelectedEvent(event);
    setEventResult(null);
  };

  const onStartEvent = async () => {
    if (!selectedEvent) return;
    try {
      setEventLoading("start");
      await startLearningPathEvent(selectedEvent.id);
      await loadPath(currentSubjectId ?? undefined);
    } finally {
      setEventLoading(null);
    }
  };

  const onCompleteEvent = async () => {
    if (!selectedEvent) return;
    try {
      setEventLoading("complete");
      const result = await completeLearningPathEvent({
        eventId: selectedEvent.id,
        resultSummary: { source: "path-ui" },
      });
      setEventResult(result);
      await loadPath(currentSubjectId ?? undefined);
    } finally {
      setEventLoading(null);
    }
  };

  return (
    <>
      <PageShell tone="child" width="content" style={PATH_CSS_VARS} className="mx-auto max-w-xl pb-32">
        <header className="mb-[var(--path-space-3)] space-y-[var(--path-space-2)]">
          <div className="flex items-center justify-between rounded-full bg-white px-3 py-2 shadow-[0_1px_6px_rgba(0,0,0,0.08)]">
            <span className="inline-flex items-center gap-1 text-sm font-black text-[color:var(--path-ink)]" aria-label="Sequência">
              <Flame className="h-3.5 w-3.5" aria-hidden /> {path?.streakDays ?? 0}
            </span>
            <span className="inline-flex items-center gap-1 text-sm font-black text-[color:var(--path-ink)]" aria-label="Revisões">
              <BookOpen className="h-3.5 w-3.5" aria-hidden /> {path?.dueReviewsCount ?? 0}
            </span>
            <span className="inline-flex items-center gap-1 text-sm font-black text-[color:var(--path-ink)]" aria-label="Domínio">
              <Star className="h-3.5 w-3.5" aria-hidden /> {Math.round((path?.masteryAverage ?? 0) * 100)}%
            </span>
          </div>
          <div ref={menuRef} className="relative">
            <button
              type="button"
              aria-label="Selecionar materia"
              aria-expanded={subjectMenuOpen}
              onClick={() => setSubjectMenuOpen((prev) => !prev)}
              className="inline-flex min-h-[var(--path-touch)] w-full items-center justify-between rounded-full border border-[#C9D4E6] bg-white px-4 text-sm font-black text-[color:var(--path-ink)] shadow-[0_2px_8px_rgba(0,0,0,0.08)]"
            >
              <span>{subjects.find((subject) => subject.id === currentSubjectId)?.name ?? "Matéria"}</span>
              <ChevronDown className={`h-4 w-4 transition-transform duration-150 ${subjectMenuOpen ? "rotate-180" : ""}`} aria-hidden />
            </button>
            {subjectMenuOpen ? (
              <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 max-h-64 overflow-y-auto rounded-3xl border border-[#C9D4E6] bg-white p-2 shadow-[0_12px_28px_rgba(0,0,0,0.14)]">
                {subjects.map((subject) => {
                  const active = subject.id === currentSubjectId;
                  return (
                    <button
                      key={subject.id}
                      type="button"
                      onClick={() => void onSubjectChange(subject.id)}
                      className={`mb-1 flex min-h-[44px] w-full items-center justify-between rounded-2xl px-3 text-left text-sm font-black ${
                        active ? "bg-[#E6FAF6] text-[#0C8D7E]" : "bg-transparent text-[color:var(--path-ink)] hover:bg-slate-50"
                      }`}
                    >
                      {subject.name}
                      {active ? <Check className="h-4 w-4" aria-hidden /> : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </header>

        {loading ? (
          <div className="space-y-[var(--path-space-2)]">
            <div className="h-24 animate-pulse rounded-[var(--path-radius-card)] bg-slate-200" />
            <div className="h-[34rem] animate-pulse rounded-[var(--path-radius-card)] bg-slate-200" />
          </div>
        ) : null}

        {error && !loading ? (
          <div className="rounded-[var(--path-radius-card)] border border-border bg-white p-[var(--path-space-3)] text-sm font-semibold text-[color:var(--path-ink)]">
            {error}
          </div>
        ) : null}

        {!loading && !error && path ? (
          <LearningPath
            units={path.units}
            celebrateLessonId={celebrateLessonId}
            onLessonPress={(lesson) => onLessonPress(lesson.id)}
            onEventPress={onOpenEvent}
            mascot={{ visible: mascotVisible, message: mascotLine, onDismiss: () => setMascotVisible(false) }}
          />
        ) : null}
        <ChildBottomNav />
      </PageShell>

      {selectedEvent ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" onClick={() => setSelectedEvent(null)}>
          <div
            className="w-full max-w-sm rounded-[var(--path-radius-modal)] border border-border bg-white p-[var(--path-space-3)] shadow-[var(--path-shadow-1)]"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`Evento ${selectedEvent.title}`}
          >
            <h2 className="text-base font-black text-[color:var(--path-ink)]">{selectedEvent.title}</h2>
            <p className="mt-2 inline-flex rounded-full border border-border bg-[color:var(--path-surface-alt)] px-2 py-1 text-xs font-black text-[color:var(--path-ink)]">
              {selectedEvent.status}
            </p>
            {eventResult ? (
              <p className="mt-2 rounded-full border border-border bg-[color:var(--path-surface-alt)] px-2 py-1 text-xs font-black text-[color:var(--path-ink)]">
                {eventResult.passed ? "Concluido" : "Nao concluido"}
              </p>
            ) : null}
            <div className="mt-[var(--path-space-3)] grid grid-cols-3 gap-2">
              <Button variant="outline" className="min-h-[var(--path-touch)]" onClick={() => setSelectedEvent(null)}>
                Fechar
              </Button>
              <Button className="min-h-[var(--path-touch)]" onClick={() => void onStartEvent()} disabled={eventLoading !== null || selectedEvent.status === "LOCKED"}>
                {eventLoading === "start" ? "..." : "Iniciar"}
              </Button>
              <Button
                variant="secondary"
                className="min-h-[var(--path-touch)]"
                onClick={() => void onCompleteEvent()}
                disabled={eventLoading !== null || selectedEvent.status === "LOCKED"}
              >
                {eventLoading === "complete" ? "..." : "Concluir"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <style jsx global>{`
        @keyframes path-badge-idle-float {
          0% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-1px);
          }
          100% {
            transform: translateY(0);
          }
        }
        @keyframes path-completed-pop {
          0% {
            transform: scale(0.92);
          }
          55% {
            transform: scale(1.06);
          }
          100% {
            transform: scale(1);
          }
        }
        @keyframes path-active-idle {
          0% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-1px);
          }
          100% {
            transform: translateY(0);
          }
        }
        @keyframes path-hero-ring-breathe {
          0% {
            opacity: 0.6;
          }
          50% {
            opacity: 0.9;
          }
          100% {
            opacity: 0.6;
          }
        }
        @keyframes path-start-bob {
          0% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-3px);
          }
          100% {
            transform: translateY(0);
          }
        }
        @keyframes path-checkpoint-shine {
          0% {
            transform: translateX(-34px);
            opacity: 0;
          }
          20% {
            opacity: 0.8;
          }
          60% {
            opacity: 0.75;
          }
          100% {
            transform: translateX(120px);
            opacity: 0;
          }
        }
        @keyframes path-checkpoint-confetti {
          0% {
            transform: translateY(0) scale(0.75);
            opacity: 0;
          }
          30% {
            opacity: 1;
          }
          100% {
            transform: translateY(-12px) scale(1);
            opacity: 0;
          }
        }
        @keyframes path-next-badge-pulse {
          0% {
            transform: scale(1);
            filter: brightness(1);
          }
          45% {
            transform: scale(1.04);
            filter: brightness(1.06);
          }
          100% {
            transform: scale(1);
            filter: brightness(1);
          }
        }
        @keyframes path-axion-idle {
          0% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-1px);
          }
          100% {
            transform: translateY(0);
          }
        }
        @keyframes path-milestone-radial {
          0% {
            transform: scale(0.92);
            opacity: 0;
          }
          35% {
            opacity: 0.9;
          }
          100% {
            transform: scale(1.08);
            opacity: 0;
          }
        }
        .path-badge-idle {
          animation: path-badge-idle-float 2.6s ease-in-out infinite;
        }
        .path-completed-pop {
          animation: path-completed-pop 350ms cubic-bezier(0.22, 0.61, 0.36, 1);
        }
        .path-hero-ring-breathe {
          animation: path-hero-ring-breathe 2.2s ease-in-out infinite;
        }
        .path-badge-active-idle {
          animation: path-active-idle 2.2s ease-in-out infinite;
        }
        .path-start-bob {
          animation: path-start-bob 1.6s ease-in-out infinite;
        }
        .path-checkpoint-shine > span {
          animation: path-checkpoint-shine 2.6s ease-in-out infinite;
        }
        .path-checkpoint-confetti {
          animation: path-checkpoint-confetti 680ms ease-out;
        }
        .path-next-badge-pulse {
          animation: path-next-badge-pulse 420ms cubic-bezier(0.22, 0.61, 0.36, 1) 1;
        }
        .path-milestone-radial-ring {
          animation: path-milestone-radial 520ms ease-out;
        }
        .path-axion-idle {
          animation: path-axion-idle 2.8s ease-in-out infinite;
        }
        .path-badge-button:active .path-badge-base {
          opacity: 0.15;
        }
        @media (prefers-reduced-motion: reduce) {
          .path-start-bob {
            animation: none;
          }
          .path-badge-idle,
          .path-completed-pop,
          .path-hero-ring-breathe,
          .path-badge-active-idle,
          .path-checkpoint-shine > span,
          .path-checkpoint-confetti,
          .path-next-badge-pulse,
          .path-milestone-radial-ring,
          .path-axion-idle {
            animation: none;
          }
        }
      `}</style>
    </>
  );
}

"use client";

/**
 * useLessonSession — Canonical session orchestration hook for Axiora learning.
 *
 * Architectural intent (Wave 3 refactor, 2026-03-17):
 *   Extracts the session lifecycle (start → questions → finish) from the
 *   2000+ line lesson page component into a reusable, testable hook.
 *
 * Contract:
 *   - Single responsibility: manages the LearningSession lifecycle.
 *   - Does NOT handle UI state (feedback, animations, energy, streak).
 *   - Does NOT call /api/aprender/lessons/{id}/complete directly.
 *     Lesson progress is updated internally by the backend on session finish.
 *
 * Breaking change from previous dual-completion pattern:
 *   - OLD: frontend called completeAprenderLesson THEN finishLearningSession
 *   - NEW: frontend only calls finishLearningSession; backend absorbs lesson
 *     progress update (see learning.py finish_session, Wave 2).
 *
 * Migration: page.tsx progressively adopts this hook by forwarding state
 * through the returned interface. Full extraction planned post-Wave 3.
 */

import { useCallback, useRef, useState } from "react";

import {
  type LearningNextItem,
  type LearningSessionFinishResponse,
  type LearningSessionStartResponse,
  ApiError,
  finishLearningSession,
  getAdaptiveLearningNext,
  startLearningSession,
} from "@/lib/api/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SessionPhase =
  | "idle"
  | "starting"
  | "active"
  | "finishing"
  | "completed"
  | "error";

export type LessonSessionState = {
  phase: SessionPhase;
  session: LearningSessionStartResponse | null;
  result: LearningSessionFinishResponse | null;
  error: string | null;
};

export type UseLessonSessionReturn = {
  state: LessonSessionState;
  /** Start an adaptive learning session for the given lessonId. */
  startSession: (lessonId: number) => Promise<LearningSessionStartResponse>;
  /** Fetch next batch of questions for the current session. */
  fetchNextBatch: (opts: { subjectId: number; lessonId: number; count?: number }) => Promise<LearningNextItem[]>;
  /** Finish the current session. Lesson progress is updated server-side (no dual write). */
  finishSession: (opts: {
    answeredCount: number;
    correctCount: number;
    decisionId?: string;
  }) => Promise<LearningSessionFinishResponse>;
  /** Reset the hook to idle state (e.g., on navigation). */
  reset: () => void;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const START_RETRY_DELAYS_MS = [0, 1200, 2500];

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useLessonSession(): UseLessonSessionReturn {
  const [state, setState] = useState<LessonSessionState>({
    phase: "idle",
    session: null,
    result: null,
    error: null,
  });

  // Guard against concurrent finish calls
  const finishingRef = useRef(false);

  const reset = useCallback(() => {
    finishingRef.current = false;
    setState({ phase: "idle", session: null, result: null, error: null });
  }, []);

  // ── Session start (with exponential backoff) ────────────────────────────────

  const startSession = useCallback(async (lessonId: number): Promise<LearningSessionStartResponse> => {
    setState((prev) => ({ ...prev, phase: "starting", error: null }));
    let lastErr: unknown = null;

    for (let attempt = 0; attempt < START_RETRY_DELAYS_MS.length; attempt++) {
      const waitMs = START_RETRY_DELAYS_MS[attempt];
      if (waitMs > 0) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, waitMs));
      }
      try {
        const session = await startLearningSession({ lessonId });
        setState((prev) => ({ ...prev, phase: "active", session }));
        return session;
      } catch (err) {
        lastErr = err;
      }
    }

    const message =
      lastErr instanceof ApiError
        ? lastErr.message ?? "Não foi possível iniciar a sessão."
        : "Não foi possível iniciar a sessão adaptativa.";
    setState((prev) => ({ ...prev, phase: "error", error: message }));
    throw lastErr ?? new Error("Learning session start failed");
  }, []);

  // ── Question batch loading ──────────────────────────────────────────────────

  const fetchNextBatch = useCallback(
    async (opts: { subjectId: number; lessonId: number; count?: number }): Promise<LearningNextItem[]> => {
      const response = await getAdaptiveLearningNext({
        subjectId: opts.subjectId,
        lessonId: opts.lessonId,
        count: opts.count ?? 8,
      });
      return response.items;
    },
    [],
  );

  // ── Session finish (single write — Wave 2 contract) ────────────────────────

  const finishSession = useCallback(
    async (opts: {
      answeredCount: number;
      correctCount: number;
      decisionId?: string;
    }): Promise<LearningSessionFinishResponse> => {
      const currentSession = state.session;
      if (!currentSession) throw new Error("No active session to finish");
      if (finishingRef.current) throw new Error("Finish already in progress");

      finishingRef.current = true;
      setState((prev) => ({ ...prev, phase: "finishing" }));

      try {
        /**
         * Single call — backend handles:
         *   1. Adaptive session closure (XP, coins, mastery)
         *   2. LessonProgress update (via absorbed complete_lesson with no double reward)
         *
         * NO call to /api/aprender/lessons/{id}/complete from the frontend.
         * That endpoint is deprecated (Deprecation header emitted by server).
         */
        const result = await finishLearningSession({
          sessionId: currentSession.sessionId,
          totalQuestions: opts.answeredCount,
          correctCount: opts.correctCount,
          decisionId: opts.decisionId,
        });

        setState((prev) => ({ ...prev, phase: "completed", result }));
        return result;
      } catch (err) {
        // Build a minimal offline fallback so UX doesn't block on transient failures.
        // This fallback intentionally shows 0 XP/coins (conservative; server state unknown).
        const accuracy =
          opts.answeredCount > 0
            ? Math.max(0, Math.min(1, opts.correctCount / opts.answeredCount))
            : 0;
        const stars = accuracy >= 0.9 ? 3 : accuracy >= 0.6 ? 2 : 1;
        const fallback: LearningSessionFinishResponse = {
          sessionId: currentSession.sessionId,
          endedAt: new Date().toISOString(),
          stars,
          accuracy,
          totalQuestions: Math.max(opts.answeredCount, 1),
          correctCount: opts.correctCount,
          xpEarned: 0,
          coinsEarned: 0,
          leveledUp: false,
          gamification: { xp: 0, level: 1, axionCoins: 0 },
        };

        setState((prev) => ({ ...prev, phase: "completed", result: fallback }));
        // Re-throw so callers can show error feedback while still having a result
        throw err;
      } finally {
        finishingRef.current = false;
      }
    },
    [state.session],
  );

  return { state, startSession, fetchNextBatch, finishSession, reset };
}

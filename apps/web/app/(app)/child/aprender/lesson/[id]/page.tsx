"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, Coins, Flame, Lightbulb, Star, XCircle, Zap } from "lucide-react";

import { ChildBottomNav } from "@/components/child-bottom-nav";
import { ChildDesktopShell } from "@/components/child-desktop-shell";
import { TopStatsBar } from "@/components/trail/TopStatsBar";
import { ConfettiBurst } from "@/components/confetti-burst";
import { useMeasuredViewportContainer } from "@/hooks/useMeasuredViewportContainer";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ProgressBar } from "@/components/ui/progress-bar";
import {
  ApiError,
  consumeAprenderWrongAnswerEnergy,
  finishLearningSession,
  getCurrentMissions,
  getAdaptiveLearningNext,
  getApiErrorMessage,
  getLearningPath,
  getAprenderLearningEnergy,
  getAprenderLearningProfile,
  getAprenderLearningStreak,
  refillAprenderEnergyWithCoins,
  refillAprenderEnergyWithWait,
  startLearningSession,
  submitAdaptiveLearningAnswer,
  trackAxionCtaExecuted,
  trackAxionSessionStarted,
  type AprenderLearningEnergyStatus,
  type AprenderLearningStreak,
  type LearningAnswerResult,
  type LearningNextItem,
  type LearningSessionFinishResponse,
  type LearningSessionStartResponse,
  type MissionsCurrentResponse,
} from "@/lib/api/client";
// NOTE: completeAprenderLesson removed — lesson progress is now absorbed by
// finishLearningSession on the backend (Wave 2, 2026-03-17).
// See: useLessonSession.ts and apps/api/app/api/routes/learning.py::finish_session
import { resolveWeeklyGoalProgress } from "@/lib/gamification-derivations";
import {
  effectiveReducedMotion,
  fetchUXSettings,
  hapticCompletion,
  hapticLevelUp,
  hapticPress,
  playSfx,
} from "@/lib/ux-feedback";
import type { UserUXSettings } from "@/lib/api/client";
import { trackAprenderEvent } from "@/lib/learning/analytics";
import { writeRecentLearningReward } from "@/lib/learning/reward-cache";
import { cn } from "@/lib/utils";

type FeedbackState = {
  tone: "success" | "encourage";
  message: string;
} | null;

type QuestionOutcome = {
  result: LearningAnswerResult;
  correct: boolean;
  wrongAnswer?: string | null;
};

type SelectOption = {
  id: string;
  label: string;
};

type DragPair = {
  itemId: string;
  itemLabel: string;
  targetId: string;
  targetLabel: string;
};

type OrderingItem = {
  id: string;
  label: string;
  correctOrder: number;
};

type LessonResumeSnapshot = {
  lessonId: number;
  childId: number | null;
  savedAt: number;
  session: LearningSessionStartResponse | null;
  queue: LearningNextItem[];
  index: number;
  answeredByStep: Record<number, boolean>;
  correctByStep: Record<number, boolean>;
  sessionTargetQuestions: number;
  questionSupplyExhausted: boolean;
  offlineMode: boolean;
  lessonContextLabel: string | null;
  offlineSubjectName: string | null;
  unitProgressPercent: number;
};

type LessonDesktopRailProps = {
  sessionProgress: number;
  masteryPercent: number;
  answered: number;
  target: number;
  energyLabel: string;
  waitClock: string | null;
  compact?: boolean;
};
const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"];

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toStringSafe(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function readActiveChildId(): number | null {
  if (typeof window === "undefined") return null;
  const rawChildId = window.sessionStorage.getItem("axiora_child_id");
  const childId = rawChildId ? Number(rawChildId) : NaN;
  return Number.isFinite(childId) && childId > 0 ? childId : null;
}

function buildLessonResumeStorageKey(lessonId: number, childId: number | null): string {
  return `axiora:lesson-resume:${childId ?? "anon"}:${lessonId}`;
}

function normalizeOptions(metadata: Record<string, unknown>): SelectOption[] {
  const optionsRaw = asArray(metadata.options).length > 0 ? asArray(metadata.options) : asArray(metadata.choices);
  return optionsRaw
    .map((entry, index) => {
      const parsed = asRecord(entry);
      return {
        id: toStringSafe(parsed.id, `opt-${index + 1}`),
        label: toStringSafe(parsed.label, toStringSafe(parsed.text, `Opcao ${index + 1}`)),
      };
    })
    .filter((option) => option.id.length > 0 && option.label.length > 0);
}

function normalizePairs(metadata: Record<string, unknown>): DragPair[] {
  const pairsRaw = asArray(metadata.pairs).length > 0 ? asArray(metadata.pairs) : asArray(metadata.matchPairs);
  return pairsRaw
    .map((entry, index) => {
      const parsed = asRecord(entry);
      return {
        itemId: toStringSafe(parsed.itemId, `item-${index + 1}`),
        itemLabel: toStringSafe(parsed.itemLabel, toStringSafe(parsed.left)),
        targetId: toStringSafe(parsed.targetId, `target-${index + 1}`),
        targetLabel: toStringSafe(parsed.targetLabel, toStringSafe(parsed.right)),
      };
    })
    .filter((pair) => pair.itemLabel.length > 0 && pair.targetLabel.length > 0);
}

function normalizeOrderingItems(metadata: Record<string, unknown>): OrderingItem[] {
  const itemsRaw = asArray(metadata.items).length > 0 ? asArray(metadata.items) : asArray(metadata.sequence);
  const correctOrderSequence = asArray(metadata.correctOrder).map((entry) =>
    toStringSafe(asRecord(entry).label, toStringSafe(asRecord(entry).id, toStringSafe(entry))).trim().toLocaleLowerCase(),
  );
  return itemsRaw
    .map((entry, index) => {
      const parsed = asRecord(entry);
      const fallbackId = `step-${index + 1}`;
      const fallbackLabel = toStringSafe(entry, fallbackId);
      const label = toStringSafe(parsed.label, toStringSafe(parsed.text, fallbackLabel));
      const orderRaw = parsed.correctOrder ?? parsed.order ?? parsed.position;
      const normalizedLabel = label.trim().toLocaleLowerCase();
      const normalizedId = toStringSafe(parsed.id, fallbackId).trim().toLocaleLowerCase();
      const fallbackOrderFromSequence = Math.max(
        correctOrderSequence.findIndex((token) => token === normalizedLabel || token === normalizedId),
        -1,
      );
      const order =
        typeof orderRaw === "number" && Number.isFinite(orderRaw)
          ? Math.max(1, Math.floor(orderRaw))
          : fallbackOrderFromSequence >= 0
            ? fallbackOrderFromSequence + 1
            : index + 1;
      return {
        id: toStringSafe(parsed.id, fallbackId),
        label,
        correctOrder: order,
      };
    })
    .filter((item) => item.id.length > 0 && item.label.length > 0);
}

function evaluateSelection(metadata: Record<string, unknown>, optionId: string): QuestionOutcome {
  const correctOptionId = toStringSafe(metadata.correctOptionId);
  if (!correctOptionId) {
    return { result: "SKIPPED", correct: false };
  }
  const ok = optionId === correctOptionId;
  return { result: ok ? "CORRECT" : "WRONG", correct: ok };
}

function evaluateDragDrop(metadata: Record<string, unknown>, assignments: Record<string, string>): QuestionOutcome {
  const pairs = normalizePairs(metadata);
  if (!pairs.length) return { result: "SKIPPED", correct: false };
  const ok = pairs.every((pair) => assignments[pair.itemId] === pair.targetId);
  return { result: ok ? "CORRECT" : "WRONG", correct: ok };
}

function evaluateOrdering(metadata: Record<string, unknown>, orderingIds: string[], promptText?: string | null): QuestionOutcome {
  const items = normalizeOrderingItems(metadata);
  if (items.length < 2 || orderingIds.length < items.length) return { result: "SKIPPED", correct: false };
  const prompt = toStringSafe(promptText).toLocaleLowerCase();
  const numericItems = items.map((item) => ({ ...item, numericValue: Number(item.label.replace(",", ".")) }));
  const allNumeric = numericItems.every((item) => Number.isFinite(item.numericValue));
  const expectsAscending =
    prompt.includes("ordem crescente") ||
    prompt.includes("menor para o maior") ||
    prompt.includes("crescente");
  const expectsDescending =
    prompt.includes("ordem decrescente") ||
    prompt.includes("maior para o menor") ||
    prompt.includes("decrescente");
  const expected = allNumeric && (expectsAscending || expectsDescending)
    ? [...numericItems]
        .sort((a, b) => (expectsDescending ? b.numericValue - a.numericValue : a.numericValue - b.numericValue))
        .map((item) => item.id)
    : [...items].sort((a, b) => a.correctOrder - b.correctOrder).map((item) => item.id);
  const ok = expected.every((id, idx) => orderingIds[idx] === id);
  return { result: ok ? "CORRECT" : "WRONG", correct: ok };
}

function evaluateFillBlank(metadata: Record<string, unknown>, rawAnswer: string): QuestionOutcome {
  const expected = toStringSafe(metadata.answer).trim();
  const provided = rawAnswer.trim();
  if (!expected || !provided) return { result: "SKIPPED", correct: false, wrongAnswer: provided || null };
  const ok = expected.localeCompare(provided, undefined, { sensitivity: "base" }) === 0;
  return { result: ok ? "CORRECT" : "WRONG", correct: ok, wrongAnswer: ok ? null : provided };
}

function diversifyQuestionBatch(items: LearningNextItem[]): LearningNextItem[] {
  const next = [...items];
  if (next.length < 3) return next;
  for (let i = 2; i < next.length; i += 1) {
    const t0 = next[i - 2]?.type;
    const t1 = next[i - 1]?.type;
    const ti = next[i]?.type;
    if (!t0 || !t1 || !ti) continue;
    if (t0 === t1 && t1 === ti) {
      const replacementIdx = next.findIndex((candidate, idx) => idx > i && candidate.type !== ti);
      if (replacementIdx >= 0) {
        const temp = next[i];
        next[i] = next[replacementIdx];
        next[replacementIdx] = temp;
      }
    }
  }
  return next;
}

function diversifyIncomingBatch(prefix: LearningNextItem[], incoming: LearningNextItem[]): LearningNextItem[] {
  const input = [...prefix.slice(-2), ...incoming];
  const diversified = diversifyQuestionBatch(input);
  return diversified.slice(Math.max(0, diversified.length - incoming.length));
}

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function starMessage(stars: number): string {
  if (stars === 3) return "Excelente! Sessão perfeita.";
  if (stars === 2) return "Muito bom! Você evoluiu bastante.";
  return "Bom esforço! Continue praticando para subir de nível.";
}

function resolveAxionTip(question: LearningNextItem | null): string {
  if (!question) return "Dica do Axion: respire, leia com calma e avance passo a passo.";
  const metadata = asRecord(question.metadata);
  const directHint = toStringSafe(metadata.axionTip, toStringSafe(metadata.hint));
  if (directHint) return `Dica do Axion: ${directHint}`;
  if (question.explanation) return `Dica do Axion: ${question.explanation}`;
  if (question.type === "DRAG_DROP") return "Dica do Axion: conecte cada item pela ideia principal antes de arrastar.";
  if (question.type === "MATCH") return "Dica do Axion: primeiro resolva mentalmente e depois associe.";
  if (question.type === "ORDERING") return "Dica do Axion: compare pares e monte a sequência por etapas.";
  if (question.type === "TRUE_FALSE") return "Dica do Axion: procure palavras-chave para validar a afirmação.";
  if (question.type === "FILL_BLANK") return "Dica do Axion: pense no contexto da frase para completar com segurança.";
  return "Dica do Axion: você aprende melhor quando revisa a resposta com atenção.";
}

function difficultyLabel(difficulty: LearningNextItem["difficulty"] | undefined): { text: string; className: string } {
  if (difficulty === "HARD") return { text: "Difícil", className: "border-violet-400/70 bg-[linear-gradient(180deg,rgba(245,243,255,0.96),rgba(221,214,254,0.9))] text-violet-800 shadow-[0_2px_8px_rgba(109,40,217,0.14),inset_0_1px_0_rgba(255,255,255,0.6)]" };
  if (difficulty === "MEDIUM") return { text: "Média", className: "border-amber-400/70 bg-[linear-gradient(180deg,rgba(255,251,235,0.96),rgba(253,230,138,0.86))] text-amber-800 shadow-[0_2px_8px_rgba(217,119,6,0.12),inset_0_1px_0_rgba(255,255,255,0.6)]" };
  return { text: "Fácil", className: "border-emerald-400/65 bg-[linear-gradient(180deg,rgba(236,253,245,0.96),rgba(167,243,208,0.84))] text-emerald-800 shadow-[0_2px_8px_rgba(5,150,105,0.12),inset_0_1px_0_rgba(255,255,255,0.6)]" };
}

function LessonDesktopRail({
  sessionProgress,
  masteryPercent,
  answered,
  target,
  energyLabel,
  waitClock,
  compact = false,
}: LessonDesktopRailProps) {
  const safeSession = Math.max(0, Math.min(100, Math.round(sessionProgress)));
  const safeMastery = Math.max(0, Math.min(100, Math.round(masteryPercent)));
  return (
    <div className={cn(compact ? "space-y-2" : "space-y-2.5 xl:space-y-3")}>
      {/* Card de sessão — estilo parchment igual ao rail da trilha */}
      <div className={cn("relative overflow-hidden rounded-[22px] border border-[#A07850]/40 bg-[linear-gradient(145deg,rgba(253,245,230,0.88),rgba(240,222,188,0.78))] shadow-[0_8px_24px_rgba(44,30,18,0.18),inset_0_1px_0_rgba(255,255,255,0.7)]", compact ? "p-3" : "p-3.5 xl:p-4")}>
        <div aria-hidden className={cn("pointer-events-none absolute inset-x-0 top-0 rounded-t-[22px] bg-[radial-gradient(60%_80%_at_50%_0%,rgba(255,183,3,0.08),transparent)]", compact ? "h-10" : "h-12")} />
        <p className="text-[10px] font-black uppercase tracking-[0.12em]" style={{ color: "#8A5A22" }}>Sessão</p>
        <p className={cn("mt-1 font-black leading-tight", compact ? "text-[16px]" : "text-[18px]")} style={{ color: "#2C1E16" }}>
          {answered}/{Math.max(1, target)} etapas
        </p>
        <p className={cn("mt-1 font-bold", compact ? "text-[11px]" : "text-[12px]")} style={{ color: "#4E3725" }}>
          {waitClock ? `Energia recarrega em ${waitClock}` : `Energia ${energyLabel}`}
        </p>
      </div>

      {/* Card de progresso */}
      <div className={cn("relative overflow-hidden rounded-[22px] border border-[#A07850]/40 bg-[linear-gradient(145deg,rgba(253,245,230,0.88),rgba(240,222,188,0.78))] shadow-[0_8px_24px_rgba(44,30,18,0.18),inset_0_1px_0_rgba(255,255,255,0.7)]", compact ? "p-3" : "p-3.5 xl:p-4")}>
        <div className={cn(compact ? "space-y-2.5" : "space-y-3")}>
          <div>
            <div className="mb-1.5 flex items-center justify-between text-[11px] font-extrabold" style={{ color: "#4E3725" }}>
              <span>Progresso da sessão</span>
              <span style={{ color: "#8B5E1A" }}>{safeSession}%</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full border border-[#A07850]/35 bg-[rgba(160,120,80,0.15)] shadow-[inset_0_1px_2px_rgba(44,30,18,0.12)]">
              <div className="h-full rounded-full bg-gradient-to-r from-[#FFB703] via-[#FB8C00] to-[#D96C2A] shadow-[0_0_8px_rgba(255,183,3,0.4)] transition-[width] duration-300 ease-out" style={{ width: `${safeSession}%` }} />
            </div>
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between text-[11px] font-extrabold" style={{ color: "#4E3725" }}>
              <span>Domínio atual</span>
              <span style={{ color: "#8B5E1A" }}>{safeMastery}%</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full border border-[#A07850]/35 bg-[rgba(160,120,80,0.15)] shadow-[inset_0_1px_2px_rgba(44,30,18,0.12)]">
              <div className="h-full rounded-full bg-gradient-to-r from-[#4DD9AC] to-[#38BDF8] shadow-[0_0_8px_rgba(77,217,172,0.35)] transition-[width] duration-300 ease-out" style={{ width: `${safeMastery}%` }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function questionFingerprint(item: LearningNextItem): string {
  const metadata = asRecord(item.metadata);
  const options = normalizeOptions(metadata).map((option) => option.label.trim().toLocaleLowerCase()).join("|");
  const pairs = normalizePairs(metadata)
    .map((pair) => `${pair.itemLabel.trim().toLocaleLowerCase()}=>${pair.targetLabel.trim().toLocaleLowerCase()}`)
    .join("|");
  const ordering = normalizeOrderingItems(metadata)
    .map((entry) => `${entry.label.trim().toLocaleLowerCase()}@${entry.correctOrder}`)
    .join("|");
  const answer = toStringSafe(metadata.answer).trim().toLocaleLowerCase();
  const correctOrder = asArray(metadata.correctOrder)
    .map((entry) => toStringSafe(asRecord(entry).label, toStringSafe(asRecord(entry).id, toStringSafe(entry))).trim().toLocaleLowerCase())
    .join("|");
  return [
    item.type,
    toStringSafe(item.prompt).trim().toLocaleLowerCase(),
    options,
    pairs,
    ordering,
    answer,
    correctOrder,
  ].join("|");
}

function resolveOfflineSubjectKey(subjectName: string | null): "portuguese" | "math" | "generic" {
  const token = String(subjectName || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  if (token.includes("portugues")) return "portuguese";
  if (token.includes("matematica")) return "math";
  return "generic";
}

function buildOfflineQuestions(lessonId: number, subjectName?: string | null): LearningNextItem[] {
  const lid = Number.isFinite(lessonId) && lessonId > 0 ? lessonId : 0;
  const key = resolveOfflineSubjectKey(subjectName ?? null);
  if (key === "portuguese") {
    return [
      {
        questionId: `offline-pt-${lid}-1`,
        templateId: null,
        generatedVariantId: null,
        variantId: null,
        skillId: "offline-pt-1",
        difficulty: "EASY",
        type: "MCQ",
        prompt: "Quantas sílabas tem a palavra 'janela'?",
        explanation: "Separe em partes sonoras: ja-ne-la.",
        metadata: {
          options: [
            { id: "a", label: "2" },
            { id: "b", label: "3" },
            { id: "c", label: "4" },
            { id: "d", label: "5" },
          ],
          correctOptionId: "b",
        },
      },
      {
        questionId: `offline-pt-${lid}-2`,
        templateId: null,
        generatedVariantId: null,
        variantId: null,
        skillId: "offline-pt-2",
        difficulty: "EASY",
        type: "FILL_BLANK",
        prompt: "Complete com a pontuação correta: Vamos começar agora __",
        explanation: "Frase exclamativa costuma terminar com ponto de exclamação.",
        metadata: {
          options: [
            { id: "a", label: "!" },
            { id: "b", label: "." },
            { id: "c", label: "," },
            { id: "d", label: "?" },
          ],
          correctOptionId: "a",
          answer: "!",
        },
      },
      {
        questionId: `offline-pt-${lid}-3`,
        templateId: null,
        generatedVariantId: null,
        variantId: null,
        skillId: "offline-pt-3",
        difficulty: "MEDIUM",
        type: "TRUE_FALSE",
        prompt: "Verdadeiro ou falso: Toda frase deve começar com letra maiúscula.",
        explanation: "A inicial maiúscula organiza a leitura e respeita a norma.",
        metadata: {
          options: [
            { id: "true", label: "Verdadeiro" },
            { id: "false", label: "Falso" },
          ],
          correctOptionId: "true",
        },
      },
      {
        questionId: `offline-pt-${lid}-4`,
        templateId: null,
        generatedVariantId: null,
        variantId: null,
        skillId: "offline-pt-4",
        difficulty: "MEDIUM",
        type: "ORDERING",
        prompt: "Organize os trechos para formar a frase correta.",
        explanation: "Pense em sujeito + verbo + complemento.",
        metadata: {
          items: [
            { id: "p2", label: "lê um livro", correctOrder: 2 },
            { id: "p1", label: "Sofia", correctOrder: 1 },
            { id: "p3", label: "na sala", correctOrder: 3 },
          ],
        },
      },
    ];
  }
  if (key === "math") {
    return [
      {
        questionId: `offline-math-${lid}-1`,
        templateId: null,
        generatedVariantId: null,
        variantId: null,
        skillId: "offline-core-1",
        difficulty: "EASY",
        type: "MCQ",
        prompt: "Sofia tinha 1 adesivo e ganhou 7 adesivos. Quantos adesivos tem agora?",
        explanation: "Some os adesivos iniciais aos que ela ganhou.",
        metadata: {
          options: [
            { id: "a", label: "4" },
            { id: "b", label: "8" },
            { id: "c", label: "7" },
            { id: "d", label: "13" },
          ],
          correctOptionId: "b",
        },
      },
      {
        questionId: `offline-math-${lid}-2`,
        templateId: null,
        generatedVariantId: null,
        variantId: null,
        skillId: "offline-core-2",
        difficulty: "MEDIUM",
        type: "TRUE_FALSE",
        prompt: "Verdadeiro ou falso: 14 + 11 = 30",
        explanation: "14 + 11 é igual a 25.",
        metadata: {
          options: [
            { id: "true", label: "Verdadeiro" },
            { id: "false", label: "Falso" },
          ],
          correctOptionId: "false",
        },
      },
      {
        questionId: `offline-math-${lid}-3`,
        templateId: null,
        generatedVariantId: null,
        variantId: null,
        skillId: "offline-core-3",
        difficulty: "MEDIUM",
        type: "MATCH",
        prompt: "Conecte cada operação ao resultado.",
        explanation: "Resolva primeiro as contas mais simples.",
        metadata: {
          pairs: [
            { itemId: "sum1", itemLabel: "3 + 2", targetId: "t5", targetLabel: "5" },
            { itemId: "sum2", itemLabel: "6 + 1", targetId: "t7", targetLabel: "7" },
            { itemId: "sum3", itemLabel: "4 + 4", targetId: "t8", targetLabel: "8" },
          ],
        },
      },
      {
        questionId: `offline-math-${lid}-4`,
        templateId: null,
        generatedVariantId: null,
        variantId: null,
        skillId: "offline-core-4",
        difficulty: "EASY",
        type: "ORDERING",
        prompt: "Organize os números do menor para o maior.",
        explanation: "Compare um par de cada vez.",
        metadata: {
          items: [
            { id: "n8", label: "8", correctOrder: 3 },
            { id: "n2", label: "2", correctOrder: 1 },
            { id: "n5", label: "5", correctOrder: 2 },
          ],
        },
      },
    ];
  }
  return [
    {
      questionId: `offline-generic-${lid}-1`,
      templateId: null,
      generatedVariantId: null,
      variantId: null,
      skillId: "offline-generic-1",
      difficulty: "EASY",
      type: "MCQ",
      prompt: "Leia com atenção e escolha a alternativa correta para completar a atividade.",
      explanation: "Use pistas do enunciado para decidir com calma.",
      metadata: {
        options: [
          { id: "a", label: "Alternativa A" },
          { id: "b", label: "Alternativa B" },
          { id: "c", label: "Alternativa C" },
          { id: "d", label: "Alternativa D" },
        ],
        correctOptionId: "a",
      },
    },
    {
      questionId: `offline-generic-${lid}-2`,
      templateId: null,
      generatedVariantId: null,
      variantId: null,
      skillId: "offline-generic-2",
      difficulty: "EASY",
      type: "TRUE_FALSE",
      prompt: "Verdadeiro ou falso: Ler o enunciado completo ajuda a responder melhor.",
      explanation: "Compreensão do enunciado melhora a precisão.",
      metadata: {
        options: [
          { id: "true", label: "Verdadeiro" },
          { id: "false", label: "Falso" },
        ],
        correctOptionId: "true",
      },
    },
  ];
}

function resolveQuestionLoadMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return getApiErrorMessage(error, "Não foi possível carregar as perguntas agora.");
  }
  return "Não foi possível carregar as perguntas agora.";
}

function isEmptyBatchError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  const payload = asRecord(error.payload);
  const code = toStringSafe(payload.code).toUpperCase();
  if (code === "EMPTY_BATCH") return true;
  const message = toStringSafe(payload.message).toLowerCase();
  return message.includes("nenhuma pergunta disponível");
}

function readEmptyBatchDiagnostics(error: unknown): Record<string, unknown> | null {
  if (!(error instanceof ApiError)) return null;
  const payload = asRecord(error.payload);
  const diagnostics = asRecord(payload.diagnostics);
  if (Object.keys(diagnostics).length <= 0) return null;
  return diagnostics;
}

function resolveEmptyBatchReason(error: unknown): { title: string; detail: string; diagnostics: Record<string, unknown> | null } {
  const diagnostics = readEmptyBatchDiagnostics(error);
  const fallbackReason = toStringSafe(diagnostics?.fallback_reason);
  const blockReason = toStringSafe(diagnostics?.block_reason);
  const reasonToken = blockReason || fallbackReason;
  if (reasonToken === "subject_disabled_by_settings") {
    return {
      title: "Conteúdo desta matéria está desativado.",
      detail: "Peça para o responsável habilitar esta matéria nas configurações de aprendizado.",
      diagnostics,
    };
  }
  if (reasonToken === "no_focus_skills") {
    return {
      title: "Ainda estamos preparando sua próxima etapa.",
      detail: "Não encontramos habilidades elegíveis para esta lição agora.",
      diagnostics,
    };
  }
  if (reasonToken === "no_source_content_for_skill_difficulty") {
    return {
      title: "Esta lição está sem perguntas disponíveis no momento.",
      detail: "Não há conteúdo publicado para este nível agora. Tente novamente mais tarde.",
      diagnostics,
    };
  }
  if (reasonToken === "template_candidates_rejected_or_exhausted") {
    return {
      title: "As perguntas desta lição foram bloqueadas por validação.",
      detail: "Os candidatos não passaram nos filtros de segurança/qualidade. Tente novamente em instantes.",
      diagnostics,
    };
  }
  return {
    title: "Não encontramos perguntas para esta lição agora.",
    detail: "Tente novamente em alguns instantes. Seu progresso está seguro.",
    diagnostics,
  };
}

function shouldFallbackToOfflineForEmptyBatch(error: unknown): boolean {
  const diagnostics = readEmptyBatchDiagnostics(error);
  const reasonToken = toStringSafe(diagnostics?.block_reason) || toStringSafe(diagnostics?.fallback_reason);
  return reasonToken === "no_source_content_for_skill_difficulty" || reasonToken === "template_candidates_rejected_or_exhausted";
}

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

function pickBySeed(seed: string, salt: string, values: readonly string[]): string {
  if (!values.length) return "";
  const idx = hashSeed(`${seed}|${salt}`) % values.length;
  return values[idx];
}

const SUCCESS_OPENERS = [
  "Boa resposta!",
  "Muito bem!",
  "Arrasou!",
  "Que demais!",
  "Mandou super bem!",
  "Isso aí!",
  "Brilhou nessa!",
  "Resposta certa!",
  "Acertou em cheio!",
  "Show de bola!",
  "Perfeito!",
  "Excelente!",
  "Uau, você foi ótimo!",
  "Você voou nessa!",
  "Muito capricho!",
  "Parabéns!",
] as const;

const SUCCESS_CORES = [
  "Seu cérebro está em modo turbo.",
  "Você pensou com calma e acertou.",
  "Seu raciocínio foi muito esperto.",
  "Cada acerto deixa você mais forte.",
  "Você está dominando essa habilidade.",
  "Esse foi um belo passo na trilha.",
  "Seu foco fez toda diferença.",
  "Você está ficando craque nisso.",
  "Seu treino está dando resultado.",
  "Você acertou com confiança.",
  "Sua estratégia foi excelente.",
  "Você percebeu o caminho certinho.",
  "Seu progresso está lindo de ver.",
  "Você encarou e resolveu direitinho.",
  "Seu jeito de pensar está afiado.",
  "Isso mostra o quanto você evoluiu.",
  "Você está construindo uma super base.",
  "Seu talento apareceu aqui.",
] as const;

const SUCCESS_CLOSERS = [
  "Vamos para a próxima!",
  "Continue nesse ritmo!",
  "Mais um passinho de campeão.",
  "Bora conquistar outra!",
  "Axion está orgulhoso de você.",
  "Que tal buscar mais uma estrela?",
  "Siga firme, você consegue!",
  "Partiu próximo desafio!",
  "Você está voando!",
  "Mantenha essa energia boa!",
  "Cada acerto conta muito.",
  "Seu mapa está abrindo caminho.",
  "Rumo ao próximo nível!",
  "Já já vem mais recompensa.",
  "Você está em uma fase incrível.",
  "Continue brilhando!",
] as const;

const SUCCESS_STREAK = [
  "Sequência incrível! Continue assim.",
  "Uau! Você está em uma super sequência.",
  "Que ritmo lindo! Sua sequência está crescendo.",
  "Você entrou no embalo dos acertos!",
  "Sequência de mestre ativada!",
  "Axion comemorou sua sequência!",
  "Que constância poderosa!",
  "Você está imparável hoje!",
] as const;

const ENCOURAGE_OPENERS = [
  "Quase lá!",
  "Tudo bem!",
  "Sem problema!",
  "Você está aprendendo!",
  "Respira fundo!",
  "Foi por pouco!",
  "Tá tudo certo!",
  "Faz parte do treino!",
  "Errar também ensina!",
  "Calma, você consegue!",
  "Cada tentativa ajuda!",
  "Você está no caminho!",
] as const;

const ENCOURAGE_CORES = [
  "Vamos tentar de novo com calma.",
  "Seu cérebro aprende muito em cada tentativa.",
  "Com mais uma chance, você acerta.",
  "Olhe os detalhes e tente mais uma vez.",
  "Você está mais perto do acerto do que parece.",
  "Aprender é um passo de cada vez.",
  "Seu esforço vale ouro.",
  "Você está construindo uma base forte.",
  "Cada erro vira uma pista para acertar.",
  "Treino + paciência = progresso.",
  "Axion acredita em você.",
  "A próxima pode ser a certa.",
  "Você já evoluiu muito até aqui.",
  "Seu foco vai te levar longe.",
  "Não desista, você está indo bem.",
  "Seu ritmo é importante.",
] as const;

const ENCOURAGE_CLOSERS = [
  "Vamos juntos!",
  "Você consegue!",
  "Partiu mais uma tentativa!",
  "Tenta de novo, vai dar bom!",
  "Axion está com você.",
  "Mais um passinho e pronto.",
  "Vamos nessa!",
  "Siga confiante!",
  "Bora praticar!",
  "Continua que vai dar certo!",
  "Seu momento de acertar está chegando.",
  "A resposta certa está pertinho.",
] as const;

const MIN_SESSION_QUESTIONS = 3;
const MAX_SESSION_QUESTIONS = 8;
const SHOW_QUESTION_TYPE_DEBUG =
  process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DEBUG_LEARNING_TYPE === "1";

function questionTypeLabel(type: LearningNextItem["type"] | undefined): string {
  if (type === "MCQ") return "Escolha";
  if (type === "TRUE_FALSE") return "V/F";
  if (type === "DRAG_DROP") return "Arrastar";
  if (type === "FILL_BLANK") return "Lacuna";
  if (type === "MATCH") return "Associação";
  if (type === "ORDERING") return "Ordenação";
  if (type === "TEMPLATE") return "Template";
  return "Questão";
}

// REMOVED: persistLessonCompletionOnServer, completeLessonOnServer,
// buildFinishFallbackFromCompletion (Wave 3 — dual completion elimination).
// Lesson progress is now updated by the backend in finish_session.

function resolveXpLevelPercentFromProfileXp(xp: number): number {
  const safeXp = Math.max(0, Math.floor(xp));
  return Math.max(0, Math.min(100, Math.round((safeXp % 100))));
}

function joinParts(parts: string[]): string {
  return parts.filter((part) => part.trim().length > 0).join(" ").replace(/\s+/g, " ").trim();
}

function buildBoundedMessage(candidates: string[], maxChars = 92): string {
  for (const candidate of candidates) {
    const normalized = joinParts([candidate]);
    if (normalized.length <= maxChars) return normalized;
  }
  return joinParts([candidates[0] ?? "Mandou bem!"]);
}

function buildSuccessMicrocopy(seed: string, options: { streakMode: boolean; maxChars?: number }): string {
  const { streakMode, maxChars = 92 } = options;
  const opener = pickBySeed(seed, "s_open", SUCCESS_OPENERS);
  const core = pickBySeed(seed, "s_core", SUCCESS_CORES);
  const closer = pickBySeed(seed, "s_close", SUCCESS_CLOSERS);
  const streak = pickBySeed(seed, "s_streak", SUCCESS_STREAK);
  const candidates = streakMode
    ? [
        joinParts([opener, core, streak]),
        joinParts([opener, streak]),
        joinParts([opener, core]),
        joinParts([opener]),
      ]
    : [
        joinParts([opener, core, closer]),
        joinParts([opener, core]),
        joinParts([opener, closer]),
        joinParts([opener]),
      ];
  return buildBoundedMessage(candidates, maxChars);
}

function buildEncourageMicrocopy(seed: string, options?: { maxChars?: number }): string {
  const maxChars = options?.maxChars ?? 92;
  const opener = pickBySeed(seed, "e_open", ENCOURAGE_OPENERS);
  const core = pickBySeed(seed, "e_core", ENCOURAGE_CORES);
  const closer = pickBySeed(seed, "e_close", ENCOURAGE_CLOSERS);
  const candidates = [
    joinParts([opener, core, closer]),
    joinParts([opener, core]),
    joinParts([opener, closer]),
    joinParts([opener]),
  ];
  return buildBoundedMessage(candidates, maxChars);
}


export default function AdaptiveLessonSessionPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const lessonId = Number(params.id);
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const { width: layoutWidth, height: layoutHeight } = useMeasuredViewportContainer(layoutRef, {
    initialWidth: 1366,
    initialHeight: 768,
    minWidth: 320,
    minHeight: 1,
  });

  const [session, setSession] = useState<LearningSessionStartResponse | null>(null);
  const [queue, setQueue] = useState<LearningNextItem[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [questionError, setQuestionError] = useState<string | null>(null);
  const [contentUnavailableReason, setContentUnavailableReason] = useState<{ title: string; detail: string } | null>(null);
  const [questionRetrying, setQuestionRetrying] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [questionStartedAt, setQuestionStartedAt] = useState<number>(Date.now());
  const [answeredByStep, setAnsweredByStep] = useState<Record<number, boolean>>({});
  const [correctByStep, setCorrectByStep] = useState<Record<number, boolean>>({});
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [fillBlankAnswer, setFillBlankAnswer] = useState("");
  const [dragAssignments, setDragAssignments] = useState<Record<string, string>>({});
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [orderingIds, setOrderingIds] = useState<string[]>([]);
  const [learningStreak, setLearningStreak] = useState<AprenderLearningStreak | null>(null);
  const [energyStatus, setEnergyStatus] = useState<AprenderLearningEnergyStatus | null>(null);
  const [energyLoading, setEnergyLoading] = useState(true);
  const [topBarGems, setTopBarGems] = useState(0);
  const [topBarXp, setTopBarXp] = useState(0);
  const [topBarProfileLoading, setTopBarProfileLoading] = useState(true);
  const [energyActionLoading, setEnergyActionLoading] = useState<"wait" | "coins" | null>(null);
  const [result, setResult] = useState<LearningSessionFinishResponse | null>(null);
  const [pendingCompletionResult, setPendingCompletionResult] = useState<LearningSessionFinishResponse | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [uxSettings, setUxSettings] = useState<UserUXSettings>({
    id: 0,
    userId: 0,
    soundEnabled: true,
    hapticsEnabled: true,
    reducedMotion: false,
    createdAt: "",
    updatedAt: "",
  });
  const [displayXp, setDisplayXp] = useState(0);
  const [displayCoins, setDisplayCoins] = useState(0);
  const [confettiTrigger, setConfettiTrigger] = useState(0);
  const [tipVisible, setTipVisible] = useState(false);
  const [correctFxTick, setCorrectFxTick] = useState(0);
  const [microcopyTick, setMicrocopyTick] = useState(0);
  const [backSaving, setBackSaving] = useState(false);
  const [lessonContextLabel, setLessonContextLabel] = useState<string | null>(null);
  const [offlineSubjectName, setOfflineSubjectName] = useState<string | null>(null);
  const [sessionTargetQuestions, setSessionTargetQuestions] = useState<number>(MIN_SESSION_QUESTIONS);
  const [loadingNextQuestion, setLoadingNextQuestion] = useState(false);
  const [questionSupplyExhausted, setQuestionSupplyExhausted] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);
  const [weeklyGoal, setWeeklyGoal] = useState(() => resolveWeeklyGoalProgress(null, 3));
  const [unitProgressPercent, setUnitProgressPercent] = useState(0);
  const offlineAutoFallbackTriedRef = useRef(false);
  const ctaExecutedLoggedRef = useRef<string | null>(null);
  const sessionStartedLoggedRef = useRef<string | null>(null);
  const reducedMotion = effectiveReducedMotion(uxSettings);
  const axionDecisionId = useMemo(() => {
    const fromQuery = searchParams.get("decision_id")?.trim();
    if (fromQuery) return fromQuery;
    if (typeof window === "undefined") return null;
    const stored = window.sessionStorage.getItem("axion_active_decision_id");
    return stored && stored.trim().length > 0 ? stored : null;
  }, [searchParams]);
  const routeSubjectId = useMemo(() => {
    const parsed = Number(searchParams.get("subjectId"));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    return null;
  }, [searchParams]);
  const activeChildId = useMemo(() => readActiveChildId(), []);
  const lessonResumeStorageKey = useMemo(
    () => buildLessonResumeStorageKey(lessonId, activeChildId),
    [activeChildId, lessonId],
  );

  useEffect(() => {
    if (!session || !axionDecisionId) return;
    if (ctaExecutedLoggedRef.current === axionDecisionId) return;
    ctaExecutedLoggedRef.current = axionDecisionId;
    void trackAxionCtaExecuted({
      decisionId: axionDecisionId,
      actionType: "OPEN_LEARNING_MODULE",
      context: "child_tab",
    }).catch(() => {
      ctaExecutedLoggedRef.current = null;
    });
  }, [axionDecisionId, session]);

  useEffect(() => {
    if (!session || !axionDecisionId) return;
    if (sessionStartedLoggedRef.current === axionDecisionId) return;
    sessionStartedLoggedRef.current = axionDecisionId;
    void trackAxionSessionStarted({
      decisionId: axionDecisionId,
      destination: "learning",
      context: "child_tab",
    }).catch(() => {
      sessionStartedLoggedRef.current = null;
    });
  }, [axionDecisionId, session]);

  const current = queue[index] ?? null;
  const currentDifficulty = difficultyLabel(current?.difficulty);
  const answeredCount = Object.keys(answeredByStep).length;
  const progressPercent = Math.min(100, (answeredCount / Math.max(1, sessionTargetQuestions)) * 100);
  const correctCount = Object.values(correctByStep).filter(Boolean).length;
  const masteryPercent = answeredCount > 0 ? Math.max(0, Math.min(100, Math.round((correctCount / answeredCount) * 100))) : 0;
  const energyBlocked = energyStatus ? !energyStatus.canPlay : false;
  const waitClock = energyStatus ? formatClock(energyStatus.secondsUntilPlayable) : "00:00";
  const axionTip = useMemo(() => resolveAxionTip(current), [current]);
  const weeklyGoalPercent = useMemo(() => {
    const target = Math.max(1, weeklyGoal.target);
    const completed = Math.max(0, Math.min(target, weeklyGoal.completed));
    return Math.round((completed / target) * 100);
  }, [weeklyGoal.completed, weeklyGoal.target]);
  const denseDesktop = layoutWidth >= 1024 && (layoutWidth <= 1450 || layoutHeight <= 840);
  const ultraDenseDesktop = denseDesktop && layoutHeight <= 840;
  const desktopScale = useMemo(() => {
    if (!denseDesktop) return 1;
    const widthScale = Math.min(1, layoutWidth / 1420);
    const heightScale = Math.min(1, Math.max(0.74, (layoutHeight - 8) / 900));
    return Math.max(0.74, Math.min(widthScale, heightScale));
  }, [denseDesktop, layoutHeight, layoutWidth]);

  const refreshWeeklyGoal = useCallback(async () => {
    try {
      const missions: MissionsCurrentResponse = await getCurrentMissions();
      setWeeklyGoal(resolveWeeklyGoalProgress(missions, 3));
    } catch {
      setWeeklyGoal(resolveWeeklyGoalProgress(null, 3));
    }
  }, []);

  const hydrateLessonContext = useCallback(async (subjectId: number | null) => {
    if (!subjectId || !Number.isFinite(subjectId) || subjectId <= 0) {
      setOfflineSubjectName(null);
      setLessonContextLabel(null);
      setUnitProgressPercent(0);
      return;
    }

    try {
      const learningPath = await getLearningPath(subjectId, readActiveChildId() ?? undefined);
      setOfflineSubjectName(learningPath.subjectName ?? null);
      let contextLabel: string | null = null;
      let nextUnitProgress = 0;

      for (const unit of learningPath.units) {
        const lessonNode = unit.nodes.find((node) => node.lesson?.id === lessonId);
        if (lessonNode?.lesson) {
          contextLabel = `Unidade ${unit.order} • Lição ${lessonNode.lesson.order}`;
          nextUnitProgress = Math.max(0, Math.min(100, Math.round((unit.completionRate ?? 0) * 100)));
          break;
        }
      }

      setLessonContextLabel(contextLabel);
      setUnitProgressPercent(nextUnitProgress);
    } catch {
      setOfflineSubjectName(null);
      setLessonContextLabel(null);
      setUnitProgressPercent(0);
    }
  }, [lessonId]);

  const buildOfflineSession = useCallback((subjectId: number | null): LearningSessionStartResponse => {
    const resolvedSubjectId = subjectId && Number.isFinite(subjectId) && subjectId > 0 ? subjectId : routeSubjectId ?? 0;
    return {
      sessionId: `offline-${lessonId}-${Date.now()}`,
      subjectId: resolvedSubjectId,
      unitId: null,
      lessonId,
      startedAt: new Date().toISOString(),
    };
  }, [lessonId, routeSubjectId]);

  const clearLessonResumeSnapshot = useCallback(() => {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(lessonResumeStorageKey);
  }, [lessonResumeStorageKey]);

  const readLessonResumeSnapshot = useCallback((): LessonResumeSnapshot | null => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(lessonResumeStorageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as LessonResumeSnapshot;
      if (!parsed || parsed.lessonId !== lessonId) return null;
      if ((parsed.childId ?? null) !== (activeChildId ?? null)) return null;
      if (!Array.isArray(parsed.queue) || parsed.queue.length === 0) return null;
      if (!parsed.session || typeof parsed.session.sessionId !== "string" || !parsed.session.sessionId.trim()) return null;
      if (!parsed.answeredByStep || Object.keys(parsed.answeredByStep).length === 0) return null;
      if (!Number.isFinite(parsed.savedAt) || Date.now() - parsed.savedAt > 1000 * 60 * 60 * 8) return null;
      return parsed;
    } catch {
      return null;
    }
  }, [activeChildId, lessonId, lessonResumeStorageKey]);

  const startLearningSessionWithBackoff = useCallback(async () => {
    const retryDelays = [0, 1200, 2500];
    let lastErr: unknown = null;

    for (let attempt = 0; attempt < retryDelays.length; attempt += 1) {
      const waitMs = retryDelays[attempt];
      if (waitMs > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, waitMs));
      }

      try {
        return await startLearningSession({ childId: readActiveChildId() ?? undefined, lessonId });
      } catch (err: unknown) {
        lastErr = err;
      }
    }

    throw lastErr ?? new Error("Learning session start failed");
  }, [lessonId]);

  const loadQuestionBatch = useCallback(async (subjectId: number) => {
    const firstBatch = await getAdaptiveLearningNext({
      childId: readActiveChildId() ?? undefined,
      subjectId,
      lessonId,
      count: 8,
    });
    if (!firstBatch.items.length) {
      const diagnostics = asRecord(firstBatch.plan?.diagnostics);
      throw new ApiError("Empty adaptive batch", 503, {
        code: "EMPTY_BATCH",
        message: "Nenhuma pergunta disponível para esta lição agora.",
        diagnostics,
      });
    }
    const diversified = diversifyQuestionBatch(firstBatch.items);
    const target = Math.max(MIN_SESSION_QUESTIONS, Math.min(MAX_SESSION_QUESTIONS, diversified.length));
    setQueue(diversified);
    setSessionTargetQuestions(target);
    setOfflineMode(false);
    setIndex(0);
    setQuestionStartedAt(Date.now());
    setAnsweredByStep({});
    setCorrectByStep({});
    setFeedback(null);
    setSelectedOption(null);
    setFillBlankAnswer("");
    setDragAssignments({});
    setOrderingIds([]);
    setQuestionSupplyExhausted(false);
    setQuestionError(null);
    setContentUnavailableReason(null);
  }, [lessonId]);

  const activateOfflineMode = useCallback(
    (message?: string) => {
      const items = diversifyQuestionBatch(buildOfflineQuestions(lessonId, offlineSubjectName));
      setQueue(items);
      setSessionTargetQuestions(items.length);
      setIndex(0);
      setQuestionStartedAt(Date.now());
      setAnsweredByStep({});
      setCorrectByStep({});
      setSelectedOption(null);
      setDragAssignments({});
      setOrderingIds([]);
      setQuestionSupplyExhausted(false);
      setQuestionError(null);
      setError(null);
      setOfflineMode(true);
      if (message) {
        setFeedback({
          tone: "encourage",
          message,
        });
      }
    },
    [lessonId, offlineSubjectName],
  );

  const loadQuestionBatchWithBackoff = useCallback(async (subjectId: number) => {
    const retryDelays = [0, 1500, 3000];
    let lastErr: unknown = null;

    for (let attempt = 0; attempt < retryDelays.length; attempt += 1) {
      const waitMs = retryDelays[attempt];
      if (waitMs > 0) {
        setQuestionRetrying(true);
        await new Promise((resolve) => window.setTimeout(resolve, waitMs));
      }

      try {
        await loadQuestionBatch(subjectId);
        setQuestionRetrying(false);
        return;
      } catch (err: unknown) {
        lastErr = err;
      }
    }

    setQuestionRetrying(false);
    throw lastErr ?? new Error("Adaptive question load failed");
  }, [loadQuestionBatch]);

  const applyEmptyBatchUnavailableState = useCallback(
    (error: unknown, context: "bootstrap" | "retry") => {
      const reason = resolveEmptyBatchReason(error);
      setOfflineMode(false);
      setQueue([]);
      setIndex(0);
      setQuestionError(reason.detail);
      setContentUnavailableReason({ title: reason.title, detail: reason.detail });
      trackAprenderEvent("lesson_content_unavailable", {
        lessonId,
        context,
        title: reason.title,
        detail: reason.detail,
        candidatesRaw:
          typeof reason.diagnostics?.candidates_raw === "number" ? Number(reason.diagnostics.candidates_raw) : undefined,
        candidatesFiltered:
          typeof reason.diagnostics?.candidates_filtered === "number"
            ? Number(reason.diagnostics.candidates_filtered)
            : undefined,
        fallbackReason: toStringSafe(reason.diagnostics?.fallback_reason),
        blockReason: toStringSafe(reason.diagnostics?.block_reason),
      });
      if (typeof window !== "undefined") {
        console.info("lesson_empty_candidates", {
          lessonId,
          context,
          candidates_raw: reason.diagnostics?.candidates_raw,
          candidates_filtered: reason.diagnostics?.candidates_filtered,
          fallback_reason: reason.diagnostics?.fallback_reason,
          block_reason: reason.diagnostics?.block_reason,
        });
      }
    },
    [lessonId],
  );

  const loadEnergy = async () => {
    try {
      const status = await getAprenderLearningEnergy();
      setEnergyStatus(status);
    } catch {
      setEnergyStatus(null);
    } finally {
      setEnergyLoading(false);
    }
  };

  useEffect(() => {
    if (!Number.isFinite(lessonId) || lessonId <= 0) {
      setError("Lição inválida.");
      setLoading(false);
      return;
    }
    const bootstrap = async () => {
      try {
        offlineAutoFallbackTriedRef.current = false;
        setLoading(true);
        setError(null);
        setQuestionError(null);
        const snapshot = readLessonResumeSnapshot();
        if (snapshot) {
          setSession(snapshot.session);
          setQueue(snapshot.queue);
          setSessionTargetQuestions(snapshot.sessionTargetQuestions);
          setOfflineMode(snapshot.offlineMode);
          setIndex(Math.max(0, Math.min(snapshot.index, Math.max(0, snapshot.queue.length - 1))));
          setQuestionStartedAt(Date.now());
          setAnsweredByStep(snapshot.answeredByStep);
          setCorrectByStep(snapshot.correctByStep);
          setFeedback({
            tone: "success",
            message: "Sua lição foi retomada de onde você parou.",
          });
          setSelectedOption(null);
          setFillBlankAnswer("");
          setDragAssignments({});
          setOrderingIds([]);
          setQuestionSupplyExhausted(snapshot.questionSupplyExhausted);
          setContentUnavailableReason(null);
          setLessonContextLabel(snapshot.lessonContextLabel);
          setOfflineSubjectName(snapshot.offlineSubjectName);
          setUnitProgressPercent(snapshot.unitProgressPercent);
          setLoading(false);
          return;
        }
        const sessionStart = await startLearningSessionWithBackoff();
        setSession(sessionStart);
        trackAprenderEvent("lesson_opened", {
          lessonId,
          sessionId: sessionStart.sessionId,
          subjectId: sessionStart.subjectId,
        });
        await hydrateLessonContext(sessionStart.subjectId);
        try {
          await loadQuestionBatchWithBackoff(sessionStart.subjectId);
        } catch (batchErr: unknown) {
          if (isEmptyBatchError(batchErr)) {
            if (shouldFallbackToOfflineForEmptyBatch(batchErr)) {
              const reason = resolveEmptyBatchReason(batchErr);
              activateOfflineMode(`${reason.detail} Entramos no modo offline para você continuar.`);
              return;
            }
            applyEmptyBatchUnavailableState(batchErr, "bootstrap");
            return;
          }
          const message = resolveQuestionLoadMessage(batchErr);
          // Never leave the child blocked without question flow when the adaptive batch fails.
          activateOfflineMode(`${message} Entramos no modo offline para você continuar.`);
        }
      } catch (err: unknown) {
        const errorPayload = err instanceof ApiError ? asRecord(err.payload) : {};
        const isTransientSessionFailure =
          err instanceof ApiError &&
          (err.status === 0 ||
            toStringSafe(errorPayload.code) === "NETWORK_ERROR" ||
            (typeof navigator !== "undefined" && navigator.onLine === false));

        if (isTransientSessionFailure) {
          const fallbackSubjectId = routeSubjectId ?? null;
          const offlineSession = buildOfflineSession(fallbackSubjectId);
          setSession(offlineSession);
          await hydrateLessonContext(fallbackSubjectId);
          trackAprenderEvent("lesson_opened", {
            lessonId,
            sessionId: offlineSession.sessionId,
            subjectId: fallbackSubjectId ?? undefined,
            mode: "offline_fallback",
            reason: toStringSafe(errorPayload.code, `status_${err.status}`),
          });
          activateOfflineMode("Conexão instável. Entramos no modo offline para você continuar.");
          return;
        }

        const message =
          err instanceof ApiError
            ? getApiErrorMessage(err, "Não foi possível iniciar a sessão adaptativa.")
            : "Não foi possível iniciar a sessão adaptativa.";
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    void bootstrap();
    void loadEnergy();
    void refreshWeeklyGoal();
    void getAprenderLearningStreak()
      .then((data) => setLearningStreak(data))
      .catch(() => setLearningStreak(null));
  }, [
    activateOfflineMode,
    applyEmptyBatchUnavailableState,
    buildOfflineSession,
    clearLessonResumeSnapshot,
    hydrateLessonContext,
    lessonId,
    loadQuestionBatchWithBackoff,
    readLessonResumeSnapshot,
    refreshWeeklyGoal,
    routeSubjectId,
    startLearningSessionWithBackoff,
  ]);

  useEffect(() => {
    if (loading || offlineMode || questionRetrying) return;
    if (current || !session) return;
    if (offlineAutoFallbackTriedRef.current) return;
    offlineAutoFallbackTriedRef.current = true;
    setQuestionError("Nenhuma pergunta disponível para esta lição agora.");
  }, [current, loading, offlineMode, questionRetrying, session]);

  useEffect(() => {
    void fetchUXSettings().then(setUxSettings);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getAprenderLearningProfile()
      .then((data) => {
        if (!cancelled) {
          setTopBarGems(Math.max(0, Math.round(data.axionCoins ?? 0)));
          setTopBarXp(Math.max(0, Math.min(100, Math.round(data.xpLevelPercent ?? 0))));
          setTopBarProfileLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setTopBarProfileLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadEnergy();
    }, 10000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setTipVisible(false);
  }, [index, current?.questionId, current?.templateId]);

  useEffect(() => {
    setFillBlankAnswer("");
  }, [index, current?.questionId, current?.templateId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!session || queue.length === 0 || result || pendingCompletionResult) return;
    if (answeredCount <= 0) {
      clearLessonResumeSnapshot();
      return;
    }
    const snapshot: LessonResumeSnapshot = {
      lessonId,
      childId: activeChildId,
      savedAt: Date.now(),
      session,
      queue,
      index,
      answeredByStep,
      correctByStep,
      sessionTargetQuestions,
      questionSupplyExhausted,
      offlineMode,
      lessonContextLabel,
      offlineSubjectName,
      unitProgressPercent,
    };
    window.localStorage.setItem(lessonResumeStorageKey, JSON.stringify(snapshot));
  }, [
    activeChildId,
    answeredByStep,
    answeredCount,
    clearLessonResumeSnapshot,
    correctByStep,
    index,
    lessonContextLabel,
    lessonId,
    lessonResumeStorageKey,
    offlineMode,
    offlineSubjectName,
    pendingCompletionResult,
    queue,
    questionSupplyExhausted,
    result,
    session,
    sessionTargetQuestions,
    unitProgressPercent,
  ]);

  useEffect(() => {
    if (!current || current.type !== "ORDERING") {
      setOrderingIds([]);
      return;
    }
    const ordering = normalizeOrderingItems(asRecord(current.metadata)).map((item) => item.id);
    setOrderingIds(ordering);
  }, [current]);

  useEffect(() => {
    if (!session || !current) return;
    trackAprenderEvent("question_viewed", {
      lessonId,
      sessionId: session.sessionId,
      questionType: current.type,
      difficulty: current.difficulty,
      stepIndex: index,
      offlineMode,
    });
  }, [current, index, lessonId, offlineMode, session]);

  useEffect(() => {
    if (!result) return;
    if (reducedMotion) {
      setDisplayXp(result.xpEarned);
      setDisplayCoins(result.coinsEarned);
      return;
    }
    setDisplayXp(0);
    setDisplayCoins(0);
    const duration = 700;
    const started = performance.now();
    let frame: number | null = null;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - (1 - progress) * (1 - progress);
      setDisplayXp(Math.round(result.xpEarned * eased));
      setDisplayCoins(Math.round(result.coinsEarned * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [reducedMotion, result]);

  const applyWrongEnergy = async () => {
    try {
      const consumed = await consumeAprenderWrongAnswerEnergy();
      setEnergyStatus(consumed.status);
    } catch {
      // no-op
    }
  };

  const submitAnswer = async (outcome: QuestionOutcome) => {
    if (!current || submitting || energyBlocked) return;
    setSubmitting(true);
    const elapsed = Math.max(0, Date.now() - questionStartedAt);
    try {
      if (offlineMode) {
        setAnsweredByStep((prev) => ({ ...prev, [index]: true }));
        setCorrectByStep((prev) => ({ ...prev, [index]: outcome.correct }));
        trackAprenderEvent("question_answered", {
          lessonId,
          sessionId: session?.sessionId ?? "offline",
          questionType: current.type,
          difficulty: current.difficulty,
          stepIndex: index,
          correct: outcome.correct,
          result: outcome.result,
          elapsedMs: elapsed,
          offlineMode: true,
        });
        if (!outcome.correct) {
          await applyWrongEnergy();
          const explanation = current.explanation || "Vamos revisar juntos e praticar com uma versão mais simples.";
          const seed = `${lessonId}|${index}|${current.questionId ?? current.templateId}|wrong|${microcopyTick}`;
          const base = buildEncourageMicrocopy(seed, { maxChars: 88 });
          const explained = joinParts([base, explanation]);
          setFeedback({
            tone: "encourage",
            message: buildBoundedMessage([explained, base], 108),
          });
          setMicrocopyTick((prev) => prev + 1);
          setTipVisible(true);
          playSfx("/sfx/node-pop.ogg", uxSettings.soundEnabled);
          hapticPress(uxSettings);
        } else {
          let localStreakCorrect = 1;
          for (let i = index - 1; i >= 0; i -= 1) {
            if (correctByStep[i]) localStreakCorrect += 1;
            else break;
          }
          const streakCelebrate = localStreakCorrect > 0 && localStreakCorrect % 3 === 0;
          const seed = `${lessonId}|${index}|${current.questionId ?? current.templateId}|correct|${microcopyTick}`;
          setFeedback({
            tone: "success",
            message: buildSuccessMicrocopy(seed, { streakMode: streakCelebrate, maxChars: 108 }),
          });
          setMicrocopyTick((prev) => prev + 1);
          setCorrectFxTick((prev) => prev + 1);
          playSfx("/sfx/completion-chime.ogg", uxSettings.soundEnabled);
          hapticCompletion(uxSettings);
        }
        return;
      }
      const answerResult = await submitAdaptiveLearningAnswer({
        childId: readActiveChildId() ?? undefined,
        questionId: current.questionId,
        templateId: current.templateId,
        generatedVariantId: current.generatedVariantId,
        variantId: current.variantId,
        wrongAnswer: outcome.wrongAnswer ?? undefined,
        result: outcome.result,
        timeMs: elapsed,
      });

      setAnsweredByStep((prev) => ({ ...prev, [index]: true }));
      setCorrectByStep((prev) => ({ ...prev, [index]: outcome.correct }));
      trackAprenderEvent("question_answered", {
        lessonId,
        sessionId: session?.sessionId ?? "online",
        questionType: current.type,
        difficulty: current.difficulty,
        stepIndex: index,
        correct: outcome.correct,
        result: outcome.result,
        elapsedMs: elapsed,
        offlineMode: false,
      });
      await loadEnergy();
      if (!outcome.correct) {
        const explanation = current.explanation || "Vamos revisar juntos e praticar com uma versão mais simples.";
        const seed = `${lessonId}|${index}|${current.questionId ?? current.templateId}|wrong|${microcopyTick}`;
        const base = buildEncourageMicrocopy(seed, { maxChars: 88 });
        const explained = joinParts([base, explanation]);
        setFeedback({
          tone: "encourage",
          message: buildBoundedMessage([explained, base], 108),
        });
        setMicrocopyTick((prev) => prev + 1);
        setTipVisible(true);
        playSfx("/sfx/node-pop.ogg", uxSettings.soundEnabled);
        hapticPress(uxSettings);
        if (session) {
          try {
            const remediation = await getAdaptiveLearningNext({
              childId: readActiveChildId() ?? undefined,
              subjectId: session.subjectId,
              lessonId,
              focusSkillId: answerResult.skillId,
              forceDifficulty: "EASY",
              count: 1,
            });
            if (remediation.items.length > 0) {
              setQueue((prev) => {
                const next = [...prev];
                next.splice(index + 1, 0, remediation.items[0]);
                return next;
              });
            }
          } catch (remediationErr) {
            console.warn("lesson_remediation_unavailable", {
              lessonId,
              stepIndex: index,
              skillId: answerResult.skillId,
              error: remediationErr instanceof Error ? remediationErr.message : String(remediationErr),
            });
          }
        }
      } else {
        const streakCelebrate =
          answerResult.streakCorrect > 0 && answerResult.streakCorrect % 3 === 0
            ? true
            : false;
        const seed = `${lessonId}|${index}|${current.questionId ?? current.templateId}|correct|${microcopyTick}`;
        setFeedback({
          tone: "success",
          message: buildSuccessMicrocopy(seed, { streakMode: streakCelebrate, maxChars: 108 }),
        });
        setMicrocopyTick((prev) => prev + 1);
        setCorrectFxTick((prev) => prev + 1);
        playSfx("/sfx/completion-chime.ogg", uxSettings.soundEnabled);
        hapticCompletion(uxSettings);
      }
    } catch (err: unknown) {
      const message =
        err instanceof ApiError
          ? getApiErrorMessage(err, "Não foi possível registrar a resposta.")
          : "Não foi possível registrar a resposta.";
      setFeedback({
        tone: "encourage",
        message: buildBoundedMessage(
          [
            joinParts([buildEncourageMicrocopy(`${lessonId}|${index}|error|${microcopyTick}`, { maxChars: 88 }), message]),
            buildEncourageMicrocopy(`${lessonId}|${index}|error|${microcopyTick}`, { maxChars: 88 }),
          ],
          108,
        ),
      });
      setMicrocopyTick((prev) => prev + 1);
    } finally {
      setSubmitting(false);
    }
  };

  const onPickOption = async (optionId: string) => {
    if (!current || answeredByStep[index]) return;
    hapticPress(uxSettings);
    setSelectedOption(optionId);
    const outcome = evaluateSelection(asRecord(current.metadata), optionId);
    await submitAnswer(outcome);
  };

  const onCheckDragDrop = async () => {
    if (!current || answeredByStep[index]) return;
    hapticPress(uxSettings);
    const outcome = evaluateDragDrop(asRecord(current.metadata), dragAssignments);
    await submitAnswer(outcome);
  };

  const onCheckOrdering = async () => {
    if (!current || answeredByStep[index]) return;
    hapticPress(uxSettings);
    const outcome = evaluateOrdering(asRecord(current.metadata), orderingIds, current.prompt);
    await submitAnswer(outcome);
  };

  const onCheckFillBlank = async () => {
    if (!current || answeredByStep[index]) return;
    hapticPress(uxSettings);
    const outcome = evaluateFillBlank(asRecord(current.metadata), fillBlankAnswer);
    await submitAnswer(outcome);
  };

  const finishSessionNow = async () => {
    if (!session || finishing || result) return;
    setFinishing(true);
    let finalized: LearningSessionFinishResponse | null = pendingCompletionResult;
    try {
      if (!finalized) {
        // Wave 3: single finish call — backend absorbs lesson progress update.
        // NO call to completeAprenderLesson (removed, endpoint deprecated).
        finalized = await finishLearningSession({
          childId: readActiveChildId() ?? undefined,
          sessionId: session.sessionId,
          totalQuestions: answeredCount,
          correctCount,
          decisionId: axionDecisionId ?? undefined,
        });
        if (typeof window !== "undefined") {
          window.sessionStorage.removeItem("axion_active_decision_id");
        }
      }
      setPendingCompletionResult(null);
      setResult(finalized);
      if (finalized.gamification) {
        setTopBarGems(Math.max(0, Math.round(finalized.gamification.axionCoins ?? 0)));
        setTopBarXp(Math.max(0, Math.min(100, resolveXpLevelPercentFromProfileXp(finalized.gamification.xp ?? 0))));
      }
      trackAprenderEvent("session_completed", {
        lessonId,
        sessionId: finalized.sessionId,
        stars: finalized.stars,
        accuracy: finalized.accuracy,
        totalQuestions: finalized.totalQuestions,
        correctCount: finalized.correctCount,
        xpEarned: finalized.xpEarned,
      });
      if (!reducedMotion && (finalized.stars === 3 || finalized.leveledUp)) {
        setConfettiTrigger((prev) => prev + 1);
      }
      playSfx("/sfx/completion-chime.ogg", uxSettings.soundEnabled);
      if (finalized.leveledUp) hapticLevelUp(uxSettings);
      else hapticCompletion(uxSettings);
      void getAprenderLearningStreak()
        .then((data) => setLearningStreak(data))
        .catch(() => null);
      void refreshWeeklyGoal();
      void getLearningPath(session.subjectId, readActiveChildId() ?? undefined)
        .then((learningPath) => {
          for (const unit of learningPath.units) {
            const lessonNode = unit.nodes.find((node) => node.lesson?.id === lessonId);
            if (lessonNode?.lesson) {
              setUnitProgressPercent(Math.max(0, Math.min(100, Math.round((unit.completionRate ?? 0) * 100))));
              break;
            }
          }
        })
        .catch(() => null);
    } catch (err: unknown) {
      const message =
        err instanceof ApiError
          ? getApiErrorMessage(err, "Não foi possível finalizar a sessão.")
          : "Não foi possível finalizar a sessão.";
      setFeedback({
        tone: "encourage",
        message: buildBoundedMessage(
          [
            joinParts([message, "A lição ainda não foi concluída no servidor."]),
            "Não foi possível salvar a conclusão agora. Tente finalizar novamente.",
          ],
          108,
        ),
      });
      trackAprenderEvent("session_completed", {
        lessonId,
        sessionId: session.sessionId,
        stars: 0,
        accuracy: answeredCount > 0 ? correctCount / answeredCount : 0,
        totalQuestions: answeredCount,
        correctCount,
        xpEarned: 0,
        finishPersistFailed: true,
      });
    } finally {
      setFinishing(false);
    }
  };

  const buildBackToPathUrl = (payload?: LearningSessionFinishResponse): string => {
    const subjectId = session?.subjectId ?? routeSubjectId;
    const params = new URLSearchParams();
    if (subjectId && Number.isFinite(subjectId)) {
      params.set("subjectId", String(subjectId));
    }
    if (payload) {
      params.set("completedLessonId", String(lessonId));
      params.set("completedAt", payload.endedAt ?? new Date().toISOString());
      params.set("stars", String(payload.stars));
      params.set("xp", String(payload.xpEarned));
      params.set("coins", String(payload.coinsEarned));
      params.set("levelUp", payload.leveledUp ? "1" : "0");
      const profileXp = Number(payload.gamification?.xp);
      if (Number.isFinite(profileXp) && profileXp >= 0) {
        params.set("profileXp", String(Math.floor(profileXp)));
        params.set("profileXpPercent", String(resolveXpLevelPercentFromProfileXp(profileXp)));
      }
      const profileCoins = Number(payload.gamification?.axionCoins);
      if (Number.isFinite(profileCoins) && profileCoins >= 0) {
        params.set("profileCoins", String(Math.floor(profileCoins)));
      }
    }
    const query = params.toString();
    return query ? `/child/aprender?${query}` : "/child/aprender";
  };

  const navigateBackToPath = (targetUrl: string) => {
    router.replace(targetUrl);
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        const stillOnLessonRoute = window.location.pathname.includes("/child/aprender/lesson/");
        if (stillOnLessonRoute) {
          window.location.assign(targetUrl);
        }
      }, 250);
    }
  };

  const pushPathWithResult = (payload: LearningSessionFinishResponse) => {
    clearLessonResumeSnapshot();
    const childId = readActiveChildId();
    if (childId !== null) {
      writeRecentLearningReward(childId, payload.xpEarned, payload.coinsEarned);
    }
    navigateBackToPath(buildBackToPathUrl(payload));
  };

  const onBackToPath = async () => {
    if (backSaving || finishing) return;
    if (result) {
      pushPathWithResult(result);
      return;
    }
    if (pendingCompletionResult) {
      // Wave 3: no separate lesson complete call — backend handled it on session finish.
      pushPathWithResult(pendingCompletionResult);
      return;
    }
    if (!session || answeredCount === 0) {
      clearLessonResumeSnapshot();
      navigateBackToPath(buildBackToPathUrl());
      return;
    }
    navigateBackToPath(buildBackToPathUrl());
    return;
  };

  const goNext = async () => {
    if (loadingNextQuestion) return;
    setFeedback(null);
    setSelectedOption(null);
    setDragAssignments({});
    setOrderingIds([]);
    const ensureOfflineContinuation = (): boolean => {
      if (answeredCount >= MIN_SESSION_QUESTIONS) return false;
      const known = new Set(queue.map((item) => questionFingerprint(item)));
      const candidates = diversifyIncomingBatch(
        queue,
        buildOfflineQuestions(lessonId, offlineSubjectName).filter((item) => !known.has(questionFingerprint(item))),
      );
      if (candidates.length <= 0) return false;
      const needed = Math.max(1, MIN_SESSION_QUESTIONS - answeredCount);
      const nextItems = candidates.slice(0, needed);
      if (nextItems.length <= 0) return false;
      setQueue((prev) => [...prev, ...nextItems]);
      setIndex((prev) => prev + 1);
      setQuestionStartedAt(Date.now());
      setQuestionSupplyExhausted(false);
      setOfflineMode(true);
      setFeedback({
        tone: "encourage",
        message: "Conexão instável. Seguimos com perguntas de continuidade para concluir a lição.",
      });
      return true;
    };
    const canFinishByTarget = answeredCount >= sessionTargetQuestions;
    const canForceFinishBySupply = questionSupplyExhausted && answeredCount >= MIN_SESSION_QUESTIONS;
    if (canFinishByTarget || canForceFinishBySupply) {
      await finishSessionNow();
      return;
    }

    if (index < queue.length - 1) {
      setIndex((prev) => prev + 1);
      setQuestionStartedAt(Date.now());
      setQuestionSupplyExhausted(false);
      return;
    }

    // When we reach the last loaded question, try to fetch more before finishing.
    if (session) {
      try {
        setLoadingNextQuestion(true);
        const nextBatch = await getAdaptiveLearningNext({
          childId: readActiveChildId() ?? undefined,
          subjectId: session.subjectId,
          lessonId,
          count: 4,
        });
        if (nextBatch.items.length > 0) {
          const known = new Set(queue.map((item) => questionFingerprint(item)));
          const fresh = nextBatch.items.filter((item) => !known.has(questionFingerprint(item)));
          if (fresh.length > 0) {
            const diversifiedFresh = diversifyIncomingBatch(queue, fresh);
            setQueue((prev) => [...prev, ...diversifiedFresh]);
            setIndex((prev) => prev + 1);
            setQuestionStartedAt(Date.now());
            setQuestionSupplyExhausted(false);
            return;
          }
        }
        if (ensureOfflineContinuation()) {
          return;
        }
        setQuestionSupplyExhausted(true);
        setFeedback({
          tone: "encourage",
          message: "Não foi possível carregar a próxima pergunta agora. Tente novamente.",
        });
        return;
      } catch {
        if (ensureOfflineContinuation()) {
          return;
        }
        setQuestionSupplyExhausted(true);
        setFeedback({
          tone: "encourage",
          message: "Conexão instável. Toque em Próximo para tentar novamente.",
        });
        return;
      } finally {
        setLoadingNextQuestion(false);
      }
    }
    setFeedback({
      tone: "encourage",
      message: "Ainda não foi possível continuar. Tente novamente em instantes.",
    });
  };

  const onRefillWait = async () => {
    setEnergyActionLoading("wait");
    try {
      const status = await refillAprenderEnergyWithWait();
      setEnergyStatus(status);
      setFeedback({ tone: "success", message: "Energia liberada. Vamos continuar." });
    } catch (err: unknown) {
      const message =
        err instanceof ApiError ? getApiErrorMessage(err, "Mais um pouquinho e a energia volta.") : "Mais um pouquinho e a energia volta.";
      setFeedback({ tone: "encourage", message });
    } finally {
      setEnergyActionLoading(null);
    }
  };

  const onRefillCoins = async () => {
    setEnergyActionLoading("coins");
    try {
      const status = await refillAprenderEnergyWithCoins();
      setEnergyStatus(status);
      setFeedback({ tone: "success", message: "Energia recarregada com AxionCoins." });
    } catch (err: unknown) {
      const message =
        err instanceof ApiError ? getApiErrorMessage(err, "Quando quiser, você pode juntar mais moedas para recarregar.") : "Quando quiser, você pode juntar mais moedas para recarregar.";
      setFeedback({ tone: "encourage", message });
    } finally {
      setEnergyActionLoading(null);
    }
  };

  const metadata = useMemo(() => asRecord(current?.metadata), [current]);
  const options = useMemo(() => normalizeOptions(metadata), [metadata]);
  const pairs = useMemo(() => normalizePairs(metadata), [metadata]);
  const orderingItems = useMemo(() => normalizeOrderingItems(metadata), [metadata]);
  const currentAnswered = Boolean(answeredByStep[index]);
  const canFinishNow = currentAnswered && answeredCount >= sessionTargetQuestions;
  const canForceFinishNow = currentAnswered && answeredCount > 0 && index >= queue.length - 1 && questionSupplyExhausted;
  const canSubmitDragDrop = pairs.length > 0 && Object.keys(dragAssignments).length >= pairs.length;
  const canSubmitOrdering = orderingItems.length > 1 && orderingIds.length === orderingItems.length;
  const canSubmitFillBlank = fillBlankAnswer.trim().length > 0;
  const stepTotal = Math.max(1, sessionTargetQuestions);
  const stepCurrent = Math.min(stepTotal, index + 1);
  const canGoPrevious = index > 0 && !submitting && !finishing && !result;
  const canGoNext = !currentAnswered || submitting || finishing || energyBlocked || Boolean(result) || loadingNextQuestion;
  const shouldHighlightFinish = canFinishNow || canForceFinishNow;
  const correctOptionId = toStringSafe(metadata.correctOptionId);
  const fillBlankPlaceholder = toStringSafe(metadata.placeholder, "Digite sua resposta");
  const lessonRightRail = (
    <LessonDesktopRail
      sessionProgress={progressPercent}
      masteryPercent={masteryPercent}
      answered={answeredCount}
      target={stepTotal}
      energyLabel={energyLoading ? "..." : energyStatus ? `${energyStatus.energy}/${energyStatus.maxEnergy}` : "--/--"}
      waitClock={energyBlocked ? waitClock : null}
      compact={denseDesktop}
    />
  );

  const topBarStreak = learningStreak?.currentStreak ?? 0;
  const topBarEnergy = energyStatus?.energy ?? -1;
  const topBarEnergyMax = energyStatus?.maxEnergy ?? 10;
  const topBarLoading = topBarProfileLoading || energyLoading;

  return (
    <div
      ref={layoutRef}
      className="relative min-h-screen"
      style={{ isolation: "isolate" }}
    >
      {/* Wallpaper — mesmo que /child/aprender, dentro do mesmo stacking context do sidebar */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage: "url('/axiora/aprender/trail-bg-clean-4k.png')",
          backgroundPosition: "center top",
          backgroundSize: "cover",
          backgroundRepeat: "no-repeat",
          opacity: 0.62,
          filter: "saturate(0.65) brightness(0.90)",
          zIndex: 0,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          zIndex: 1,
          background: "rgba(4,10,24,0.34)",
        }}
      />
    <ChildDesktopShell
      activeNav="aprender"
      menuSkin="trail"
      rightRail={lessonRightRail}
      density={denseDesktop ? "dense" : "regular"}
      contentScale={desktopScale}
      topBar={
        <TopStatsBar
          variant="global"
          streak={topBarStreak}
          gems={topBarGems}
          xp={topBarXp}
          energyCurrent={topBarEnergy}
          energyMax={topBarEnergyMax}
          isLoading={topBarLoading}
          density={denseDesktop ? "dense" : "regular"}
        />
      }
    >
      <PageShell tone="child" width="content" className={denseDesktop ? cn("lg:h-full lg:px-2", ultraDenseDesktop ? "lg:py-2" : "lg:py-2.5") : undefined}>
      <div className={cn("lesson-cosmic", denseDesktop ? "lg:flex lg:h-full lg:flex-col" : "")}>
      <div className="lg:hidden mb-2">
        <TopStatsBar
          streak={topBarStreak}
          gems={topBarGems}
          xp={topBarXp}
          energyCurrent={topBarEnergy}
          energyMax={topBarEnergyMax}
          isLoading={topBarLoading}
        />
      </div>
      <div
        className={cn(
          "mb-2",
          denseDesktop ? "xl:mb-1.5" : "xl:mb-2",
        )}
      >
        <div className="flex items-center">
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-[14px] border border-[#A07850]/45 bg-[linear-gradient(145deg,rgba(253,245,230,0.92),rgba(240,222,188,0.82))] font-semibold text-[#2C1E16] shadow-[0_4px_10px_rgba(44,30,18,0.10),inset_0_1px_0_rgba(255,255,255,0.65)] transition hover:border-[#A07850]/70 hover:bg-[linear-gradient(145deg,rgba(255,248,235,0.97),rgba(245,228,195,0.92))]",
            denseDesktop ? "h-8.5 min-w-[164px] px-3 text-[12px]" : "h-10 min-w-[196px] px-3.5 text-[13px]",
            "w-full sm:w-auto",
          )}
          onClick={() => void onBackToPath()}
          disabled={backSaving}
        >
          <span
            className={cn(
              "inline-flex items-center justify-center rounded-[10px] bg-[rgba(160,120,80,0.15)] shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]",
              denseDesktop ? "h-5 w-5" : "h-5.5 w-5.5",
            )}
          >
            <ArrowLeft className={cn("stroke-[2.6]", denseDesktop ? "h-3.5 w-3.5" : "h-4 w-4")} />
          </span>
          {backSaving ? "Salvando..." : "Voltar ao caminho"}
        </button>
      </div>
      </div>

      {offlineMode ? (
        <div className="sticky top-2 z-40 mb-3 rounded-2xl border border-amber-300/40 bg-amber-500/12 px-3 py-2 text-xs font-semibold text-amber-100 shadow-[0_8px_18px_rgba(20,10,0,0.18)] backdrop-blur">
          Modo offline ativo: conexão instável. Suas respostas continuam normalmente.
        </div>
      ) : null}

      <ConfettiBurst trigger={confettiTrigger} />

      <Card className={cn("lesson-card overflow-hidden border", denseDesktop ? (ultraDenseDesktop ? "mb-1.5 xl:mb-1.5" : "mb-2 xl:mb-2") : "mb-2.5 xl:mb-3")}>
        <CardHeader className={cn(denseDesktop ? (ultraDenseDesktop ? "pb-0 pt-2" : "pb-0.5 pt-2.5") : "pb-1.5 pt-3.5 xl:pt-4")}>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-[15px] text-[#FFF4E7] xl:text-base">Sessão adaptativa</CardTitle>
              <p className="mt-0.5 text-[11px] font-semibold text-[#E6D8C7]">{lessonContextLabel ?? "Lição em andamento"}</p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/45 bg-[linear-gradient(180deg,rgba(255,248,225,0.92),rgba(253,230,138,0.72))] px-2 py-0.5 text-xs font-black text-[#8A5A22] shadow-[0_2px_6px_rgba(217,119,6,0.1),inset_0_1px_0_rgba(255,255,255,0.52)]">
              <Flame className="h-3.5 w-3.5 text-[#F59E0B]" />
              {learningStreak?.currentStreak ?? 0}
            </span>
          </div>
        </CardHeader>
        <CardContent className={cn("space-y-1.5 text-sm", denseDesktop ? (ultraDenseDesktop ? "pb-2" : "pb-2.5") : "pb-3.5 xl:pb-4")}>
          <div className={cn("flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.05] px-3", ultraDenseDesktop ? "py-1" : "py-1.5")}>
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#8A5A22]">
              <Zap className="h-4 w-4 text-accent" />
              Energia
            </span>
            <div className="text-right text-xs font-semibold">
              <p className="text-[#FFF4E7]">{energyLoading ? "..." : energyStatus ? `${energyStatus.energy}/${energyStatus.maxEnergy}` : "--/--"}</p>
              {!energyLoading && energyBlocked ? <p className="text-[#CDBAA6]">Libera em {waitClock}</p> : null}
            </div>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-[#7A502A]">Progresso da sessão</span>
            <span className="font-black text-[#5C3719]">{Math.round(progressPercent)}%</span>
          </div>
          <ProgressBar value={progressPercent} tone="secondary" />
          <div className="flex items-center justify-between text-[11px] text-[#8A5A22]">
            <span className="font-bold">Domínio {masteryPercent}%</span>
            <span className="font-bold">{answeredCount}/{stepTotal}</span>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Card className="lesson-card border">
          <CardContent className="p-6 text-sm text-[#E6D8C7]">Preparando sessão adaptativa...</CardContent>
        </Card>
      ) : null}

      {error ? (
        <Card className="lesson-card border">
          <CardContent className="p-6 text-sm text-[#E6D8C7]">{error}</CardContent>
        </Card>
      ) : null}

      {!loading && !error && current ? (
        <Card className={cn("lesson-card border", denseDesktop ? "mb-0 lg:flex lg:flex-1 lg:min-h-0 lg:flex-col" : "mb-4")}>
          <CardContent className={cn(denseDesktop ? (ultraDenseDesktop ? "flex h-full flex-col space-y-1.5 p-2 md:p-2 xl:space-y-1.5 xl:p-2" : "flex h-full flex-col space-y-2 p-3 md:p-3 xl:space-y-2.5 xl:p-3") : "space-y-3.5 p-4 md:p-5 xl:space-y-4 xl:p-5")}>
            {energyBlocked ? (
              <div className="rounded-2xl border border-accent/40 bg-accent/10 p-3">
                <p className="text-sm font-semibold text-accent-foreground">Energia em recarga</p>
                <p className="mt-1 text-xs text-muted-foreground">Em {waitClock} você pode continuar. Se preferir, recarregue com moedas.</p>
                <div className="mt-3 flex gap-2">
                  <Button variant="secondary" className="w-full" disabled={energyActionLoading !== null} onClick={() => void onRefillWait()}>
                    {energyActionLoading === "wait" ? "Verificando..." : "Liberar por tempo"}
                  </Button>
                  <Button className="w-full" disabled={energyActionLoading !== null} onClick={() => void onRefillCoins()}>
                    <Coins className="mr-1 h-4 w-4" />
                    {energyStatus ? `${energyStatus.refillCoinCost} moedas` : "Usar moedas"}
                  </Button>
                </div>
              </div>
            ) : null}

            <div
              key={`${current.questionId ?? current.templateId ?? "q"}-${index}-${correctFxTick}`}
              className={cn("question-enter", denseDesktop ? (ultraDenseDesktop ? "flex-1 space-y-2" : "flex-1 space-y-2.5") : "space-y-3", feedback?.tone === "success" ? "correct-glow" : "")}
            >
              <div className={cn("flex items-center justify-between", denseDesktop ? "gap-2" : "")}>
                <span className={cn("inline-flex items-center rounded-full border border-[#A07850]/35 bg-[linear-gradient(180deg,rgba(255,251,244,0.95),rgba(245,231,205,0.88))] font-black uppercase tracking-[0.04em] text-[#6C4423] shadow-[0_3px_8px_rgba(44,30,18,0.08),inset_0_1px_0_rgba(255,255,255,0.6)]", ultraDenseDesktop ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]")}>
                  Questão {stepCurrent}/{stepTotal}
                </span>
                <div className={cn("flex items-center gap-1.5", denseDesktop ? "shrink-0" : "")}>
                  {SHOW_QUESTION_TYPE_DEBUG ? (
                    <span className="inline-flex items-center rounded-full border border-[#A07850]/25 bg-[rgba(255,250,244,0.75)] px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.05em] text-[#7A624B] shadow-[inset_0_1px_0_rgba(255,255,255,0.42)]">
                      DEV {questionTypeLabel(current.type)}
                    </span>
                  ) : null}
                  <span className={cn("inline-flex items-center rounded-full border font-black tracking-[0.01em]", currentDifficulty.className, ultraDenseDesktop ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]")}>
                    {currentDifficulty.text}
                  </span>
                </div>
              </div>
              {tipVisible ? (
                <div className="rounded-2xl border border-secondary/35 bg-secondary/10 px-3 py-2">
                  <p className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-secondary">
                    <Lightbulb className="h-3.5 w-3.5" />
                    Dica do Axion
                  </p>
                  <p className="mt-1 text-sm font-semibold text-secondary/90">{axionTip}</p>
                </div>
              ) : (
                <div className={cn("flex items-center justify-between gap-2 rounded-2xl border border-[#A07850]/22 bg-[linear-gradient(180deg,rgba(255,249,240,0.58),rgba(248,238,221,0.4))] px-3 shadow-[0_4px_10px_rgba(44,30,18,0.04),inset_0_1px_0_rgba(255,255,255,0.2)]", ultraDenseDesktop ? "py-1" : denseDesktop ? "py-1.5" : "py-2")}>
                  <p className={cn("font-bold text-[#8A5A22]", ultraDenseDesktop ? "text-[11px]" : "text-xs")}>Precisa de ajuda? O Axion pode dar uma dica.</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className={cn("shrink-0 whitespace-nowrap rounded-xl border-b-2 leading-none shadow-[0_3px_0_rgba(10,114,113,0.28),0_6px_10px_rgba(10,76,74,0.14)] active:translate-y-[1px]", ultraDenseDesktop ? "h-7 px-2.5 text-[11px]" : "h-8 px-3 text-xs")}
                    onClick={() => {
                      setTipVisible(true);
                      trackAprenderEvent("question_hint_opened", {
                        lessonId,
                        sessionId: session?.sessionId ?? "unknown",
                        stepIndex: index,
                        questionType: current.type,
                      });
                    }}
                  >
                    Mostrar dica
                  </Button>
                </div>
              )}
              <h2 className={cn("font-extrabold leading-tight text-foreground", denseDesktop ? (ultraDenseDesktop ? "text-[16px] md:text-[17px] xl:text-[19px]" : "text-[18px] md:text-[20px] xl:text-[22px]") : "text-[21px] md:text-[25px] xl:text-[28px]")}>{current.prompt}</h2>
              {current.type === "DRAG_DROP" || current.type === "MATCH" ? (
                <div className={cn(ultraDenseDesktop ? "space-y-1" : "space-y-3")}>
                  <div className={cn("rounded-2xl border border-[#A07850]/40 bg-[linear-gradient(145deg,rgba(253,245,230,0.85),rgba(240,222,188,0.75))] shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]", ultraDenseDesktop ? "p-1.5" : "p-3")}>
                    <p className={cn("font-semibold uppercase tracking-wide text-muted-foreground", ultraDenseDesktop ? "mb-1 text-[11px]" : denseDesktop ? "mb-1.5 text-xs" : "mb-2 text-xs")}>
                      {current.type === "MATCH" ? "Cartões" : "Itens"}
                    </p>
                    <div className={cn("flex flex-wrap", ultraDenseDesktop ? "gap-1" : denseDesktop ? "gap-1.5" : "gap-2")}>
                      {pairs
                        .filter((pair) => !dragAssignments[pair.itemId])
                        .map((pair) => (
                          <button
                            key={pair.itemId}
                            type="button"
                            draggable={!currentAnswered}
                            onDragStart={() => setDraggingItemId(pair.itemId)}
                            className={cn("rounded-full border border-[#FFBE85]/25 bg-[#FF7A2F]/10 text-xs font-semibold text-[#FFF4E7] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]", ultraDenseDesktop ? "px-2 py-0.5 text-[11px]" : denseDesktop ? "px-2.5 py-1" : "px-3 py-1.5")}
                          >
                            {pair.itemLabel}
                          </button>
                        ))}
                    </div>
                  </div>
                  <div className={cn("grid", ultraDenseDesktop ? "grid-cols-1 gap-1" : denseDesktop && current.type === "MATCH" && pairs.length >= 4 ? "grid-cols-2 gap-1.5" : denseDesktop ? "grid-cols-1 gap-1.5" : "grid-cols-1 gap-2")}>
                    {pairs.map((pair) => {
                      const assignedId = Object.keys(dragAssignments).find((itemId) => dragAssignments[itemId] === pair.targetId);
                      const assignedLabel = pairs.find((item) => item.itemId === assignedId)?.itemLabel;
                      return (
                        <div
                          key={pair.targetId}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={() => {
                            if (!draggingItemId || currentAnswered) return;
                            setDragAssignments((prev) => ({ ...prev, [draggingItemId]: pair.targetId }));
                            setDraggingItemId(null);
                          }}
                          className={cn("rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))]", ultraDenseDesktop ? "p-1.5" : denseDesktop ? "p-2.5" : "p-3")}
                        >
                          <p className={cn("font-semibold text-muted-foreground", ultraDenseDesktop ? "text-[10px]" : "text-xs")}>
                            {current.type === "MATCH" ? `Combine com: ${pair.targetLabel}` : pair.targetLabel}
                          </p>
                          <p className={cn("mt-1 font-bold text-foreground", ultraDenseDesktop ? "text-[12px] leading-3.5" : denseDesktop ? "text-[13px] leading-4" : "text-sm")}>{assignedLabel || "Solte aqui"}</p>
                        </div>
                      );
                    })}
                  </div>
                  <Button
                    className={cn("w-full", ultraDenseDesktop ? "min-h-7 rounded-[13px] text-[11px]" : denseDesktop ? "min-h-9 rounded-[16px] text-[13px]" : "")}
                    disabled={currentAnswered || !canSubmitDragDrop || energyBlocked || submitting}
                    onClick={() => void onCheckDragDrop()}
                  >
                    {current.type === "MATCH" ? "Validar combinação" : "Verificar resposta"}
                  </Button>
                </div>
              ) : current.type === "ORDERING" ? (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-[#A07850]/40 bg-[linear-gradient(145deg,rgba(253,245,230,0.85),rgba(240,222,188,0.75))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ordem atual</p>
                    <div className="space-y-2">
                      {orderingIds.map((itemId, itemIndex) => {
                        const item = orderingItems.find((entry) => entry.id === itemId);
                        if (!item) return null;
                        return (
                          <div key={item.id} className="flex items-center gap-2 rounded-xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] px-2 py-2">
                            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#A07850]/45 bg-[rgba(160,120,80,0.14)] text-xs font-bold text-[#5C4A3A]">
                              {itemIndex + 1}
                            </span>
                            <p className="flex-1 text-sm font-semibold text-foreground">{item.label}</p>
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                variant="secondary"
                                className="h-8 rounded-lg px-2 text-xs"
                                disabled={currentAnswered || itemIndex === 0}
                                onClick={() =>
                                  setOrderingIds((prev) => {
                                    const next = [...prev];
                                    [next[itemIndex - 1], next[itemIndex]] = [next[itemIndex], next[itemIndex - 1]];
                                    return next;
                                  })
                                }
                              >
                                ↑
                              </Button>
                              <Button
                                type="button"
                                variant="secondary"
                                className="h-8 rounded-lg px-2 text-xs"
                                disabled={currentAnswered || itemIndex === orderingIds.length - 1}
                                onClick={() =>
                                  setOrderingIds((prev) => {
                                    const next = [...prev];
                                    [next[itemIndex], next[itemIndex + 1]] = [next[itemIndex + 1], next[itemIndex]];
                                    return next;
                                  })
                                }
                              >
                                ↓
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <Button
                    className={cn("w-full", denseDesktop ? "min-h-9 rounded-[16px] text-[13px]" : "")}
                    disabled={currentAnswered || !canSubmitOrdering || energyBlocked || submitting}
                    onClick={() => void onCheckOrdering()}
                  >
                    Verificar ordem
                  </Button>
                </div>
              ) : current.type === "FILL_BLANK" ? (
                <div className={cn(denseDesktop ? "space-y-2" : "space-y-3")}>
                  <div className={cn("rounded-2xl border border-[#A07850]/40 bg-[linear-gradient(145deg,rgba(253,245,230,0.85),rgba(240,222,188,0.75))] shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]", denseDesktop ? "p-2.5" : "p-3")}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sua resposta</p>
                    <Input
                      value={fillBlankAnswer}
                      onChange={(event) => setFillBlankAnswer(event.target.value)}
                      placeholder={fillBlankPlaceholder}
                      disabled={currentAnswered || energyBlocked || submitting}
                      className="h-12 rounded-2xl border-[#A07850]/45 bg-[rgba(255,255,255,0.72)] text-base font-bold text-[#2C1E16] placeholder:text-[#7B6A58]"
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void onCheckFillBlank();
                        }
                      }}
                    />
                  </div>
                  <Button
                    className={cn("w-full", denseDesktop ? "min-h-9 rounded-[16px] text-[13px]" : "")}
                    disabled={currentAnswered || !canSubmitFillBlank || energyBlocked || submitting}
                    onClick={() => void onCheckFillBlank()}
                  >
                    Verificar resposta
                  </Button>
                </div>
              ) : (
                <div className={cn("grid grid-cols-1", denseDesktop ? "gap-1.5" : "gap-2")}>
                  {options.length > 0 ? (
                    options.map((option, optionIndex) => (
                      <button
                        key={option.id}
                        type="button"
                        aria-pressed={selectedOption === option.id}
                        className={cn(
                          "group flex items-center justify-between rounded-2xl border px-3 text-left text-sm font-semibold transition-transform transition-shadow transition-opacity duration-150 ease-out",
                          denseDesktop ? "min-h-[44px] py-2 xl:min-h-[46px] xl:py-2" : "min-h-[52px] py-2.5 xl:min-h-[56px] xl:py-3",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-[#18312E]",
                          "active:scale-[0.985]",
                          selectedOption === option.id
                            ? "border-[#FFB703]/65 bg-[linear-gradient(145deg,rgba(255,243,204,0.96),rgba(255,224,140,0.88))] text-[#2C1E16] shadow-[0_0_0_2px_rgba(255,183,3,0.22),0_4px_12px_rgba(44,30,18,0.14),inset_0_1px_0_rgba(255,255,255,0.7)]"
                            : "border-[#A07850]/45 bg-[linear-gradient(145deg,rgba(253,245,230,0.92),rgba(240,222,188,0.82))] text-[#2C1E16] shadow-[0_4px_12px_rgba(44,30,18,0.12),inset_0_1px_0_rgba(255,255,255,0.65)] hover:border-[#A07850]/70 hover:bg-[linear-gradient(145deg,rgba(255,248,235,0.96),rgba(245,228,195,0.92))]",
                          currentAnswered && correctByStep[index] && selectedOption === option.id ? "answer-correct-pop" : "",
                          currentAnswered && !correctByStep[index] && selectedOption === option.id ? "border-accent/55 bg-accent/10 text-accent-foreground" : "",
                        )}
                        disabled={currentAnswered || energyBlocked || submitting}
                        onClick={() => void onPickOption(option.id)}
                      >
                        <span className="flex items-center gap-2.5">
                          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#A07850]/45 bg-[rgba(160,120,80,0.14)] text-[11px] font-black text-[#5C4A3A] shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]">
                            {OPTION_LETTERS[optionIndex] ?? String(optionIndex + 1)}
                          </span>
                          <span className={cn("font-bold text-inherit", denseDesktop ? "text-[14px] leading-4.5" : "text-[15px] leading-5")}>{option.label}</span>
                        </span>
                        {currentAnswered ? (
                          option.id === correctOptionId ? (
                            <CheckCircle2 className="h-4.5 w-4.5 text-secondary" aria-hidden />
                          ) : selectedOption === option.id ? (
                            <XCircle className="h-4.5 w-4.5 text-accent" aria-hidden />
                          ) : null
                        ) : null}
                      </button>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-accent-foreground">
                      Esta atividade ainda está sendo preparada. Tente novamente em instantes.
                    </div>
                  )}
                </div>
              )}
            </div>

            {feedback ? (
              <div
                className={cn(
                  "rounded-2xl border break-words lesson-feedback shadow-[0_8px_18px_rgba(44,30,18,0.12),inset_0_1px_0_rgba(255,255,255,0.38)]",
                  ultraDenseDesktop ? "px-2.5 py-1.5 text-[12px] font-extrabold leading-[1.35]" : "px-3 py-2 text-sm font-bold leading-snug",
                  feedback.tone === "success"
                    ? "border-emerald-400/55 bg-[linear-gradient(180deg,rgba(236,253,245,0.98),rgba(187,247,208,0.92))] text-[#166534]"
                    : "border-orange-400/55 bg-[linear-gradient(180deg,rgba(255,247,237,0.98),rgba(254,215,170,0.92))] text-[#9A3412]",
                )}
              >
                {feedback.message}
              </div>
            ) : null}

            <div className={cn("flex gap-2", denseDesktop ? (ultraDenseDesktop ? "mt-auto pt-0" : "mt-auto pt-1") : "")}>
              <Button
                variant="secondary"
                className={cn("w-full border border-[#A07850]/45 bg-[linear-gradient(145deg,rgba(253,245,230,0.88),rgba(240,222,188,0.78))] text-[#2C1E16] shadow-[0_4px_12px_rgba(44,30,18,0.12),inset_0_1px_0_rgba(255,255,255,0.65)] transition-transform transition-shadow transition-opacity duration-150 ease-out hover:border-[#A07850]/70 hover:bg-[linear-gradient(145deg,rgba(255,248,235,0.95),rgba(245,228,195,0.9))] disabled:opacity-45", ultraDenseDesktop ? "min-h-7 rounded-[13px] px-2.5 text-[11px]" : denseDesktop ? "min-h-9 rounded-[16px] px-3 text-[13px]" : "")}
                disabled={!canGoPrevious}
                onClick={() => {
                  setIndex((prev) => Math.max(0, prev - 1));
                  setQuestionStartedAt(Date.now());
                  setFeedback(null);
                  setSelectedOption(null);
                  setFillBlankAnswer("");
                  setDragAssignments({});
                  setOrderingIds([]);
                }}
              >
                Anterior
              </Button>
              <Button
                className={cn(
                  "w-full bg-[#FF7A45] text-white shadow-[0_4px_0_rgba(212,91,49,0.7)] transition-transform transition-shadow transition-opacity duration-150 ease-out hover:brightness-105 active:translate-y-[1px] active:shadow-[0_2px_0_rgba(212,91,49,0.75)]",
                  ultraDenseDesktop ? "min-h-7 rounded-[13px] px-2.5 text-[11px]" : denseDesktop ? "min-h-9 rounded-[16px] px-3 text-[13px]" : "",
                  shouldHighlightFinish ? "ring-2 ring-secondary/35 ring-offset-2 ring-offset-[#18312E]" : "",
                  canGoNext ? "opacity-60 saturate-75" : "",
                )}
                disabled={canGoNext}
                onClick={() => void goNext()}
              >
                {canFinishNow || canForceFinishNow
                  ? finishing
                    ? "Finalizando..."
                    : pendingCompletionResult
                      ? "Salvar conclusão"
                      : "Finalizar sessão"
                  : loadingNextQuestion
                    ? "Carregando..."
                    : "Próximo"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {!loading && !error && !current ? (
        <Card className="lesson-card mb-4 border">
          <CardContent className="space-y-3 p-5">
            {contentUnavailableReason ? (
              <p className="text-base font-extrabold text-[#FFF4E7]">{contentUnavailableReason.title}</p>
            ) : null}
            <p className="text-sm font-semibold text-[#E6D8C7]">
              {questionError ?? "Ainda não foi possível carregar esta lição."}
            </p>
            {questionRetrying ? (
              <p className="text-xs font-semibold text-[#CDBAA6]">Tentando reconectar...</p>
            ) : null}
            <Button
              type="button"
              className="w-full"
              disabled={!session || submitting || questionRetrying}
              onClick={() => {
                if (!session) return;
                setQuestionError(null);
                setContentUnavailableReason(null);
                void loadQuestionBatchWithBackoff(session.subjectId).catch((err: unknown) => {
                  if (isEmptyBatchError(err)) {
                    if (shouldFallbackToOfflineForEmptyBatch(err)) {
                      const reason = resolveEmptyBatchReason(err);
                      activateOfflineMode(`${reason.detail} Entramos no modo offline para você continuar.`);
                      return;
                    }
                    applyEmptyBatchUnavailableState(err, "retry");
                    return;
                  }
                  const message = resolveQuestionLoadMessage(err);
                  activateOfflineMode(`${message} Entramos no modo offline para você continuar.`);
                });
              }}
            >
              Tentar novamente
            </Button>
            {contentUnavailableReason ? (
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => {
                  const subjectId = session?.subjectId ?? routeSubjectId;
                  if (subjectId && Number.isFinite(subjectId)) {
                    router.push(`/child/aprender?subjectId=${subjectId}`);
                    return;
                  }
                  router.push("/child/aprender");
                }}
              >
                Voltar para trilha
              </Button>
            ) : null}
            {session && answeredCount > 0 ? (
              <Button type="button" variant="secondary" className="w-full" disabled={finishing} onClick={() => void finishSessionNow()}>
                {finishing ? "Finalizando..." : "Finalizar com progresso atual"}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {result ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#2C1E16]/40 p-4"
          onClick={() => pushPathWithResult(result)}
        >
          <div
            className="w-full max-w-md rounded-3xl border border-[#A07850]/45 bg-[linear-gradient(145deg,rgba(253,245,230,0.97),rgba(240,222,188,0.95))] p-5 shadow-[0_24px_60px_rgba(44,30,18,0.38),inset_0_1px_0_rgba(255,255,255,0.8)]"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <p className="text-lg font-extrabold text-[#2C1E16]">Recompensas da sessão</p>
            <p className="mt-1 text-xs text-[#5C4A3A]">{starMessage(result.stars)}</p>
            <div className="mt-3 flex items-center justify-center gap-1">
              {[1, 2, 3].map((slot) => (
                <Star key={slot} className={cn("h-7 w-7", slot <= result.stars ? "star-pop fill-amber-400 text-amber-400" : "text-slate-300")} />
              ))}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-2xl border border-secondary/25 bg-secondary/10 p-2">
                <p className="text-[11px] text-muted-foreground">XP</p>
                <p className="text-sm font-bold text-secondary">+{displayXp}</p>
              </div>
              <div className="rounded-2xl border border-accent/25 bg-accent/10 p-2">
                <p className="text-[11px] text-muted-foreground">Moedas</p>
                <p className="text-sm font-bold text-accent-foreground">+{displayCoins}</p>
              </div>
              <div className="rounded-2xl border border-primary/25 bg-primary/10 p-2">
                <p className="text-[11px] text-muted-foreground">Acerto</p>
                <p className="text-sm font-bold text-primary">{Math.round(result.accuracy * 100)}%</p>
              </div>
            </div>
            <div className="mt-2.5 inline-flex items-center rounded-full border border-[#FFE39A] bg-[#FFF6D7] px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.05em] text-[#8B6A00] motion-safe:animate-[lesson-feedback-pop_260ms_ease-out]">
              XP ganho +{displayXp}
            </div>
            <div className="mt-3 rounded-2xl border border-[#DCE7F6] bg-[#F7FAFF] p-3">
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded-xl border border-[#DDE7F6] bg-white p-2">
                  <p className="text-[11px] text-muted-foreground">Unidade</p>
                  <p className="text-sm font-bold text-[#1D3A63]">{unitProgressPercent}%</p>
                </div>
                <div className="rounded-xl border border-[#DDE7F6] bg-white p-2">
                  <p className="text-[11px] text-muted-foreground">Streak</p>
                  <p className="text-sm font-bold text-[#1D3A63]">{Math.max(0, Math.floor(learningStreak?.currentStreak ?? 0))} dias</p>
                </div>
              </div>
              <div className="mt-2">
                <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-[#607898]">
                  <span>Meta semanal</span>
                  <span>
                    {Math.max(0, Math.min(weeklyGoal.target, weeklyGoal.completed))}/{Math.max(1, weeklyGoal.target)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[#E8F0FB]">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#2E9EEA_0%,#26C0B2_100%)] transition-transform transition-shadow transition-opacity duration-700 ease-out"
                    style={{ width: `${weeklyGoalPercent}%` }}
                  />
                </div>
              </div>
            </div>
            {result.leveledUp ? (
              <div className="mt-3 rounded-2xl border border-secondary/30 bg-secondary/10 px-3 py-2 text-center text-xs font-semibold text-secondary medal-glow">
                Nível liberado!
              </div>
            ) : null}
            <Button
              className="mt-4 w-full"
              onClick={() => pushPathWithResult(result)}
            >
              Continuar
            </Button>
          </div>
        </div>
      ) : null}

      <ChildBottomNav />

      <style jsx global>{`
        /* ═══ Tema Parchment — tela de lição ═══ */
        .lesson-cosmic {
          color: #2C1E16;
        }

        /* Cor base dos textos */
        .lesson-cosmic .text-foreground    { color: #2C1E16 !important; }
        .lesson-cosmic .text-muted-foreground { color: #8B5E1A !important; }
        .lesson-cosmic .text-\[\#FFF4E7\]  { color: #2C1E16 !important; }
        .lesson-cosmic .text-\[\#E6D8C7\]  { color: #5C4A3A !important; }
        .lesson-cosmic .text-\[\#CDBAA6\]  { color: #8B5E1A !important; }
        .lesson-cosmic .text-\[\#F0E5D8\]  { color: #2C1E16 !important; }
        .lesson-cosmic .text-slate-100,
        .lesson-cosmic .text-slate-200     { color: #2C1E16 !important; }
        .lesson-cosmic .text-slate-300,
        .lesson-cosmic .text-slate-400     { color: #5C4A3A !important; }

        /* Bordas internas */
        .lesson-cosmic .border-white\/10   { border-color: rgba(160,120,80,0.3) !important; }
        .lesson-cosmic .border-white\/12   { border-color: rgba(160,120,80,0.35) !important; }
        .lesson-cosmic .border-border,
        .lesson-cosmic .border-\[\#DFE8F6\],
        .lesson-cosmic .border-\[\#DDE7F6\],
        .lesson-cosmic .border-\[\#DCE7F6\],
        .lesson-cosmic .border-\[\#DCE6F4\],
        .lesson-cosmic .border-\[\#E4EBF7\] {
          border-color: rgba(160,120,80,0.3) !important;
        }

        /* Fundos internos */
        .lesson-cosmic .bg-white\/\[0\.05\],
        .lesson-cosmic .bg-white\/5        { background: rgba(160,120,80,0.08) !important; }
        .lesson-cosmic .bg-white\/10       { background: rgba(160,120,80,0.12) !important; }
        .lesson-cosmic .bg-white,
        .lesson-cosmic .bg-white\/90,
        .lesson-cosmic .bg-white\/92 {
          background: rgba(255,248,232,0.96) !important;
        }
        .lesson-cosmic .bg-muted\/25,
        .lesson-cosmic .bg-muted\/30,
        .lesson-cosmic .bg-muted\/40 {
          background: rgba(160,120,80,0.08) !important;
        }

        /* Cartão principal (lesson-card) */
        .lesson-card {
          background: linear-gradient(145deg,rgba(253,245,230,0.88),rgba(240,222,188,0.78)) !important;
          border-color: rgba(160,120,80,0.4) !important;
          box-shadow: 0 8px 24px rgba(44,30,18,0.18), inset 0 1px 0 rgba(255,255,255,0.7) !important;
        }

        .lesson-cosmic button,
        .lesson-cosmic [role="button"] {
          -webkit-font-smoothing: antialiased;
          text-rendering: geometricPrecision;
        }

        .lesson-cosmic h2,
        .lesson-cosmic h3,
        .lesson-cosmic p,
        .lesson-cosmic span {
          text-rendering: geometricPrecision;
        }

        @keyframes lesson-feedback-pop {
          0% {
            transform: scale(0.96);
            opacity: 0.55;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }

        @keyframes question-enter {
          0% {
            transform: translateX(8px);
            opacity: 0;
          }
          100% {
            transform: translateX(0);
            opacity: 1;
          }
        }

        @keyframes star-pop {
          0% {
            transform: scale(0.5) rotate(-12deg);
            opacity: 0;
          }
          100% {
            transform: scale(1) rotate(0deg);
            opacity: 1;
          }
        }
        @keyframes correct-glow {
          0% {
            box-shadow: 0 0 0 rgba(45, 212, 191, 0);
          }
          40% {
            box-shadow: 0 0 0 8px rgba(45, 212, 191, 0.14);
          }
          100% {
            box-shadow: 0 0 0 rgba(45, 212, 191, 0);
          }
        }
        @keyframes answer-correct-pop {
          0% {
            transform: scale(0.96);
          }
          60% {
            transform: scale(1.02) translateY(-1px);
          }
          100% {
            transform: scale(1);
          }
        }
        @keyframes medal-glow {
          0% {
            box-shadow: 0 0 0 rgba(253, 203, 88, 0);
          }
          35% {
            box-shadow: 0 0 0 8px rgba(253, 203, 88, 0.22);
          }
          100% {
            box-shadow: 0 0 0 rgba(253, 203, 88, 0);
          }
        }

        .lesson-feedback {
          animation: lesson-feedback-pop 220ms ease-out;
        }

        .question-enter {
          animation: question-enter 220ms ease-out;
        }

        .star-pop {
          animation: star-pop 300ms ease-out;
        }
        .correct-glow {
          animation: correct-glow 380ms ease-out;
        }
        .answer-correct-pop {
          animation: answer-correct-pop 300ms ease-out;
          border-color: rgba(45, 212, 191, 0.75) !important;
          background: linear-gradient(180deg, rgba(16, 185, 129, 0.18), rgba(13, 148, 136, 0.14)) !important;
          color: rgba(236, 253, 245, 0.98) !important;
        }
        .medal-glow {
          animation: medal-glow 760ms ease-out;
        }

        @media (prefers-reduced-motion: reduce) {
          .lesson-feedback,
          .question-enter,
          .star-pop,
          .correct-glow,
          .answer-correct-pop,
          .medal-glow {
            animation: none;
          }
        }
      `}</style>
      </div>
      </PageShell>
    </ChildDesktopShell>
    </div>
  );
}


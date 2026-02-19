"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Coins, Flame, Lightbulb, Star, Volume2, VolumeX, Zap } from "lucide-react";

import { ChildBottomNav } from "@/components/child-bottom-nav";
import { ConfettiBurst } from "@/components/confetti-burst";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import {
  ApiError,
  consumeAprenderWrongAnswerEnergy,
  finishLearningSession,
  getAdaptiveLearningNext,
  getApiErrorMessage,
  getAprenderLearningEnergy,
  getAprenderLearningStreak,
  refillAprenderEnergyWithCoins,
  refillAprenderEnergyWithWait,
  startLearningSession,
  submitAdaptiveLearningAnswer,
  type AprenderLearningEnergyStatus,
  type AprenderLearningStreak,
  type LearningAnswerResult,
  type LearningNextItem,
  type LearningSessionFinishResponse,
  type LearningSessionStartResponse,
} from "@/lib/api/client";
import {
  effectiveReducedMotion,
  fetchUXSettings,
  hapticCompletion,
  hapticLevelUp,
  hapticPress,
  playSfx,
  saveUXSettings,
} from "@/lib/ux-feedback";
import type { UserUXSettings } from "@/lib/api/client";
import { cn } from "@/lib/utils";

type FeedbackState = {
  tone: "success" | "encourage";
  message: string;
} | null;

type QuestionOutcome = {
  result: LearningAnswerResult;
  correct: boolean;
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

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toStringSafe(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
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
  const pairsRaw = asArray(metadata.pairs);
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
  if (question.type === "TRUE_FALSE") return "Dica do Axion: procure palavras-chave para validar a afirmação.";
  if (question.type === "FILL_BLANK") return "Dica do Axion: pense no contexto da frase para completar com segurança.";
  return "Dica do Axion: você aprende melhor quando revisa a resposta com atenção.";
}

function difficultyLabel(difficulty: LearningNextItem["difficulty"] | undefined): { text: string; className: string } {
  if (difficulty === "HARD") return { text: "Difícil", className: "border-violet-300/60 bg-violet-100/65 text-violet-700" };
  if (difficulty === "MEDIUM") return { text: "Média", className: "border-amber-300/60 bg-amber-100/65 text-amber-700" };
  return { text: "Fácil", className: "border-secondary/35 bg-secondary/10 text-secondary" };
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
  const lessonId = Number(params.id);

  const [session, setSession] = useState<LearningSessionStartResponse | null>(null);
  const [queue, setQueue] = useState<LearningNextItem[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [questionStartedAt, setQuestionStartedAt] = useState<number>(Date.now());
  const [answeredByStep, setAnsweredByStep] = useState<Record<number, boolean>>({});
  const [correctByStep, setCorrectByStep] = useState<Record<number, boolean>>({});
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [dragAssignments, setDragAssignments] = useState<Record<string, string>>({});
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [learningStreak, setLearningStreak] = useState<AprenderLearningStreak | null>(null);
  const [energyStatus, setEnergyStatus] = useState<AprenderLearningEnergyStatus | null>(null);
  const [energyLoading, setEnergyLoading] = useState(true);
  const [energyActionLoading, setEnergyActionLoading] = useState<"wait" | "coins" | null>(null);
  const [result, setResult] = useState<LearningSessionFinishResponse | null>(null);
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
  const reducedMotion = effectiveReducedMotion(uxSettings);

  const current = queue[index] ?? null;
  const currentDifficulty = difficultyLabel(current?.difficulty);
  const progressPercent = queue.length > 0 ? ((index + 1) / queue.length) * 100 : 0;
  const answeredCount = Object.keys(answeredByStep).length;
  const correctCount = Object.values(correctByStep).filter(Boolean).length;
  const energyBlocked = energyStatus ? !energyStatus.canPlay : false;
  const waitClock = energyStatus ? formatClock(energyStatus.secondsUntilPlayable) : "00:00";
  const axionTip = useMemo(() => resolveAxionTip(current), [current]);

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
        setLoading(true);
        setError(null);
        const sessionStart = await startLearningSession({ lessonId });
        setSession(sessionStart);
        const firstBatch = await getAdaptiveLearningNext({
          subjectId: sessionStart.subjectId,
          lessonId,
          count: 8,
        });
        setQueue(firstBatch.items);
        setIndex(0);
        setQuestionStartedAt(Date.now());
      } catch (err: unknown) {
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
    void getAprenderLearningStreak()
      .then((data) => setLearningStreak(data))
      .catch(() => setLearningStreak(null));
  }, [lessonId]);

  useEffect(() => {
    void fetchUXSettings().then(setUxSettings);
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
    try {
      const elapsed = Math.max(0, Date.now() - questionStartedAt);
      const answerResult = await submitAdaptiveLearningAnswer({
        questionId: current.questionId,
        templateId: current.templateId,
        generatedVariantId: current.generatedVariantId,
        variantId: current.variantId,
        result: outcome.result,
        timeMs: elapsed,
      });

      setAnsweredByStep((prev) => ({ ...prev, [index]: true }));
      setCorrectByStep((prev) => ({ ...prev, [index]: outcome.correct }));
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
        if (session) {
          const remediation = await getAdaptiveLearningNext({
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

  const finishSessionNow = async () => {
    if (!session || finishing || result) return;
    setFinishing(true);
    try {
      const response = await finishLearningSession({
        sessionId: session.sessionId,
        totalQuestions: answeredCount,
        correctCount,
      });
      setResult(response);
      if (!reducedMotion && (response.stars === 3 || response.leveledUp)) {
        setConfettiTrigger((prev) => prev + 1);
      }
      playSfx("/sfx/completion-chime.ogg", uxSettings.soundEnabled);
      if (response.leveledUp) hapticLevelUp(uxSettings);
      else hapticCompletion(uxSettings);
      void getAprenderLearningStreak()
        .then((data) => setLearningStreak(data))
        .catch(() => null);
    } catch (err: unknown) {
      const message =
        err instanceof ApiError
          ? getApiErrorMessage(err, "Não foi possível finalizar a sessão.")
          : "Não foi possível finalizar a sessão.";
      setError(message);
    } finally {
      setFinishing(false);
    }
  };

  const pushPathWithResult = (payload: LearningSessionFinishResponse) => {
    router.push(
      `/child/aprender?completedLessonId=${lessonId}&stars=${payload.stars}&xp=${payload.xpEarned}&coins=${payload.coinsEarned}&levelUp=${payload.leveledUp ? 1 : 0}`,
    );
  };

  const onBackToPath = async () => {
    if (backSaving || finishing) return;
    if (result) {
      pushPathWithResult(result);
      return;
    }
    if (!session || answeredCount === 0) {
      router.push("/child/aprender");
      return;
    }
    setBackSaving(true);
    try {
      const response = await finishLearningSession({
        sessionId: session.sessionId,
        totalQuestions: answeredCount,
        correctCount,
      });
      pushPathWithResult(response);
    } catch {
      router.push("/child/aprender");
    } finally {
      setBackSaving(false);
    }
  };

  const goNext = async () => {
    setFeedback(null);
    setSelectedOption(null);
    setDragAssignments({});
    if (index < queue.length - 1) {
      setIndex((prev) => prev + 1);
      setQuestionStartedAt(Date.now());
      return;
    }
    await finishSessionNow();
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
  const currentAnswered = Boolean(answeredByStep[index]);
  const canSubmitDragDrop = pairs.length > 0 && Object.keys(dragAssignments).length >= pairs.length;

  return (
    <main className="safe-px safe-pb mx-auto min-h-screen w-full max-w-md p-4 pb-52 md:max-w-2xl md:p-6 md:pb-40">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="inline-flex w-full items-center gap-1.5 rounded-2xl border-2 border-border bg-white px-2.5 py-1.5 text-sm font-semibold text-muted-foreground shadow-[0_2px_0_rgba(184,200,239,0.7)] transition hover:bg-muted"
          onClick={() => void onBackToPath()}
          disabled={backSaving}
        >
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-lg bg-muted">
            <ArrowLeft className="h-4 w-4 stroke-[2.6]" />
          </span>
          {backSaving ? "Salvando..." : "Voltar ao caminho"}
        </button>
        <Button
          type="button"
          variant="secondary"
          className="min-w-0 flex-1 px-2 text-xs"
          onClick={() =>
            void saveUXSettings({
              soundEnabled: !uxSettings.soundEnabled,
              hapticsEnabled: uxSettings.hapticsEnabled,
              reducedMotion: uxSettings.reducedMotion,
            }).then(setUxSettings)
          }
        >
          {uxSettings.soundEnabled ? <Volume2 className="mr-1 h-4 w-4" /> : <VolumeX className="mr-1 h-4 w-4" />}
          Som {uxSettings.soundEnabled ? "ligado" : "desligado"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="min-w-0 flex-1 px-2 text-xs"
          onClick={() =>
            void saveUXSettings({
              soundEnabled: uxSettings.soundEnabled,
              hapticsEnabled: !uxSettings.hapticsEnabled,
              reducedMotion: uxSettings.reducedMotion,
            }).then(setUxSettings)
          }
        >
          Haptics {uxSettings.hapticsEnabled ? "on" : "off"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="min-w-0 flex-1 px-2 text-xs"
          onClick={() =>
            void saveUXSettings({
              soundEnabled: uxSettings.soundEnabled,
              hapticsEnabled: uxSettings.hapticsEnabled,
              reducedMotion: !uxSettings.reducedMotion,
            }).then(setUxSettings)
          }
        >
          Movimento {uxSettings.reducedMotion ? "reduzido" : "normal"}
        </Button>
      </div>

      <ConfettiBurst trigger={confettiTrigger} />

      <Card className="mb-4 overflow-hidden border-border bg-[radial-gradient(circle_at_85%_12%,rgba(45,212,191,0.18),transparent_48%),linear-gradient(180deg,#ffffff_0%,#f3fbff_100%)] shadow-[0_2px_0_rgba(184,200,239,0.7),0_14px_28px_rgba(34,63,107,0.12)]">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-lg">Sessão adaptativa #{Number.isFinite(lessonId) ? lessonId : "--"}</CardTitle>
            <span className="inline-flex items-center gap-1 rounded-full border border-accent/35 bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent-foreground">
              <Flame className="h-3.5 w-3.5 text-accent" />
              {learningStreak?.currentStreak ?? 0}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center justify-between rounded-2xl border border-border bg-white/90 px-3 py-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Zap className="h-4 w-4 text-accent" />
              Energia
            </span>
            <div className="text-right text-xs font-semibold">
              <p className="text-foreground">{energyLoading ? "..." : energyStatus ? `${energyStatus.energy}/${energyStatus.maxEnergy}` : "--/--"}</p>
              {!energyLoading && energyBlocked ? <p className="text-muted-foreground">Libera em {waitClock}</p> : null}
            </div>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-muted-foreground">Progresso da sessão</span>
            <span className="font-semibold text-foreground">{Math.round(progressPercent)}%</span>
          </div>
          <ProgressBar value={progressPercent} tone="secondary" />
        </CardContent>
      </Card>

      {loading ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Preparando sessão adaptativa...</CardContent>
        </Card>
      ) : null}

      {error ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">{error}</CardContent>
        </Card>
      ) : null}

      {!loading && !error && current ? (
        <Card className="mb-4">
          <CardContent className="space-y-4 p-5">
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
              className={cn("question-enter space-y-3", feedback?.tone === "success" ? "correct-glow" : "")}
            >
              {tipVisible ? (
                <div className="rounded-2xl border border-secondary/35 bg-secondary/10 px-3 py-2">
                  <p className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-secondary">
                    <Lightbulb className="h-3.5 w-3.5" />
                    Dica do Axion
                  </p>
                  <p className="mt-1 text-sm font-semibold text-secondary/90">{axionTip}</p>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2 rounded-2xl border border-border bg-muted/30 px-3 py-2">
                  <p className="text-xs font-semibold text-muted-foreground">Precisa de ajuda? O Axion pode dar uma dica.</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-8 shrink-0 whitespace-nowrap rounded-xl border-b-2 px-3 text-xs leading-none shadow-[0_3px_0_rgba(10,114,113,0.28),0_6px_10px_rgba(10,76,74,0.14)] active:translate-y-[1px]"
                    onClick={() => setTipVisible(true)}
                  >
                    Mostrar dica
                  </Button>
                </div>
              )}
              <h2 className="text-lg font-extrabold text-foreground">{current.prompt}</h2>
              <div className="flex items-center justify-between">
                <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-extrabold", currentDifficulty.className)}>
                  {currentDifficulty.text}
                </span>
              </div>
              {current.type === "DRAG_DROP" ? (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-border bg-white/90 p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Itens</p>
                    <div className="flex flex-wrap gap-2">
                      {pairs
                        .filter((pair) => !dragAssignments[pair.itemId])
                        .map((pair) => (
                          <button
                            key={pair.itemId}
                            type="button"
                            draggable={!currentAnswered}
                            onDragStart={() => setDraggingItemId(pair.itemId)}
                            className="rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary"
                          >
                            {pair.itemLabel}
                          </button>
                        ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
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
                          className="rounded-2xl border border-border bg-muted/40 p-3"
                        >
                          <p className="text-xs font-semibold text-muted-foreground">{pair.targetLabel}</p>
                          <p className="mt-1 text-sm font-bold text-foreground">{assignedLabel || "Solte aqui"}</p>
                        </div>
                      );
                    })}
                  </div>
                  <Button
                    className="w-full"
                    disabled={currentAnswered || !canSubmitDragDrop || energyBlocked || submitting}
                    onClick={() => void onCheckDragDrop()}
                  >
                    Verificar resposta
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  {options.length > 0 ? (
                    options.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={cn(
                        "rounded-2xl border px-3 py-3 text-left text-sm font-semibold transition-all",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2",
                        selectedOption === option.id ? "border-primary bg-primary/10 text-primary" : "border-border bg-white text-foreground hover:bg-muted",
                        currentAnswered && correctByStep[index] && selectedOption === option.id ? "answer-correct-pop" : "",
                      )}
                        disabled={currentAnswered || energyBlocked || submitting}
                        onClick={() => void onPickOption(option.id)}
                      >
                        {option.label}
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
                  "rounded-2xl border px-3 py-2 text-sm font-semibold leading-snug break-words lesson-feedback",
                  feedback.tone === "success" ? "border-secondary/40 bg-secondary/10 text-secondary" : "border-accent/40 bg-accent/10 text-accent-foreground",
                )}
              >
                {feedback.message}
              </div>
            ) : null}

            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="w-full"
                disabled={index === 0 || submitting || finishing || Boolean(result)}
                onClick={() => {
                  setIndex((prev) => Math.max(0, prev - 1));
                  setQuestionStartedAt(Date.now());
                  setFeedback(null);
                  setSelectedOption(null);
                  setDragAssignments({});
                }}
              >
                Anterior
              </Button>
              <Button
                className="w-full"
                disabled={!currentAnswered || submitting || finishing || energyBlocked || Boolean(result)}
                onClick={() => void goNext()}
              >
                {index >= queue.length - 1 ? (finishing ? "Finalizando..." : "Finalizar sessão") : "Próximo"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {result ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"
          onClick={() => router.push(`/child/aprender?completedLessonId=${lessonId}&stars=${result.stars}&xp=${result.xpEarned}&coins=${result.coinsEarned}&levelUp=${result.leveledUp ? 1 : 0}`)}
        >
          <div
            className="w-full max-w-md rounded-3xl border border-border bg-white p-5 shadow-[0_24px_60px_rgba(13,25,41,0.32)]"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <p className="text-lg font-extrabold text-foreground">Recompensas da sessão</p>
            <p className="mt-1 text-xs text-muted-foreground">{starMessage(result.stars)}</p>
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
            {result.leveledUp ? (
              <div className="mt-3 rounded-2xl border border-secondary/30 bg-secondary/10 px-3 py-2 text-center text-xs font-semibold text-secondary">
                Nível liberado!
              </div>
            ) : null}
            <Button
              className="mt-4 w-full"
              onClick={() =>
                router.push(
                  `/child/aprender?completedLessonId=${lessonId}&stars=${result.stars}&xp=${result.xpEarned}&coins=${result.coinsEarned}&levelUp=${result.leveledUp ? 1 : 0}`,
                )
              }
            >
              Continuar
            </Button>
          </div>
        </div>
      ) : null}

      <ChildBottomNav />

      <style jsx global>{`
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
            transform: scale(1);
          }
          40% {
            transform: scale(1.02);
          }
          100% {
            transform: scale(1);
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
          background: rgba(45, 212, 191, 0.12) !important;
          color: #0f766e !important;
        }

        @media (prefers-reduced-motion: reduce) {
          .lesson-feedback,
          .question-enter,
          .star-pop,
          .correct-glow,
          .answer-correct-pop {
            animation: none;
          }
        }
      `}</style>
    </main>
  );
}


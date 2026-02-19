"use client";

import Link from "next/link";
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
  const optionsRaw = asArray(metadata.options);
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
  if (stars === 3) return "Excelente! Sessao perfeita.";
  if (stars === 2) return "Muito bom! Voce evoluiu bastante.";
  return "Bom esforco! Continue praticando para subir de nivel.";
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
  const reducedMotion = effectiveReducedMotion(uxSettings);

  const current = queue[index] ?? null;
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
      setError("Licao invalida.");
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
            ? getApiErrorMessage(err, "Nao foi possivel iniciar a sessao adaptativa.")
            : "Nao foi possivel iniciar a sessao adaptativa.";
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
        setFeedback({
          tone: "encourage",
          message: `${explanation} Axion já separou uma prática leve para você.`,
        });
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
        const masteryGain = Math.max(0, answerResult.masteryDelta) * 100;
        const streakCelebrate =
          answerResult.streakCorrect > 0 && answerResult.streakCorrect % 3 === 0
            ? " Sequência brilhante em construção."
            : "";
        setFeedback({
          tone: "success",
          message: `Boa resposta! Mastery +${masteryGain.toFixed(1)}%.${streakCelebrate}`,
        });
        playSfx("/sfx/completion-chime.ogg", uxSettings.soundEnabled);
        hapticCompletion(uxSettings);
      }
    } catch (err: unknown) {
      const message =
        err instanceof ApiError
          ? getApiErrorMessage(err, "Nao foi possivel registrar a resposta.")
          : "Nao foi possivel registrar a resposta.";
      setError(message);
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
          ? getApiErrorMessage(err, "Nao foi possivel finalizar a sessao.")
          : "Nao foi possivel finalizar a sessao.";
      setError(message);
    } finally {
      setFinishing(false);
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
      <div className="mb-3 flex items-center justify-between gap-2">
        <Link
          className="inline-flex items-center gap-1.5 rounded-2xl border-2 border-border bg-white px-2.5 py-1.5 text-sm font-semibold text-muted-foreground shadow-[0_2px_0_rgba(184,200,239,0.7)] transition hover:bg-muted"
          href="/child/aprender"
        >
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-lg bg-muted">
            <ArrowLeft className="h-4 w-4 stroke-[2.6]" />
          </span>
          Voltar ao caminho
        </Link>
        <Button
          type="button"
          variant="secondary"
          className="px-3"
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
          className="px-3"
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
          className="px-3"
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

      <Card className="mb-4 overflow-hidden border-border bg-[radial-gradient(circle_at_85%_12%,rgba(255,107,61,0.2),transparent_48%),linear-gradient(180deg,#ffffff_0%,#f3fbff_100%)] shadow-[0_2px_0_rgba(184,200,239,0.7),0_14px_28px_rgba(34,63,107,0.12)]">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-lg">Sessao adaptativa #{Number.isFinite(lessonId) ? lessonId : "--"}</CardTitle>
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
            <span className="font-semibold text-muted-foreground">Progresso da sessao</span>
            <span className="font-semibold text-foreground">{Math.round(progressPercent)}%</span>
          </div>
          <ProgressBar value={progressPercent} tone="secondary" />
        </CardContent>
      </Card>

      {loading ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Preparando sessao adaptativa...</CardContent>
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

            <div key={`${current.questionId ?? current.templateId ?? "q"}-${index}`} className="question-enter space-y-3">
              <div className="rounded-2xl border border-secondary/35 bg-secondary/10 px-3 py-2">
                <p className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-secondary">
                  <Lightbulb className="h-3.5 w-3.5" />
                  Axion tip
                </p>
                <p className="mt-1 text-sm font-semibold text-secondary/90">{axionTip}</p>
              </div>
              <h2 className="text-lg font-extrabold text-foreground">{current.prompt}</h2>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {current.type} · passo {index + 1}
              </p>

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
                  {options.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={cn(
                        "rounded-2xl border px-3 py-3 text-left text-sm font-semibold transition-all",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2",
                        selectedOption === option.id ? "border-primary bg-primary/10 text-primary" : "border-border bg-white text-foreground hover:bg-muted",
                      )}
                      disabled={currentAnswered || energyBlocked || submitting}
                      onClick={() => void onPickOption(option.id)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {feedback ? (
              <div
                className={cn(
                  "rounded-2xl border px-3 py-2 text-sm font-semibold lesson-feedback",
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
                {index >= queue.length - 1 ? (finishing ? "Finalizando..." : "Finalizar sessao") : "Proximo"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {result ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-4 md:items-center"
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

        .lesson-feedback {
          animation: lesson-feedback-pop 220ms ease-out;
        }

        .question-enter {
          animation: question-enter 220ms ease-out;
        }

        .star-pop {
          animation: star-pop 300ms ease-out;
        }

        @media (prefers-reduced-motion: reduce) {
          .lesson-feedback,
          .question-enter,
          .star-pop {
            animation: none;
          }
        }
      `}</style>
    </main>
  );
}

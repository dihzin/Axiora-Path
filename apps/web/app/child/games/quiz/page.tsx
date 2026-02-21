"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Sparkles } from "lucide-react";

import { ChildBottomNav } from "@/components/child-bottom-nav";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  finishGameEngineSession,
  registerGameSession,
  submitGameEngineAnswer,
  type GameSessionRegisterResponse,
} from "@/lib/api/client";

type Question = {
  id: string;
  prompt: string;
  options: number[];
  correct: number;
};

function buildQuestion(seed: number): Question {
  const a = 1 + ((seed * 7) % 20);
  const b = 1 + ((seed * 11) % 20);
  const correct = a + b;
  const options = Array.from(new Set([correct, correct + 1, correct - 1, correct + 2])).filter((v) => v > 0).slice(0, 4);
  while (options.length < 4) options.push(correct + options.length + 3);
  return {
    id: `q-${seed}`,
    prompt: `Quanto é ${a} + ${b}?`,
    options: options.sort(() => Math.random() - 0.5),
    correct,
  };
}

export default function QuizGamePage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [title, setTitle] = useState("Corrida da Soma");
  const [reward, setReward] = useState<GameSessionRegisterResponse | null>(null);

  useEffect(() => {
    const generated = Array.from({ length: 8 }, (_, i) => buildQuestion(i + 1));
    setQuestions(generated);
    try {
      const raw = localStorage.getItem("axiora_active_game_engine_session");
      if (!raw) return;
      const parsed = JSON.parse(raw) as { sessionId?: string; title?: string; href?: string };
      if (parsed.href === "/child/games/quiz") {
        if (parsed.sessionId) setSessionId(parsed.sessionId);
        if (parsed.title) setTitle(parsed.title);
      }
    } catch {
      // ignore malformed payload
    }
  }, []);

  const current = questions[index];
  const progress = useMemo(() => (questions.length === 0 ? 0 : Math.round((index / questions.length) * 100)), [index, questions.length]);

  async function onSelect(answer: number) {
    if (!current || selected !== null || submitting) return;
    setSelected(answer);
    const isCorrect = answer === current.correct;
    if (isCorrect) setCorrectCount((prev) => prev + 1);
    if (sessionId) {
      void submitGameEngineAnswer(sessionId, {
        stepId: current.id,
        answer: { value: answer, isCorrect },
        elapsedMs: 3000,
      }).catch(() => undefined);
    }
  }

  async function onNext() {
    if (selected === null || submitting) return;
    if (index < questions.length - 1) {
      setIndex((prev) => prev + 1);
      setSelected(null);
      return;
    }
    setSubmitting(true);
    try {
      if (sessionId) {
        void finishGameEngineSession(sessionId).catch(() => undefined);
      }
      const score = Math.round((correctCount / Math.max(1, questions.length)) * 100);
      const reg = await registerGameSession({ gameType: "CROSSWORD", score });
      setReward(reg);
    } catch {
      setReward(null);
    } finally {
      setDone(true);
      setSubmitting(false);
    }
  }

  function onRestart() {
    const generated = Array.from({ length: 8 }, (_, i) => buildQuestion(i + 9));
    setQuestions(generated);
    setIndex(0);
    setCorrectCount(0);
    setSelected(null);
    setDone(false);
    setReward(null);
  }

  return (
    <PageShell tone="child" width="compact">
      <Card className="mb-3">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <Link href="/child/games" className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-semibold">
              <ArrowLeft className="h-4 w-4" />
              Voltar aos jogos
            </Link>
            <span className="rounded-full border border-secondary/30 bg-secondary/10 px-2 py-1 text-xs font-semibold text-secondary">{progress}%</span>
          </div>
          <CardTitle className="mt-2 text-lg">{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {done ? (
            <div className="space-y-3 rounded-2xl border border-border bg-white/90 p-4 text-sm">
              <p className="text-base font-bold">Sessão concluída</p>
              <p>
                Você acertou <strong>{correctCount}</strong> de <strong>{questions.length}</strong> questões.
              </p>
              <p>XP aplicado: {reward?.dailyLimit.grantedXp ?? 0}</p>
              <p>Moedas: {reward?.session.coinsEarned ?? 0}</p>
              <Button className="w-full" onClick={onRestart}>
                Jogar novamente
              </Button>
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-border bg-white/90 p-4">
                <p className="text-xs font-semibold text-muted-foreground">
                  Questão {index + 1} de {questions.length}
                </p>
                <p className="mt-2 text-xl font-extrabold text-foreground">{current?.prompt}</p>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {current?.options.map((option) => {
                  const isSelected = selected === option;
                  const isCorrect = current.correct === option;
                  const tone =
                    selected === null
                      ? "border-border bg-white"
                      : isSelected && isCorrect
                        ? "border-secondary/60 bg-secondary/10"
                        : isSelected && !isCorrect
                          ? "border-accent/50 bg-accent/10"
                          : "border-border bg-white";
                  return (
                    <button
                      key={option}
                      type="button"
                      className={`rounded-2xl border px-4 py-3 text-left text-base font-bold ${tone}`}
                      onClick={() => onSelect(option)}
                      disabled={selected !== null}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
              <div className="rounded-xl border border-border bg-white/90 p-3 text-sm">
                {selected === null ? (
                  <p className="text-muted-foreground">Escolha uma resposta para continuar.</p>
                ) : selected === current?.correct ? (
                  <p className="font-semibold text-secondary inline-flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    Boa! Você acertou.
                  </p>
                ) : (
                  <p className="font-semibold text-foreground">Quase! A resposta correta é {current?.correct}.</p>
                )}
              </div>
              <Button className="w-full" onClick={onNext} disabled={selected === null || submitting}>
                {index < questions.length - 1 ? "Próxima questão" : "Concluir"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
      <ChildBottomNav />
    </PageShell>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Gauge, Heart, Timer, Trophy, Zap } from "lucide-react";

import { ChildBottomNav } from "@/components/child-bottom-nav";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import {
  finishGameEngineSession,
  registerGameSession,
  submitGameEngineAnswer,
  type GameSessionRegisterResponse,
} from "@/lib/api/client";
import { UX_SETTINGS_FALLBACK, fetchUXSettings, hapticCompletion, hapticPress, playSfx } from "@/lib/ux-feedback";
import { cn } from "@/lib/utils";

type Question = {
  id: string;
  prompt: string;
  options: string[];
  correct: string;
};

type QuizTheme = "SUM" | "COMPARE" | "FRACTIONS" | "ENGLISH" | "SCIENCE";

const TEMPLATE_THEME_MAP: Record<string, QuizTheme> = {
  "7f9d501f-7c56-4690-9da5-bf1b95818801": "SUM", // Corrida da Soma
  "f80b40cf-e8a9-4f3c-a2dd-c2d3cfe6d2fd": "COMPARE", // Compara Números
  "7d0b9986-f1d0-457f-936b-c6ad4cda0eba": "FRACTIONS", // Circuito de Frações
  "e2a87d87-df4c-4bb8-ac96-6fd274a469ac": "SCIENCE", // Desafio do Bioma
  "63b8fdd6-a512-487f-b0a4-9860904f7558": "ENGLISH", // Estação de Inglês
};

const FEEDBACK_CORRECT = [
  "Boa! Acelerou na pista.",
  "Perfeito! Curva feita com estilo.",
  "Mandou bem! Ganhou velocidade.",
  "Excelente! Você está no ritmo.",
];

const FEEDBACK_WRONG = [
  "Quase! Ajusta a rota e segue.",
  "Boa tentativa! Vamos para a próxima.",
  "Está perto! Respira e acelera de novo.",
  "Tudo certo! A próxima é sua.",
];

function pickFeedback(pool: string[]): string {
  return pool[Math.floor(Math.random() * pool.length)] ?? pool[0] ?? "";
}

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function inferThemeFromTitle(gameTitle: string): QuizTheme {
  const title = gameTitle.trim().toLowerCase();
  if (title.includes("ingl")) return "ENGLISH";
  if (title.includes("bioma") || title.includes("ciên") || title.includes("cien")) return "SCIENCE";
  if (title.includes("fraç") || title.includes("frac")) return "FRACTIONS";
  if (title.includes("compara")) return "COMPARE";
  return "SUM";
}

function buildSumQuestion(seed: number): Question {
  const a = 1 + ((seed * 7) % 20);
  const b = 1 + ((seed * 11) % 20);
  const correct = String(a + b);
  const options = Array.from(new Set([a + b, a + b + 1, a + b - 1, a + b + 2]))
    .filter((v) => v > 0)
    .slice(0, 4)
    .map(String);
  while (options.length < 4) options.push(String(a + b + options.length + 3));
  return {
    id: `sum-${seed}`,
    prompt: `Quanto é ${a} + ${b}?`,
    options: shuffle(options),
    correct,
  };
}

function buildCompareQuestion(seed: number): Question {
  const a = 10 + ((seed * 9) % 90);
  const b = 10 + ((seed * 13) % 90);
  const correct = a > b ? `${a} é maior` : b > a ? `${b} é maior` : "São iguais";
  const options = shuffle([`${a} é maior`, `${b} é maior`, "São iguais", "Não dá para saber"]);
  return {
    id: `compare-${seed}`,
    prompt: `Compare os números ${a} e ${b}:`,
    options,
    correct,
  };
}

function buildFractionsQuestion(seed: number): Question {
  const pool = [
    { prompt: "Qual fração representa metade?", correct: "1/2", options: ["1/2", "1/3", "2/3", "3/4"] },
    { prompt: "Qual fração é maior?", correct: "3/4", options: ["1/4", "2/4", "3/4", "1/2"] },
    { prompt: "2/4 é equivalente a:", correct: "1/2", options: ["1/2", "1/3", "3/4", "2/3"] },
    { prompt: "Qual fração representa um quarto?", correct: "1/4", options: ["1/4", "1/2", "2/3", "3/4"] },
  ];
  const item = pool[seed % pool.length];
  return {
    id: `fraction-${seed}`,
    prompt: item.prompt,
    options: shuffle(item.options),
    correct: item.correct,
  };
}

function buildEnglishQuestion(seed: number): Question {
  const pool = [
    { prompt: "Traduza para português: book", correct: "livro", options: ["livro", "bola", "caderno", "janela"] },
    { prompt: "Traduza para português: school", correct: "escola", options: ["escola", "parque", "família", "moeda"] },
    { prompt: "Qual é a tradução de 'water'?", correct: "água", options: ["água", "fogo", "terra", "vento"] },
    { prompt: "Complete: Good ___ (manhã)", correct: "morning", options: ["morning", "night", "book", "house"] },
    { prompt: "Traduza para inglês: casa", correct: "house", options: ["house", "tree", "street", "friend"] },
  ];
  const item = pool[seed % pool.length];
  return {
    id: `english-${seed}`,
    prompt: item.prompt,
    options: shuffle(item.options),
    correct: item.correct,
  };
}

function buildScienceQuestion(seed: number): Question {
  const pool = [
    { prompt: "Qual bioma brasileiro tem grande umidade e floresta densa?", correct: "Amazônia", options: ["Amazônia", "Caatinga", "Pampa", "Pantanal"] },
    { prompt: "A Caatinga é caracterizada por:", correct: "Clima seco", options: ["Clima seco", "Neve constante", "Mar aberto", "Gelo permanente"] },
    { prompt: "No Pantanal, é comum encontrar:", correct: "Áreas alagadas", options: ["Áreas alagadas", "Dunas de gelo", "Vulcões ativos", "Desertos"] },
    { prompt: "Qual atitude ajuda o meio ambiente?", correct: "Reciclar resíduos", options: ["Reciclar resíduos", "Desperdiçar água", "Queimar lixo", "Poluir rios"] },
  ];
  const item = pool[seed % pool.length];
  return {
    id: `science-${seed}`,
    prompt: item.prompt,
    options: shuffle(item.options),
    correct: item.correct,
  };
}

function buildQuestion(seed: number, theme: QuizTheme): Question {
  if (theme === "ENGLISH") return buildEnglishQuestion(seed);
  if (theme === "SCIENCE") return buildScienceQuestion(seed);
  if (theme === "FRACTIONS") return buildFractionsQuestion(seed);
  if (theme === "COMPARE") return buildCompareQuestion(seed);
  return buildSumQuestion(seed);
}

function buildQuestions(theme: QuizTheme, offset = 1): Question[] {
  return Array.from({ length: 8 }, (_, i) => buildQuestion(i + offset, theme));
}

function themeTip(theme: QuizTheme): string {
  if (theme === "ENGLISH") return "Dica Axion: leia a palavra em voz baixa antes de responder.";
  if (theme === "SCIENCE") return "Dica Axion: use exemplos da natureza para lembrar os conceitos.";
  if (theme === "FRACTIONS") return "Dica Axion: compare as partes do todo com calma.";
  if (theme === "COMPARE") return "Dica Axion: observe qual número está mais distante do zero.";
  return "Dica Axion: some dezenas primeiro e depois as unidades.";
}

function pointsByTheme(theme: QuizTheme): number {
  if (theme === "ENGLISH") return 120;
  if (theme === "SCIENCE") return 115;
  if (theme === "FRACTIONS") return 125;
  if (theme === "COMPARE") return 110;
  return 100;
}

export default function QuizGamePage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [theme, setTheme] = useState<QuizTheme>("SUM");
  const [index, setIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [title, setTitle] = useState("Corrida da Soma");
  const [reward, setReward] = useState<GameSessionRegisterResponse | null>(null);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [lives, setLives] = useState(3);
  const [timeLeft, setTimeLeft] = useState(12);
  const [feedback, setFeedback] = useState<string>("Escolha uma resposta para continuar.");
  const [streakPoints, setStreakPoints] = useState(0);
  const [uxSettings, setUxSettings] = useState(UX_SETTINGS_FALLBACK);

  useEffect(() => {
    let nextTitle = "Corrida da Soma";
    let nextTheme: QuizTheme = "SUM";
    let nextTemplateId: string | null = null;
    try {
      const params = new URLSearchParams(window.location.search);
      nextTemplateId = params.get("templateId");
      const raw = localStorage.getItem("axiora_active_game_engine_session");
      if (raw) {
        const parsed = JSON.parse(raw) as { sessionId?: string; title?: string; href?: string; templateId?: string | null };
        if (parsed.href === "/child/games/quiz") {
          if (parsed.sessionId) setSessionId(parsed.sessionId);
          if (parsed.title) {
            nextTitle = parsed.title;
            setTitle(parsed.title);
          }
          if (!nextTemplateId && parsed.templateId) {
            nextTemplateId = parsed.templateId;
          }
        }
      }
    } catch {
      // ignore malformed payload
    }
    if (nextTemplateId && TEMPLATE_THEME_MAP[nextTemplateId]) {
      nextTheme = TEMPLATE_THEME_MAP[nextTemplateId];
    } else {
      nextTheme = inferThemeFromTitle(nextTitle);
    }
    setTheme(nextTheme);
    setQuestions(buildQuestions(nextTheme, 1));
    setFeedback(themeTip(nextTheme));
    void fetchUXSettings().then(setUxSettings).catch(() => setUxSettings(UX_SETTINGS_FALLBACK));
  }, []);

  const current = questions[index];
  const progress = useMemo(() => (questions.length === 0 ? 0 : Math.round((index / questions.length) * 100)), [index, questions.length]);
  const timerPercent = useMemo(() => Math.max(0, Math.min(100, (timeLeft / 12) * 100)), [timeLeft]);
  const scorePoints = useMemo(() => correctCount * pointsByTheme(theme) + bestCombo * 20 + lives * 15 + streakPoints, [bestCombo, correctCount, lives, streakPoints, theme]);

  useEffect(() => {
    if (done || selected !== null || submitting) return;
    if (timeLeft <= 0) {
      setFeedback("Tempo esgotado! Vamos para a próxima.");
      setSelected("TIMEOUT");
      setCombo(0);
      setLives((prev) => Math.max(0, prev - 1));
      hapticPress(uxSettings);
      return;
    }
    const timer = setTimeout(() => setTimeLeft((prev) => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [done, selected, submitting, timeLeft, uxSettings]);

  useEffect(() => {
    if (lives > 0 || done) return;
    setDone(true);
  }, [done, lives]);

  async function onSelect(answer: string) {
    if (!current || selected !== null || submitting) return;
    setSelected(answer);
    const isCorrect = answer === current.correct;
    if (isCorrect) {
      hapticPress(uxSettings);
      playSfx("/sfx/node-pop.ogg", uxSettings.soundEnabled);
      setCorrectCount((prev) => prev + 1);
      setCombo((prev) => {
        const next = prev + 1;
        setBestCombo((best) => Math.max(best, next));
        if (next >= 2) {
          setStreakPoints((score) => score + 10);
        }
        return next;
      });
      setFeedback(combo + 1 >= 2 ? "Sequência em alta! Você está voando." : pickFeedback(FEEDBACK_CORRECT));
    } else {
      hapticPress(uxSettings);
      setCombo(0);
      setLives((prev) => Math.max(0, prev - 1));
      setFeedback(`${pickFeedback(FEEDBACK_WRONG)} Resposta: ${current.correct}.`);
    }
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
    if (lives <= 0 && !done) {
      setDone(true);
      return;
    }
    if (index < questions.length - 1) {
      setIndex((prev) => prev + 1);
      setSelected(null);
      setTimeLeft(12);
      setFeedback(themeTip(theme));
      return;
    }
    setSubmitting(true);
    try {
      if (sessionId) {
        void finishGameEngineSession(sessionId).catch(() => undefined);
      }
      const accuracyScore = Math.round((correctCount / Math.max(1, questions.length)) * 100);
      const comboBonus = Math.min(12, bestCombo) * 2;
      const livesBonus = lives * 5;
      const score = Math.min(100, accuracyScore + comboBonus + livesBonus);
      const reg = await registerGameSession({ gameType: "CROSSWORD", score });
      setReward(reg);
    } catch {
      setReward(null);
    } finally {
      playSfx("/sfx/completion-chime.ogg", uxSettings.soundEnabled);
      hapticCompletion(uxSettings);
      setDone(true);
      setSubmitting(false);
    }
  }

  function onRestart() {
    setQuestions(buildQuestions(theme, 9));
    setIndex(0);
    setCorrectCount(0);
    setSelected(null);
    setCombo(0);
    setBestCombo(0);
    setLives(3);
    setTimeLeft(12);
    setFeedback(themeTip(theme));
    setStreakPoints(0);
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
          <div className="rounded-2xl border border-border bg-white/90 p-3">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-1 font-semibold text-muted-foreground">
                <Timer className="h-3.5 w-3.5" />
                Tempo da rodada
              </span>
              <span className={cn("font-bold", timerPercent <= 25 ? "text-accent-foreground" : "text-foreground")}>{timeLeft}s</span>
            </div>
            <ProgressBar value={timerPercent} tone={timerPercent <= 25 ? "primary" : "secondary"} />
          </div>
          <div className="grid grid-cols-4 gap-2 rounded-2xl border border-border bg-white/80 p-2 text-xs">
            <div className="rounded-xl border border-border/70 bg-white px-2 py-1">
              <p className="text-muted-foreground">Acertos</p>
              <p className="inline-flex items-center gap-1 font-bold text-primary">{correctCount}</p>
            </div>
            <div className="rounded-xl border border-border/70 bg-white px-2 py-1">
              <p className="text-muted-foreground">Combo</p>
              <p className={cn("inline-flex items-center gap-1 font-bold", combo >= 2 ? "text-secondary" : "text-foreground")}>
                <Zap className="h-3.5 w-3.5" />
                x{Math.max(1, combo)}
              </p>
            </div>
            <div className="rounded-xl border border-border/70 bg-white px-2 py-1">
              <p className="text-muted-foreground">Vidas</p>
              <p className="inline-flex items-center gap-1 font-bold text-accent-foreground">
                <Heart className="h-3.5 w-3.5" />
                {lives}/3
              </p>
            </div>
            <div className="rounded-xl border border-border/70 bg-white px-2 py-1">
              <p className="text-muted-foreground">Pontos</p>
              <p className="inline-flex items-center gap-1 font-bold text-secondary">
                <Trophy className="h-3.5 w-3.5" />
                {scorePoints}
              </p>
            </div>
          </div>
          {done ? (
            <div className="space-y-3 rounded-2xl border border-border bg-white/90 p-4 text-sm">
              <p className="text-base font-bold">Sessão concluída</p>
              <p>
                Você acertou <strong>{correctCount}</strong> de <strong>{questions.length}</strong> questões.
              </p>
              <p>Melhor combo: {bestCombo}</p>
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
                      className={`rounded-2xl border px-4 py-3 text-left text-base font-bold transition-transform ${tone} ${selected === null ? "hover:scale-[1.01]" : ""}`}
                      onClick={() => onSelect(option)}
                      disabled={selected !== null}
                    >
                      <span className="inline-flex items-center gap-2">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border bg-muted text-xs font-extrabold text-muted-foreground">
                          {String.fromCharCode(65 + (current?.options.indexOf(option) ?? 0))}
                        </span>
                        {option}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="rounded-xl border border-border bg-white/90 p-3 text-sm">
                {selected !== null && selected === current?.correct ? (
                  <p className="font-semibold text-secondary inline-flex items-center gap-2">
                    <Gauge className="h-4 w-4" />
                    {feedback}
                  </p>
                ) : selected !== null ? (
                  <p className="font-semibold text-foreground">{feedback}</p>
                ) : (
                  <p className="text-muted-foreground">{feedback}</p>
                )}
              </div>
              <Button className="w-full" onClick={onNext} disabled={selected === null || submitting}>
                {lives <= 0 ? "Ver resultado" : index < questions.length - 1 ? "Próxima questão" : "Concluir"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
      <ChildBottomNav />
    </PageShell>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Brain, Sparkles, Target, Zap } from "lucide-react";

import { ChildBottomNav } from "@/components/child-bottom-nav";
import { ChildDesktopShell } from "@/components/child-desktop-shell";
import { ConfettiBurst } from "@/components/confetti-burst";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  finishGameEngineSession,
  registerGameSession,
  submitGameEngineAnswer,
  type UserUXSettings,
  type GameSessionRegisterResponse,
} from "@/lib/api/client";
import { UX_SETTINGS_FALLBACK, fetchUXSettings, hapticCompletion, hapticPress, playSfx } from "@/lib/ux-feedback";
import { cn } from "@/lib/utils";

type Pair = { id: string; left: string; right: string };
type Side = "left" | "right";
type CardItem = { id: string; pairId: string; side: Side; text: string };

const PAIRS: Pair[] = [
  { id: "brasilia", left: "Brasília", right: "Distrito Federal" },
  { id: "salvador", left: "Salvador", right: "Bahia" },
  { id: "fortaleza", left: "Fortaleza", right: "Ceará" },
  { id: "manaus", left: "Manaus", right: "Amazonas" },
  { id: "curitiba", left: "Curitiba", right: "Paraná" },
  { id: "recife", left: "Recife", right: "Pernambuco" },
];

const TEMPLATE_TITLE_MAP: Record<string, string> = {
  "7ed50523-7a97-4d65-a687-d2f878f2c199": "Mapa de Capitais",
};

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildDeck(): CardItem[] {
  const cards = PAIRS.flatMap((pair) => [
    { id: `${pair.id}-left`, pairId: pair.id, side: "left" as const, text: pair.left },
    { id: `${pair.id}-right`, pairId: pair.id, side: "right" as const, text: pair.right },
  ]);
  return shuffle(cards);
}

export default function MemoryGamePage() {
  const [deck, setDeck] = useState<CardItem[]>([]);
  const [flipped, setFlipped] = useState<string[]>([]);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [moves, setMoves] = useState(0);
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [title, setTitle] = useState("Mapa de Capitais");
  const [reward, setReward] = useState<GameSessionRegisterResponse | null>(null);
  const [finished, setFinished] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uxSettings, setUxSettings] = useState<UserUXSettings>(UX_SETTINGS_FALLBACK);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [feedback, setFeedback] = useState("Vire duas cartas e encontre os pares.");
  const [confettiTrigger, setConfettiTrigger] = useState(0);

  useEffect(() => {
    setDeck(buildDeck());
    try {
      const params = new URLSearchParams(window.location.search);
      const templateIdFromQuery = params.get("templateId");
      const raw = localStorage.getItem("axiora_active_game_engine_session");
      if (!raw) return;
      const parsed = JSON.parse(raw) as { sessionId?: string; href?: string; title?: string; templateId?: string | null };
      if (parsed.href === "/child/games/memory") {
        if (parsed.sessionId) setSessionId(parsed.sessionId);
        if (parsed.title) setTitle(parsed.title);
        if (templateIdFromQuery && TEMPLATE_TITLE_MAP[templateIdFromQuery]) {
          setTitle(TEMPLATE_TITLE_MAP[templateIdFromQuery]);
        } else if (parsed.templateId && TEMPLATE_TITLE_MAP[parsed.templateId]) {
          setTitle(TEMPLATE_TITLE_MAP[parsed.templateId]);
        }
      }
    } catch {
      // ignore malformed storage
    }
    void fetchUXSettings().then(setUxSettings).catch(() => setUxSettings(UX_SETTINGS_FALLBACK));
  }, []);

  const donePairs = matched.size;
  const totalPairs = PAIRS.length;
  const progress = Math.round((donePairs / totalPairs) * 100);

  async function onCardClick(card: CardItem) {
    if (busy || submitting || finished) return;
    if (matched.has(card.pairId)) return;
    if (flipped.includes(card.id)) return;
    if (flipped.length === 2) return;
    const next = [...flipped, card.id];
    setFlipped(next);
    if (next.length < 2) return;
    setMoves((prev) => prev + 1);
    const first = deck.find((item) => item.id === next[0]);
    const second = deck.find((item) => item.id === next[1]);
    if (!first || !second) return;
    const isMatch = first.pairId === second.pairId && first.side !== second.side;
    if (sessionId) {
      void submitGameEngineAnswer(sessionId, {
        stepId: `move-${moves + 1}`,
        answer: { first: first.text, second: second.text, isCorrect: isMatch },
        elapsedMs: 2500,
      }).catch(() => undefined);
    }
    if (isMatch) {
      hapticPress(uxSettings);
      playSfx("/sfx/node-pop.ogg", uxSettings.soundEnabled);
      setStreak((prev) => {
        const next = prev + 1;
        setBestStreak((best) => Math.max(best, next));
        if (next >= 3) {
          playSfx("/sfx/unlock-sparkle.ogg", uxSettings.soundEnabled);
        }
        return next;
      });
      setFeedback("Par encontrado! Continue nessa sequência.");
      setMatched((prev) => new Set(prev).add(first.pairId));
      setFlipped([]);
      return;
    }
    hapticPress(uxSettings);
    setStreak(0);
    setFeedback("Quase! Tente lembrar a posição dessas cartas.");
    setBusy(true);
    setTimeout(() => {
      setFlipped([]);
      setBusy(false);
    }, 650);
  }

  useEffect(() => {
    if (finished) return;
    if (matched.size !== totalPairs) return;
    void (async () => {
      setSubmitting(true);
      try {
        if (sessionId) {
          void finishGameEngineSession(sessionId).catch(() => undefined);
        }
        const baseScore = Math.max(55, 100 - moves * 4);
        const response = await registerGameSession({
          gameType: "WORDSEARCH",
          score: baseScore,
        });
        setReward(response);
      } catch {
        setReward(null);
      } finally {
        playSfx("/sfx/completion-chime.ogg", uxSettings.soundEnabled);
        hapticCompletion(uxSettings);
        setConfettiTrigger((prev) => prev + 1);
        setFeedback("Parabéns! Você completou o desafio de memória.");
        setFinished(true);
        setSubmitting(false);
      }
    })();
  }, [finished, matched.size, moves, sessionId, totalPairs, uxSettings]);

  function restart() {
    setDeck(buildDeck());
    setFlipped([]);
    setMatched(new Set());
    setMoves(0);
    setBusy(false);
    setReward(null);
    setFinished(false);
    setStreak(0);
    setBestStreak(0);
    setFeedback("Vire duas cartas e encontre os pares.");
  }

  const helperText = useMemo(() => {
    if (finished) return "Parabéns! Você concluiu o mapa de capitais.";
    if (flipped.length < 2) return feedback;
    return "Comparando cartas...";
  }, [finished, flipped.length, feedback]);

  return (
    <ChildDesktopShell activeNav="jogos">
      <PageShell tone="child" width="compact">
      <ConfettiBurst trigger={confettiTrigger} />
      <Card className="mb-3">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <Link href="/child/games" className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-semibold">
              <ArrowLeft className="h-4 w-4" />
              Voltar aos jogos
            </Link>
            <span className="rounded-full border border-secondary/30 bg-secondary/10 px-2 py-1 text-xs font-semibold text-secondary">{progress}%</span>
          </div>
          <CardTitle className="mt-2 text-lg inline-flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-2 rounded-2xl border border-border bg-white/85 p-2 text-xs">
            <div className="rounded-xl border border-border/70 bg-white px-2 py-1">
              <p className="text-muted-foreground">Pares</p>
              <p className="inline-flex items-center gap-1 font-bold text-primary">
                <Target className="h-3.5 w-3.5" />
                {donePairs}/{totalPairs}
              </p>
            </div>
            <div className="rounded-xl border border-border/70 bg-white px-2 py-1">
              <p className="text-muted-foreground">Sequência</p>
              <p className={cn("inline-flex items-center gap-1 font-bold", streak >= 2 ? "text-secondary" : "text-foreground")}>
                <Zap className="h-3.5 w-3.5" />
                x{Math.max(1, streak)}
              </p>
            </div>
            <div className="rounded-xl border border-border/70 bg-white px-2 py-1">
              <p className="text-muted-foreground">Mov.</p>
              <p className="font-bold text-accent-foreground">{moves}</p>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-white/85 px-3 py-2 text-sm text-muted-foreground">{helperText}</div>
          <div className="grid grid-cols-2 gap-2">
            {deck.map((card) => {
              const isMatched = matched.has(card.pairId);
              const isFlipped = flipped.includes(card.id);
              const revealed = isMatched || isFlipped;
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => void onCardClick(card)}
                  disabled={isMatched || busy || submitting || finished}
                  className={cn(
                    "h-16 rounded-2xl border px-2 text-center text-xs font-semibold transition-transform duration-200",
                    revealed ? "border-secondary/40 bg-secondary/10 text-foreground scale-[1.01]" : "border-border bg-white text-muted-foreground hover:scale-[1.01]",
                    isMatched ? "ring-2 ring-secondary/30 shadow-[0_0_0_2px_rgba(45,179,166,0.15)]" : "",
                  )}
                >
                  {revealed ? card.text : "?"}
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border bg-white/90 p-3 text-sm">
            <span>Pares: {donePairs}/{totalPairs}</span>
            <span>Movimentos: {moves} • Melhor sequência: {bestStreak}</span>
          </div>
          {finished ? (
            <div className="space-y-2 rounded-xl border border-border bg-white/90 p-3 text-sm">
              <p className="inline-flex items-center gap-2 font-semibold text-secondary">
                <Sparkles className="h-4 w-4" />
                Sessão concluída!
              </p>
              <p>XP aplicado: {reward?.dailyLimit.grantedXp ?? 0}</p>
              <p>Moedas: {reward?.session.coinsEarned ?? 0}</p>
              <Button className="w-full" onClick={restart}>
                Jogar novamente
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
        <ChildBottomNav />
      </PageShell>
    </ChildDesktopShell>
  );
}

"use client";

import type { ComponentType } from "react";
import { useEffect, useState } from "react";
import { Clock3, Flame, Play, ShieldCheck, Sparkles, Trophy, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { GameOnboardingConfig } from "@/lib/games/onboarding";
import { describePersonalBest } from "@/lib/games/onboarding";
import type { AxioraGameId } from "@/lib/games/result-contract";

type OnboardingGame = {
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  meta: {
    gameId: AxioraGameId | null;
    skillLabel: string;
    ageBand: string;
    durationLabel: string;
    playStyle: string;
    whyItMatters: string;
  };
  personalBest: {
    bestScore: number | null;
    bestStreak: number | null;
    bestDurationSeconds: number | null;
  } | null;
};

type GameOnboardingModalProps = {
  open: boolean;
  game: OnboardingGame | null;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (config: GameOnboardingConfig) => void;
};

function QuizConfig({
  value,
  onChange,
}: {
  value: NonNullable<GameOnboardingConfig["quiz"]>;
  onChange: (next: NonNullable<GameOnboardingConfig["quiz"]>) => void;
}) {
  return (
    <div className="grid gap-2 rounded-2xl border border-[#cce0f1] bg-white/92 p-3">
      <p className="text-[11px] font-black uppercase tracking-[0.08em] text-[#62819f]">Configuração rápida</p>
      <div className="flex flex-wrap gap-2">
        {[5, 8, 10].map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onChange({ ...value, questionCount: q as 5 | 8 | 10 })}
            className={`rounded-full border px-3 py-1 text-xs font-black ${
              value.questionCount === q ? "border-[#2fc5ad] bg-[#e7fbf6] text-[#0f8d78]" : "border-[#d2dfef] bg-white text-[#567591]"
            }`}
          >
            {q} questões
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {[
          { id: "easy", label: "Ritmo leve" },
          { id: "medium", label: "Ritmo normal" },
          { id: "hard", label: "Ritmo rápido" },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange({ ...value, tempo: item.id as NonNullable<GameOnboardingConfig["quiz"]>["tempo"] })}
            className={`rounded-full border px-3 py-1 text-xs font-black ${
              value.tempo === item.id ? "border-[#2fc5ad] bg-[#e7fbf6] text-[#0f8d78]" : "border-[#d2dfef] bg-white text-[#567591]"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function TicTacToeConfig({
  value,
  onChange,
}: {
  value: NonNullable<GameOnboardingConfig["tictactoe"]>;
  onChange: (next: NonNullable<GameOnboardingConfig["tictactoe"]>) => void;
}) {
  return (
    <div className="grid gap-2 rounded-2xl border border-[#cce0f1] bg-white/92 p-3">
      <p className="text-[11px] font-black uppercase tracking-[0.08em] text-[#62819f]">Configuração rápida</p>
      <div className="flex flex-wrap gap-2">
        {[
          { id: "EASY", label: "Fácil" },
          { id: "MEDIUM", label: "Médio" },
          { id: "HARD", label: "Difícil" },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange({ soloDifficulty: item.id as NonNullable<GameOnboardingConfig["tictactoe"]>["soloDifficulty"] })}
            className={`rounded-full border px-3 py-1 text-xs font-black ${
              value.soloDifficulty === item.id ? "border-[#2fc5ad] bg-[#e7fbf6] text-[#0f8d78]" : "border-[#d2dfef] bg-white text-[#567591]"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function TugConfig({
  value,
  onChange,
}: {
  value: NonNullable<GameOnboardingConfig["tug-of-war"]>;
  onChange: (next: NonNullable<GameOnboardingConfig["tug-of-war"]>) => void;
}) {
  return (
    <div className="grid gap-2 rounded-2xl border border-[#cce0f1] bg-white/92 p-3">
      <p className="text-[11px] font-black uppercase tracking-[0.08em] text-[#62819f]">Configuração rápida</p>
      <div className="flex flex-wrap gap-2">
        {[
          { id: "cpu", label: "Solo vs CPU" },
          { id: "pvp", label: "PvP local" },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange({ ...value, mode: item.id as "cpu" | "pvp" })}
            className={`rounded-full border px-3 py-1 text-xs font-black ${
              value.mode === item.id ? "border-[#2fc5ad] bg-[#e7fbf6] text-[#0f8d78]" : "border-[#d2dfef] bg-white text-[#567591]"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {[1, 2, 3].map((difficulty) => (
          <button
            key={difficulty}
            type="button"
            onClick={() => onChange({ ...value, difficulty: difficulty as 1 | 2 | 3 })}
            className={`rounded-full border px-3 py-1 text-xs font-black ${
              value.difficulty === difficulty ? "border-[#2fc5ad] bg-[#e7fbf6] text-[#0f8d78]" : "border-[#d2dfef] bg-white text-[#567591]"
            }`}
          >
            Dificuldade {difficulty}
          </button>
        ))}
      </div>
    </div>
  );
}

export function GameOnboardingModal({ open, game, loading = false, onClose, onConfirm }: GameOnboardingModalProps) {
  const [config, setConfig] = useState<GameOnboardingConfig>({
    quiz: { questionCount: 8, tempo: "medium" },
    tictactoe: { soloDifficulty: "MEDIUM" },
    "tug-of-war": { mode: "cpu", difficulty: 2 },
  });

  useEffect(() => {
    if (!open) return;
    setConfig({
      quiz: { questionCount: 8, tempo: "medium" },
      tictactoe: { soloDifficulty: "MEDIUM" },
      "tug-of-war": { mode: "cpu", difficulty: 2 },
    });
  }, [open, game?.title]);

  if (!open || !game) return null;
  const Icon = game.icon;
  const best = describePersonalBest(game.personalBest);
  const hasConfig =
    game.meta.gameId === "quiz" || game.meta.gameId === "tictactoe" || game.meta.gameId === "tug-of-war";

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[#06101acc]/85 p-0 sm:items-center sm:p-4">
      <article className="w-full max-w-2xl rounded-t-[28px] border border-[#c6d9ea]/70 bg-[linear-gradient(155deg,rgba(255,255,255,0.97)_0%,rgba(241,249,255,0.95)_56%,rgba(231,255,248,0.93)_100%)] p-4 shadow-[0_24px_60px_rgba(7,22,40,0.45)] sm:rounded-[28px] sm:p-5">
        <header className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#c8def0] bg-white shadow-[0_3px_0_rgba(178,198,221,0.7)]">
              <Icon className="h-5 w-5 text-primary" />
            </span>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.08em] text-[#5f7f9f]">Preparar partida</p>
              <h2 className="text-xl font-black text-[#173a55]">{game.title}</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#cddbeb] bg-white text-[#4d6b89]"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="mt-3 grid gap-3">
          <section className="rounded-2xl border border-[#cce0f1] bg-white/92 p-3">
            <p className="text-[11px] font-black uppercase tracking-[0.08em] text-[#62819f]">O que você vai treinar</p>
            <p className="mt-1 text-sm font-semibold text-[#305a79]">{game.description}</p>
            <p className="mt-1 text-xs text-[#567896]">{game.meta.whyItMatters}</p>
          </section>

          <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <article className="rounded-xl border border-[#d4e3f2] bg-white/92 p-2.5">
              <p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#6887a6]">Duração</p>
              <p className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-[#264d6b]">
                <Clock3 className="h-3.5 w-3.5" />
                {game.meta.durationLabel}
              </p>
            </article>
            <article className="rounded-xl border border-[#d4e3f2] bg-white/92 p-2.5">
              <p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#6887a6]">Habilidade</p>
              <p className="mt-1 text-xs font-bold text-[#264d6b]">{game.meta.skillLabel}</p>
            </article>
            <article className="rounded-xl border border-[#d4e3f2] bg-white/92 p-2.5">
              <p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#6887a6]">Idade sugerida</p>
              <p className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-[#264d6b]">
                <ShieldCheck className="h-3.5 w-3.5" />
                {game.meta.ageBand}
              </p>
            </article>
            <article className="rounded-xl border border-[#d4e3f2] bg-white/92 p-2.5">
              <p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#6887a6]">Estilo</p>
              <p className="mt-1 text-xs font-bold text-[#264d6b]">{game.meta.playStyle}</p>
            </article>
          </section>

          <section className="rounded-2xl border border-[#f0d9b4] bg-[linear-gradient(145deg,rgba(255,253,247,0.97)_0%,rgba(255,246,227,0.96)_100%)] p-3">
            <p className="text-[11px] font-black uppercase tracking-[0.08em] text-[#89602a]">Seu melhor resultado</p>
            {best ? (
              <p className="mt-1 inline-flex items-center gap-1 text-sm font-black text-[#6d4a1b]">
                <Trophy className="h-4 w-4 text-[#d38a2f]" />
                {best.title}: {best.value}
              </p>
            ) : (
              <p className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-[#7a5a2d]">
                <Flame className="h-4 w-4 text-[#d38a2f]" />
                Seu primeiro desafio neste jogo.
              </p>
            )}
          </section>

          {game.meta.gameId === "quiz" && config.quiz ? <QuizConfig value={config.quiz} onChange={(next) => setConfig((prev) => ({ ...prev, quiz: next }))} /> : null}
          {game.meta.gameId === "tictactoe" && config.tictactoe ? <TicTacToeConfig value={config.tictactoe} onChange={(next) => setConfig((prev) => ({ ...prev, tictactoe: next }))} /> : null}
          {game.meta.gameId === "tug-of-war" && config["tug-of-war"] ? (
            <TugConfig value={config["tug-of-war"]} onChange={(next) => setConfig((prev) => ({ ...prev, "tug-of-war": next }))} />
          ) : null}

          {!hasConfig ? (
            <p className="rounded-2xl border border-[#d4e3f2] bg-white/92 px-3 py-2 text-xs font-semibold text-[#567896]">
              Este jogo abre direto. Toque em jogar e comece sua prática.
            </p>
          ) : null}
        </div>

        <footer className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" className="border-[#c1d5e8] bg-white text-[#385b79]" onClick={onClose}>
            Voltar ao hub
          </Button>
          <Button onClick={() => onConfirm(config)} disabled={loading}>
            <Play className="h-4 w-4" />
            Jogar agora
            <Sparkles className="h-4 w-4" />
          </Button>
        </footer>
      </article>
    </div>
  );
}

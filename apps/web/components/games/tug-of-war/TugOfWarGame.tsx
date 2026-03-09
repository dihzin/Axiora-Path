"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { ChildBottomNav } from "@/components/child-bottom-nav";
import { ChildDesktopShell } from "@/components/child-desktop-shell";
import { PageShell } from "@/components/layout/page-shell";

import { GameScene } from "./GameScene";
import { Numpad } from "./Numpad";
import { ProgressBar } from "./ProgressBar";
import { QuestionCard } from "./QuestionCard";
import { ReactionMeter } from "./ReactionMeter";
import { VictoryModal } from "./VictoryModal";
import { useTugOfWarEngine } from "./useTugOfWarEngine";

export function TugOfWarGame() {
  const router = useRouter();
  const {
    redX,
    blueX,
    ropePos,
    p1Anim,
    p2Anim,
    p1Streak,
    p2Streak,
    question,
    answer,
    p1Answer,
    p2Answer,
    mode,
    winner,
    difficulty,
    roundResolved,
    feedback,
    lastEvent,
    lastRoundResult,
    stats,
    matchAnalytics,
    isCpuThinking,
    appendDigit,
    deleteDigit,
    submitAnswer,
    setMode,
    setDifficulty,
    resetGame,
    constants,
  } = useTugOfWarEngine();

  const inputDisabled = winner !== null || roundResolved;

  return (
    <ChildDesktopShell activeNav="jogos">
      <PageShell tone="child" width="content" className="pb-24">
        <div className="mb-3">
          <Link
            href="/child/games"
            className="inline-flex min-h-[42px] items-center rounded-full border border-[#c9d8ef] bg-white px-3 py-1.5 text-sm font-black text-[#4a5e7d] shadow-[0_2px_0_rgba(184,200,239,0.85)]"
          >
            Voltar aos jogos
          </Link>
        </div>

        <section className="rounded-[24px] border-[3px] border-[#1f2937] bg-[linear-gradient(140deg,#ffffff_0%,#f5fbff_100%)] p-4 shadow-[0_14px_30px_rgba(26,45,74,0.14)]">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-xl font-black text-[#1f2937]">Cabo de Guerra</h1>
            <span className="rounded-full bg-[#fef3c7] px-3 py-1 text-xs font-black text-[#92400e]">Duelo Matematico</span>
          </div>

          <div className="mb-3 grid gap-2 sm:grid-cols-2">
            <div className="rounded-2xl border-2 border-[#d7e4f7] bg-white p-2">
              <p className="mb-2 text-xs font-black uppercase text-[#64748b]">Modo</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMode("cpu")}
                  className={`rounded-xl px-3 py-2 text-xs font-black transition ${
                    mode === "cpu" ? "border-2 border-[#0f766e] bg-[#99f6e4] text-[#115e59]" : "border-2 border-[#d1d9ea] bg-white text-[#475569]"
                  }`}
                >
                  1P vs CPU
                </button>
                <button
                  type="button"
                  onClick={() => setMode("pvp")}
                  className={`rounded-xl px-3 py-2 text-xs font-black transition ${
                    mode === "pvp" ? "border-2 border-[#0f766e] bg-[#99f6e4] text-[#115e59]" : "border-2 border-[#d1d9ea] bg-white text-[#475569]"
                  }`}
                >
                  PvP Local
                </button>
              </div>
            </div>

            <div className="rounded-2xl border-2 border-[#d7e4f7] bg-white p-2">
              <p className="mb-2 text-xs font-black uppercase text-[#64748b]">Dificuldade</p>
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3].map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setDifficulty(level)}
                    className={`rounded-xl px-2 py-2 text-xs font-black ${
                      difficulty === level ? "border-2 border-[#1d4ed8] bg-[#dbeafe] text-[#1e3a8a]" : "border-2 border-[#d1d9ea] bg-white text-[#475569]"
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <ProgressBar ropePos={ropePos} />

          <div className="mt-3 rounded-2xl border-2 border-[#d4e3f7] bg-white p-2 text-xs font-black text-[#334155]">
            <div className="flex items-center justify-between">
              <span>Vermelho X: {redX}</span>
              <span>Azul X: {blueX}</span>
              <span>Corda: {ropePos.toFixed(2)}</span>
            </div>
          </div>

          <div className="mt-3">
            <GameScene
              redX={redX}
              blueX={blueX}
              ropePos={ropePos}
              p1Anim={p1Anim}
              p2Anim={p2Anim}
              p1Streak={p1Streak}
              p2Streak={p2Streak}
              winThreshold={constants.WIN_THRESHOLD}
              lastEvent={lastEvent}
              lastRoundResult={lastRoundResult}
              feedback={feedback}
            />
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {([
              { key: "red", title: "Vermelho", tone: "border-[#fecaca] text-[#991b1b] bg-[#fff1f2]" },
              { key: "blue", title: "Azul", tone: "border-[#bfdbfe] text-[#1e3a8a] bg-[#eff6ff]" },
            ] as const).map((side) => {
              const sideStats = stats[side.key];
              const fastest = Number.isFinite(sideStats.fastest) ? `${Math.round(sideStats.fastest)}ms` : "-";
              const average = sideStats.wins > 0 ? `${Math.round(sideStats.avgReaction)}ms` : "-";
              return (
                <div key={side.key} className={`rounded-2xl border-2 p-3 ${side.tone}`}>
                  <p className="text-xs font-black uppercase">{side.title}</p>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-[10px] font-black uppercase opacity-70">Fastest</p>
                      <p className="text-sm font-black">{fastest}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase opacity-70">Average</p>
                      <p className="text-sm font-black">{average}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase opacity-70">Round wins</p>
                      <p className="text-sm font-black">{sideStats.wins}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <QuestionCard questionText={question.text} answer={answer} mode={mode} isCpuThinking={isCpuThinking} />
          <ReactionMeter reactionMs={lastRoundResult?.reactionTime ?? null} />

          {mode === "pvp" ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border-2 border-[#fecaca] bg-white p-2">
                <p className="mb-1 text-center text-xs font-black uppercase text-[#b91c1c]">Vermelho</p>
                <p className="mb-2 text-center text-lg font-black text-[#7f1d1d]">{p1Answer || "_"}</p>
                <Numpad
                  disabled={inputDisabled}
                  onDigit={(digit) => appendDigit("p1", digit)}
                  onDelete={() => deleteDigit("p1")}
                  onConfirm={() => submitAnswer("p1")}
                />
              </div>
              <div className="rounded-2xl border-2 border-[#bfdbfe] bg-white p-2">
                <p className="mb-1 text-center text-xs font-black uppercase text-[#1d4ed8]">Azul</p>
                <p className="mb-2 text-center text-lg font-black text-[#1e3a8a]">{p2Answer || "_"}</p>
                <Numpad
                  disabled={inputDisabled}
                  onDigit={(digit) => appendDigit("p2", digit)}
                  onDelete={() => deleteDigit("p2")}
                  onConfirm={() => submitAnswer("p2")}
                />
              </div>
            </div>
          ) : (
            <Numpad
              disabled={inputDisabled || isCpuThinking}
              onDigit={(digit) => appendDigit("p1", digit)}
              onDelete={() => deleteDigit("p1")}
              onConfirm={() => submitAnswer("p1")}
            />
          )}

          <button
            type="button"
            onClick={() => resetGame(mode, difficulty)}
            className="mt-3 w-full rounded-2xl border-2 border-[#c7d5ee] bg-white px-4 py-2 text-sm font-black text-[#334155]"
          >
            Reiniciar partida
          </button>
        </section>

        <VictoryModal
          open={winner !== null}
          winner={winner}
          p1Streak={p1Streak}
          p2Streak={p2Streak}
          matchAnalytics={matchAnalytics}
          onPlayAgain={() => resetGame(mode, difficulty)}
          onBackToGames={() => router.push("/child/games")}
        />

        <ChildBottomNav />
      </PageShell>
    </ChildDesktopShell>
  );
}

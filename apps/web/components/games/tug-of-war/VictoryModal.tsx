"use client";

import type { MatchAnalytics } from "./useTugOfWarEngine";

type VictoryModalProps = {
  open: boolean;
  winner: "red" | "blue" | null;
  p1Streak: number;
  p2Streak: number;
  matchAnalytics: MatchAnalytics;
  onPlayAgain: () => void;
  onBackToGames: () => void;
};

export function VictoryModal({ open, winner, p1Streak, p2Streak, matchAnalytics, onPlayAgain, onBackToGames }: VictoryModalProps) {
  if (!open || !winner) return null;

  const winnerLabel = winner === "red" ? "Vermelho" : "Azul";
  const winnerTone = winner === "red" ? "text-[#b91c1c]" : "text-[#1d4ed8]";
  const fastest = matchAnalytics.fastestReaction === null ? "-" : `${Math.round(matchAnalytics.fastestReaction)}ms`;
  const slowest = matchAnalytics.slowestReaction === null ? "-" : `${Math.round(matchAnalytics.slowestReaction)}ms`;
  const average = matchAnalytics.averageReaction === null ? "-" : `${Math.round(matchAnalytics.averageReaction)}ms`;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-[24px] border-[3px] border-[#1f2937] bg-white p-6 shadow-[0_20px_40px_rgba(20,34,58,0.3)]">
        <p className="text-center text-5xl">🏆</p>
        <h2 className={`mt-2 text-center text-2xl font-black ${winnerTone}`}>{winnerLabel} venceu!</h2>

        <div className="mt-4 rounded-2xl border-2 border-[#dbe6f8] bg-[#f8fbff] p-3 text-sm font-bold text-[#334155]">
          <p>Maior sequência Vermelho: {p1Streak}</p>
          <p>Maior sequência Azul: {p2Streak}</p>
        </div>

        <div className="mt-3 rounded-2xl border-2 border-[#dbe6f8] bg-white p-3 text-sm font-bold text-[#334155]">
          <p className="mb-1 text-xs font-black uppercase text-[#64748b]">Match analytics</p>
          <p>Rounds: {matchAnalytics.totalRounds}</p>
          <p>Fastest reaction: {fastest}</p>
          <p>Slowest reaction: {slowest}</p>
          <p>Average reaction: {average}</p>
          <p>Winner: {winnerLabel}</p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onPlayAgain}
            className="rounded-2xl border-2 border-[#16a34a] bg-[#86efac] px-3 py-2 text-sm font-black text-[#14532d]"
          >
            Play again
          </button>
          <button
            type="button"
            onClick={onBackToGames}
            className="rounded-2xl border-2 border-[#c7d5ee] bg-white px-3 py-2 text-sm font-black text-[#334155]"
          >
            Back to games
          </button>
        </div>
      </div>
    </div>
  );
}

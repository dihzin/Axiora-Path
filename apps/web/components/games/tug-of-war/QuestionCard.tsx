"use client";

import type { GameMode } from "./useTugOfWarEngine";

type QuestionCardProps = {
  questionText: string;
  answer: string;
  mode: GameMode;
  isCpuThinking: boolean;
};

export function QuestionCard({ questionText, answer, mode, isCpuThinking }: QuestionCardProps) {
  const roundLabel = "Quem responder primeiro puxa!";

  return (
    <section className="mt-4 rounded-[20px] border-[3px] border-[#222] bg-white p-4 shadow-[0_10px_22px_rgba(32,49,74,0.15)]">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-black uppercase tracking-wide text-[#4a5e7d]">Desafio</p>
        <span className="rounded-full bg-[#ecfeff] px-3 py-1 text-xs font-black text-[#0f766e]">{roundLabel}</span>
      </div>

      <p className="text-center text-[34px] font-black leading-none text-[#111827]">{questionText}</p>

      <p className="mt-2 text-center text-lg font-black text-[#4b5563]">Resposta: {answer || "_"}</p>

      {mode === "cpu" && isCpuThinking ? (
        <p className="mt-2 text-center text-sm font-bold text-[#0f766e]">🤖 calculando...</p>
      ) : null}
    </section>
  );
}

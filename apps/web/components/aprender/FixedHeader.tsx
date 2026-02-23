"use client";

import Image from "next/image";
import { BookOpen, Coins, Flame, Star } from "lucide-react";

type FixedHeaderProps = {
  streak: number;
  coins: number;
  progress: number;
  subjectName?: string;
  onSubjectPress?: () => void;
};

export function FixedHeader({ streak, coins, progress, subjectName = "Matéria", onSubjectPress }: FixedHeaderProps) {
  return (
    <header className="flex h-full items-center px-3" aria-label="Resumo da trilha">
      <div className="flex w-full items-center justify-between rounded-2xl border border-[#D2DDEB] bg-white px-2 py-2 shadow-[var(--path-shadow-1)]">
        <div className="flex items-center gap-1.5" aria-label="Métricas">
          <span
            className="inline-flex h-9 items-center gap-1 rounded-full border border-[#D6E2F1] bg-[#FAFCFF] px-2.5 text-sm font-black text-[color:var(--path-ink)]"
            aria-label={`Sequência ${streak}`}
          >
            <Flame className="h-3.5 w-3.5 text-[#F08744]" aria-hidden />
            {streak}
          </span>
          <span
            className="inline-flex h-9 items-center gap-1 rounded-full border border-[#D6E2F1] bg-[#FAFCFF] px-2.5 text-sm font-black text-[color:var(--path-ink)]"
            aria-label={`Moedas ${coins}`}
          >
            <Coins className="h-3.5 w-3.5 text-[#22B8A2]" aria-hidden />
            {coins}
          </span>
          <span
            className="inline-flex h-9 items-center gap-1 rounded-full border border-[#BFD9F7] bg-[#F0F8FF] px-2.5 text-sm font-black text-[#21528A]"
            aria-label={`Progresso ${progress}%`}
          >
            <Star className="h-3.5 w-3.5 text-[#1C9CEB]" aria-hidden />
            {progress}%
          </span>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-[#DCE6F3] bg-[#F9FBFF] p-1" aria-label="Ações">
          <span className="sr-only">Ações</span>
        <button
          type="button"
          onClick={onSubjectPress}
          aria-label={`Trocar matéria. Atual: ${subjectName}`}
          title="Trocar matéria"
          disabled={!onSubjectPress}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#BFD5EE] bg-[#EDF6FF] text-[#2E5A8F] transition-colors duration-150 hover:bg-[#E7F1FE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FB2E8] disabled:opacity-50 disabled:hover:bg-[#EDF6FF]"
        >
          <BookOpen className="h-4 w-4" aria-hidden />
        </button>
          <span className="flex items-center justify-end">
            <span className="inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-[#D2DDEB] bg-[#F3F7FD]" aria-label="Avatar">
            <Image src="/icons/axion.svg" alt="Axion" width={24} height={24} className="h-6 w-6 object-contain" />
            </span>
          </span>
        </div>
      </div>
    </header>
  );
}

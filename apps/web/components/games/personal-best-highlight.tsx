import { ArrowRight, Medal, Trophy } from "lucide-react";

import { Button } from "@/components/ui/button";

type PersonalBestHighlightProps = {
  recordsCount: number;
  bestGameLabel: string | null;
  bestScoreLabel: string | null;
  recentRecordLabel: string | null;
  replayLabel: string;
  onReplay: () => void;
  disabled?: boolean;
};

export function PersonalBestHighlight({
  recordsCount,
  bestGameLabel,
  bestScoreLabel,
  recentRecordLabel,
  replayLabel,
  onReplay,
  disabled = false,
}: PersonalBestHighlightProps) {
  return (
    <section className="rounded-[24px] border border-[#DACAA7]/50 bg-[linear-gradient(140deg,rgba(255,255,255,0.97)_0%,rgba(255,246,232,0.95)_56%,rgba(255,239,214,0.95)_100%)] p-4 shadow-[0_12px_30px_rgba(59,44,23,0.13)] sm:p-5">
      <header className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.09em] text-[#8F6730]">Destaque de recordes</p>
          <h2 className="mt-1 text-lg font-black text-[#5E3E13]">Seus melhores resultados</h2>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-[#F0D6AA] bg-[#FFF4DE] px-2.5 py-1 text-xs font-black text-[#8C5E22]">
          <Trophy className="h-3.5 w-3.5" />
          {recordsCount}
        </span>
      </header>

      <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <article className="rounded-2xl border border-[#F0DDBE] bg-white/90 p-3">
          <p className="text-[11px] font-black uppercase tracking-[0.08em] text-[#8A6737]">Melhor jogo</p>
          <p className="mt-1 text-sm font-bold text-[#5D4319]">{bestGameLabel ?? "Continue jogando para desbloquear recordes"}</p>
          {bestScoreLabel ? <p className="mt-1 text-xs font-semibold text-[#8A6A3D]">{bestScoreLabel}</p> : null}
        </article>
        <article className="rounded-2xl border border-[#F0DDBE] bg-white/90 p-3">
          <p className="text-[11px] font-black uppercase tracking-[0.08em] text-[#8A6737]">Recorde recente</p>
          <p className="mt-1 text-sm font-bold text-[#5D4319]">{recentRecordLabel ?? "Seu próximo replay pode virar recorde"}</p>
          <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[#8A6A3D]">
            <Medal className="h-3.5 w-3.5" />
            Pratique e supere sua marca
          </p>
        </article>
      </div>

      <Button className="mt-4 w-full sm:w-auto" onClick={onReplay} disabled={disabled}>
        {replayLabel}
        <ArrowRight className="h-4 w-4" />
      </Button>
    </section>
  );
}


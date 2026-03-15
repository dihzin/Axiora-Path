import { Crown, Medal, Trophy } from "lucide-react";

import type { GamePersonalRankingResponse, GameWeeklyRankingResponse } from "@/lib/api/client";

type GamesRankingCardProps = {
  weekly: GameWeeklyRankingResponse | null;
  personal: GamePersonalRankingResponse | null;
};

function formatScore(value: number | null | undefined, unit: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  const rounded = unit === "s" ? Number(value.toFixed(1)) : Math.round(value);
  return unit ? `${rounded}${unit}` : String(rounded);
}

export function GamesRankingCard({ weekly, personal }: GamesRankingCardProps) {
  const top = weekly?.top.slice(0, 3) ?? [];
  const me = weekly?.me ?? null;

  return (
    <article className="rounded-[24px] border border-white/14 bg-[linear-gradient(160deg,rgba(15,40,62,0.92)_0%,rgba(11,31,50,0.9)_100%)] p-4 shadow-[0_12px_26px_rgba(3,10,22,0.32)] sm:p-5">
      <header className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.08em] text-[#8DB7D9]">Ranking da semana</p>
          <p className="mt-1 text-sm font-semibold text-[#EAF4FF]">{weekly ? weekly.metric.label : "Pontuação"}</p>
        </div>
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-2xl border border-[#FFD38E]/40 bg-[#4F3A1A]/65 text-[#FFDFA8]">
          <Crown className="h-4 w-4" />
        </span>
      </header>

      <div className="mt-3 space-y-2">
        {top.length > 0 ? (
          top.map((entry) => (
            <div key={`${entry.player}-${entry.position}`} className="flex items-center justify-between rounded-2xl border border-white/12 bg-[#113652]/68 px-3 py-2">
              <p className="text-xs font-bold text-[#DDEBFA]">
                #{entry.position} {entry.player}
              </p>
              <p className="text-xs font-black text-[#95FFDF]">{formatScore(entry.score, weekly?.metric.unit ?? "")}</p>
            </div>
          ))
        ) : (
          <p className="rounded-2xl border border-white/12 bg-[#113652]/68 px-3 py-2 text-xs font-semibold text-[#B7CDE2]">
            Ainda sem ranking nesta semana.
          </p>
        )}
      </div>

      <div className="mt-3 rounded-2xl border border-[#7DE8C6]/28 bg-[#103F4F]/72 p-3">
        <p className="text-[11px] font-black uppercase tracking-wide text-[#90FADD]">Sua posição</p>
        <p className="mt-1 text-sm font-bold text-[#E9FFF8]">
          {me?.position ? `#${me.position}` : "Sem posição ainda"}{" "}
          {me?.totalPlayers ? `de ${me.totalPlayers}` : ""}
        </p>
      </div>

      {personal && personal.items.length > 0 ? (
        <div className="mt-4 space-y-2">
          <p className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-wide text-[#A7C6E2]">
            <Trophy className="h-3.5 w-3.5 text-[#F6BE55]" />
            Seus melhores jogos
          </p>
          {personal.items.slice(0, 3).map((item) => (
            <p key={item.gameId} className="inline-flex w-full items-center justify-between rounded-xl border border-white/12 bg-[#112F4A]/74 px-2.5 py-1.5 text-xs">
              <span className="inline-flex items-center gap-1 font-semibold text-[#DCEBFA]">
                <Medal className="h-3.5 w-3.5 text-[#FFCF78]" />
                {item.position}. {item.gameLabel}
              </span>
              <span className="font-black text-[#94FFDE]">{formatScore(item.score, item.unit)}</span>
            </p>
          ))}
        </div>
      ) : null}
    </article>
  );
}


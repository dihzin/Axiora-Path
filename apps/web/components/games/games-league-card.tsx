import { ArrowUp, Award, ShieldAlert, Sparkles } from "lucide-react";

import type { GameLeagueSummaryResponse } from "@/lib/api/client";
import { Button } from "@/components/ui/button";

type GamesLeagueCardProps = {
  league: GameLeagueSummaryResponse | null;
  claimLoading?: boolean;
  onClaim?: () => void;
  onPlayNow?: () => void;
};

function statusLabel(status: GameLeagueSummaryResponse["status"]): string {
  if (status === "promoted") return "Zona de promoção";
  if (status === "relegated") return "Zona de rebaixamento";
  return "Zona estável";
}

export function GamesLeagueCard({ league, claimLoading = false, onClaim, onPlayNow }: GamesLeagueCardProps) {
  if (!league) {
    return (
      <article className="rounded-[24px] border border-white/14 bg-[linear-gradient(160deg,rgba(15,40,62,0.92)_0%,rgba(11,31,50,0.9)_100%)] p-4 shadow-[0_12px_26px_rgba(3,10,22,0.32)] sm:p-5">
        <p className="text-xs font-black uppercase tracking-[0.08em] text-[#8DB7D9]">Sua liga desta semana</p>
        <p className="mt-2 text-sm font-semibold text-[#DDEBFA]">Carregando sua liga...</p>
      </article>
    );
  }

  return (
    <article className="rounded-[24px] border border-white/14 bg-[linear-gradient(160deg,rgba(15,40,62,0.92)_0%,rgba(11,31,50,0.9)_100%)] p-4 shadow-[0_12px_26px_rgba(3,10,22,0.32)] sm:p-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.08em] text-[#8DB7D9]">Sua liga desta semana</p>
          <h3 className="mt-1 text-lg font-black text-[#EAF4FF]">{league.tierLabel}</h3>
          <p className="text-xs font-semibold text-[#B6CCE2]">Grupo {league.groupId.toUpperCase()}</p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-[#9BD8C2]/30 bg-[#123D44]/70 px-2 py-1 text-[11px] font-black uppercase tracking-wide text-[#9DFFDD]">
          <Award className="h-3.5 w-3.5" />
          {statusLabel(league.status)}
        </span>
      </header>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-white/12 bg-[#113652]/68 px-3 py-2">
          <p className="text-[11px] font-black uppercase text-[#9DBCD6]">Posição</p>
          <p className="text-base font-black text-[#E9FFF8]">
            {league.position ? `#${league.position}` : "-"}
            <span className="ml-1 text-xs font-semibold text-[#AAC3D8]">/ {league.groupSize}</span>
          </p>
        </div>
        <div className="rounded-2xl border border-white/12 bg-[#113652]/68 px-3 py-2">
          <p className="text-[11px] font-black uppercase text-[#9DBCD6]">XP da liga</p>
          <p className="text-base font-black text-[#95FFDF]">{league.scoreWeek}</p>
        </div>
      </div>

      <p className="mt-3 text-xs font-semibold text-[#C7D9EA]">{league.motivationMessage}</p>
      {league.positionsToPromotion && league.positionsToPromotion > 0 ? (
        <p className="mt-2 inline-flex items-center gap-1 rounded-full border border-[#FFD38E]/40 bg-[#4F3A1A]/60 px-2.5 py-1 text-[11px] font-bold text-[#FFE2AA]">
          <ArrowUp className="h-3.5 w-3.5" />
          Faltam {league.positionsToPromotion} posições para promoção
        </p>
      ) : null}

      <div className="mt-3 space-y-1.5">
        {league.topEntries.slice(0, 3).map((entry) => (
          <p key={`${entry.position}-${entry.player}`} className="flex items-center justify-between rounded-xl border border-white/10 bg-[#112F4A]/74 px-2.5 py-1.5 text-xs">
            <span className="font-semibold text-[#DDEBFA]">
              #{entry.position} {entry.player}
            </span>
            <span className="font-black text-[#9BFFDF]">{entry.score} XP</span>
          </p>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {league.reward.readyToClaim ? (
          <Button
            onClick={onClaim}
            disabled={claimLoading}
            className="bg-[#FF8C42] text-white hover:bg-[#ff7c2a]"
          >
            <Sparkles className="h-4 w-4" />
            Resgatar recompensa
          </Button>
        ) : (
          <Button variant="outline" onClick={onPlayNow}>
            <ShieldAlert className="h-4 w-4" />
            Jogar para subir
          </Button>
        )}
        <div className="rounded-xl border border-white/12 bg-[#113652]/60 px-2.5 py-2 text-xs font-semibold text-[#D8E7F6]">
          Recompensa da liga: +{league.reward.rewardXp} XP · +{league.reward.rewardCoins} coins
        </div>
      </div>
    </article>
  );
}


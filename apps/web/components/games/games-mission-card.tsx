import { Coins, Flame, Gift, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";
import type { GameMetagameMission } from "@/lib/api/client";

type GamesMissionCardProps = {
  mission: GameMetagameMission;
  title: string;
  subtitle: string;
  actionLabel?: string;
  onPlayNow: () => void;
  onClaim: () => void;
  claimLoading?: boolean;
};

export function GamesMissionCard({
  mission,
  title,
  subtitle,
  actionLabel,
  onPlayNow,
  onClaim,
  claimLoading = false,
}: GamesMissionCardProps) {
  return (
    <article className="rounded-[24px] border border-white/14 bg-[linear-gradient(160deg,rgba(13,36,58,0.92)_0%,rgba(11,31,50,0.9)_54%,rgba(9,26,44,0.9)_100%)] p-4 shadow-[0_14px_30px_rgba(3,10,22,0.32)] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.09em] text-[#89B8D8]">{title}</p>
          <h3 className="mt-1 text-base font-black text-[#EAF4FF]">{subtitle}</h3>
          <p className="mt-1 text-sm font-semibold text-[#B6CCE2]">{mission.description}</p>
        </div>
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-[#7DE8C6]/36 bg-[#123F50]/82 text-[#96FFDE]">
          <Sparkles className="h-4 w-4" />
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 text-xs font-semibold">
        <span className="text-[#9FC0DA]">
          Progresso: {mission.current}/{mission.target}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-[#7DE8C6]/35 bg-[#103B4B]/82 px-2 py-0.5 font-black text-[#95FFDF]">
          <Flame className="h-3.5 w-3.5" />
          {Math.round(mission.progressPercent)}%
        </span>
      </div>
      <div className="mt-2">
        <ProgressBar value={mission.progressPercent} tone="secondary" />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1 rounded-full border border-[#7DE8C6]/35 bg-[#103E4E]/86 px-2.5 py-1 font-black text-[#95FFDF]">
          <Gift className="h-3.5 w-3.5" />+{mission.rewardXp} XP
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-[#FFD38E]/35 bg-[#4C391C]/58 px-2.5 py-1 font-black text-[#FFDFA9]">
          <Coins className="h-3.5 w-3.5" />+{mission.rewardCoins} coins
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {mission.rewardReady ? (
          <Button onClick={onClaim} disabled={claimLoading}>
            {claimLoading ? "Resgatando..." : "Resgatar recompensa"}
          </Button>
        ) : (
          <Button onClick={onPlayNow}>{actionLabel ?? mission.ctaLabel}</Button>
        )}
      </div>
    </article>
  );
}


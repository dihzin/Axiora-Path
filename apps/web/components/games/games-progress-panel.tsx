import { Coins, Flame, Gamepad2, Trophy } from "lucide-react";

import { ProgressBar } from "@/components/ui/progress-bar";

type GamesProgressPanelProps = {
  dailyXp: number;
  weeklyXp: number;
  weeklyGoal: number;
  totalSessions: number | null;
  xpTotal: number;
  coins: number;
  recordsCount: number;
  favoriteGame: string | null;
  recommendation: string;
};

function sessionsLabel(totalSessions: number | null): string {
  if (totalSessions === null) return "Ainda sem histórico local";
  if (totalSessions === 1) return "1 partida registrada";
  return `${totalSessions} partidas registradas`;
}

export function GamesProgressPanel({
  dailyXp,
  weeklyXp,
  weeklyGoal,
  totalSessions,
  xpTotal,
  coins,
  recordsCount,
  favoriteGame,
  recommendation,
}: GamesProgressPanelProps) {
  const weeklyProgress = weeklyGoal > 0 ? Math.min(100, (weeklyXp / weeklyGoal) * 100) : 0;

  return (
    <article className="rounded-[24px] border border-[#D2E1F2]/80 bg-[linear-gradient(150deg,rgba(255,255,255,0.96)_0%,rgba(243,250,255,0.94)_100%)] p-4 shadow-[0_12px_30px_rgba(19,47,80,0.11)] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.08em] text-[#6888A8]">Seu progresso em games</p>
          <p className="mt-1 text-base font-black text-[#163A56]">{sessionsLabel(totalSessions)}</p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-[#C8DBEE] bg-white px-2.5 py-1 text-xs font-black text-[#365777]">
          <Flame className="h-3.5 w-3.5 text-[#F28D3F]" />
          {weeklyXp}/{weeklyGoal} XP
        </span>
      </div>

      <div className="mt-3">
        <ProgressBar value={weeklyProgress} tone="secondary" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <div className="rounded-2xl border border-[#D5E4F3] bg-white/92 p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#6C8AA7]">XP total</p>
          <p className="mt-1 text-lg font-black text-[#173B57]">{xpTotal}</p>
        </div>
        <div className="rounded-2xl border border-[#D5E4F3] bg-white/92 p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#6C8AA7]">XP de hoje</p>
          <p className="mt-1 text-lg font-black text-[#173B57]">{dailyXp}</p>
        </div>
        <div className="rounded-2xl border border-[#D5E4F3] bg-white/92 p-3">
          <p className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-[#6C8AA7]">
            <Coins className="h-3.5 w-3.5 text-[#E08B2E]" />
            AxionCoins
          </p>
          <p className="mt-1 text-lg font-black text-[#173B57]">{coins}</p>
        </div>
        <div className="rounded-2xl border border-[#D5E4F3] bg-white/92 p-3">
          <p className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-[#6C8AA7]">
            <Trophy className="h-3.5 w-3.5 text-[#ED9A3C]" />
            Recordes
          </p>
          <p className="mt-1 text-lg font-black text-[#173B57]">{recordsCount}</p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-[#CCE3EF] bg-[#F4FBFF] p-3 text-xs">
        <p className="font-black uppercase tracking-wide text-[#5D7F9E]">Próxima jogada</p>
        <p className="mt-1 font-semibold text-[#214D6D]">{recommendation}</p>
        {favoriteGame ? (
          <p className="mt-1 inline-flex items-center gap-1 font-semibold text-[#2F5D7C]">
            <Gamepad2 className="h-3.5 w-3.5" />
            Jogo favorito: {favoriteGame}
          </p>
        ) : null}
      </div>
    </article>
  );
}


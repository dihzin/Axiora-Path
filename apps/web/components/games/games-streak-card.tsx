import { Flame, Trophy } from "lucide-react";

type GamesStreakCardProps = {
  currentStreak: number;
  bestStreak: number;
  weeklySessions: number;
  totalSessions: number;
  message: string;
};

export function GamesStreakCard({ currentStreak, bestStreak, weeklySessions, totalSessions, message }: GamesStreakCardProps) {
  return (
    <article className="rounded-[24px] border border-white/14 bg-[linear-gradient(160deg,rgba(16,42,65,0.9)_0%,rgba(12,33,52,0.88)_100%)] p-4 shadow-[0_12px_26px_rgba(3,10,22,0.3)] sm:p-5">
      <p className="text-xs font-black uppercase tracking-[0.08em] text-[#8DB7D9]">Consistência</p>
      <p className="mt-1 text-sm font-semibold text-[#EAF4FF]">{message}</p>

      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <div className="rounded-2xl border border-white/14 bg-[#103552]/72 p-3">
          <p className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-[#A8C7E1]">
            <Flame className="h-3.5 w-3.5 text-[#F79B48]" />
            Streak atual
          </p>
          <p className="mt-1 text-lg font-black text-[#F9FCFF]">{currentStreak} dias</p>
        </div>
        <div className="rounded-2xl border border-white/14 bg-[#103552]/72 p-3">
          <p className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-[#A8C7E1]">
            <Trophy className="h-3.5 w-3.5 text-[#FFCF78]" />
            Melhor streak
          </p>
          <p className="mt-1 text-lg font-black text-[#F9FCFF]">{bestStreak} dias</p>
        </div>
        <div className="rounded-2xl border border-white/14 bg-[#103552]/72 p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#A8C7E1]">Partidas na semana</p>
          <p className="mt-1 text-lg font-black text-[#F9FCFF]">{weeklySessions}</p>
        </div>
        <div className="rounded-2xl border border-white/14 bg-[#103552]/72 p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#A8C7E1]">Partidas totais</p>
          <p className="mt-1 text-lg font-black text-[#F9FCFF]">{totalSessions}</p>
        </div>
      </div>
    </article>
  );
}


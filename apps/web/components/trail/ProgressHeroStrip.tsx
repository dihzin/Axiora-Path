"use client";

import { cn } from "@/lib/utils";

type ProgressHeroStripProps = {
  xp: number;
  level: number;
  xpPercent: number;
  xpInLevel: number;
  xpToNextLevel: number;
  weeklyCompleted: number;
  weeklyTarget: number;
  weekLabel: string;
  className?: string;
};

export function ProgressHeroStrip({
  xp,
  level,
  xpPercent,
  xpInLevel,
  xpToNextLevel,
  weeklyCompleted,
  weeklyTarget,
  weekLabel,
  className,
}: ProgressHeroStripProps) {
  const safeXpPercent = Math.max(0, Math.min(100, Math.round(xpPercent)));
  const safeTarget = Math.max(1, weeklyTarget);
  const safeCompleted = Math.max(0, Math.min(safeTarget, weeklyCompleted));
  const weeklyPercent = Math.round((safeCompleted / safeTarget) * 100);

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-[28px] border border-[#C8DAF4] bg-white shadow-[0_16px_30px_rgba(28,66,120,0.16)]",
        className,
      )}
      aria-label="Resumo de progresso"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-[linear-gradient(180deg,rgba(38,132,233,0.15)_0%,rgba(38,132,233,0)_100%)]" aria-hidden />
      <div className="relative grid gap-3 p-3 md:grid-cols-[1.05fr_0.95fr]">
        <div className="relative rounded-2xl border border-[#D6E4F7] bg-white p-4 shadow-[0_6px_14px_rgba(35,72,128,0.08)] md:p-5">
          <div className="absolute left-0 top-0 h-full w-1.5 rounded-l-2xl bg-[linear-gradient(180deg,#1D78E1_0%,#23B7D5_55%,#2BC9A8_100%)]" />
          <p className="text-[10px] font-black uppercase tracking-[0.1em] text-[#5D7EA7]">XP da matéria</p>
          <div className="mt-1 flex items-center gap-3">
            <p className="text-[42px] font-black leading-none text-[#123A67]">{Math.max(0, Math.floor(xp))}</p>
            <div className="rounded-xl border border-[#FFD478] bg-[linear-gradient(180deg,#FFF8D9_0%,#FFE8A0_100%)] px-2.5 py-1.5 text-center">
              <p className="text-[9px] font-black uppercase tracking-[0.08em] text-[#7A5B00]">Nível</p>
              <p className="text-[26px] font-black leading-none text-[#7A5B00]">{Math.max(1, Math.floor(level))}</p>
            </div>
          </div>
          <div className="mt-3">
            <div className="mb-1.5 flex items-center justify-between text-[12px] font-black text-[#4B698D]">
              <span>Próximo nível</span>
              <span className="rounded-full bg-[#EAF4FF] px-2 py-0.5 text-[11px] text-[#237CCD]">{safeXpPercent}%</span>
            </div>
            <div className="h-4 overflow-hidden rounded-full border border-[#CCE0FA] bg-[#E7EFFA]">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#FFD554_0%,#FFB132_50%,#FF8F2D_100%)] transition-transform transition-shadow transition-opacity duration-700"
                style={{ width: `${safeXpPercent}%` }}
              />
            </div>
            <p className="mt-1.5 text-[11px] font-semibold text-[#5F7798]">
              {Math.max(0, Math.floor(xpInLevel))}/{Math.max(1, Math.floor(xpToNextLevel))} XP neste nível
            </p>
          </div>
        </div>

        <div className="relative rounded-2xl border border-[#D6E4F7] bg-[linear-gradient(180deg,#F4FAFF_0%,#EEF7FF_100%)] p-4 shadow-[0_6px_14px_rgba(35,72,128,0.08)] md:p-5">
          <div className="pointer-events-none absolute right-[-14px] top-[-16px] h-24 w-24 rounded-full bg-[#DDF2FF]" aria-hidden />
          <p className="text-[10px] font-black uppercase tracking-[0.1em] text-[#5D7EA7]">Meta semanal</p>
          <div className="mt-1 flex items-start justify-between gap-3">
            <div>
              <p className="text-[42px] font-black leading-none text-[#123A67]">
                {safeCompleted}/{safeTarget}
              </p>
              <p className="mt-1 text-[11px] font-black uppercase tracking-[0.07em] text-[#2E88D5]">Lições concluídas</p>
            </div>
            <span className="rounded-full border border-[#CCE2FA] bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.06em] text-[#5B789F]">
              {weekLabel}
            </span>
          </div>
          <div className="mt-3">
            <div className="mb-1.5 flex items-center justify-between text-[12px] font-black text-[#4B698D]">
              <span>Progresso da semana</span>
              <span className="rounded-full bg-[#E7F5FF] px-2 py-0.5 text-[11px] text-[#237CCD]">{weeklyPercent}%</span>
            </div>
            <div className="h-4 overflow-hidden rounded-full border border-[#CCE0FA] bg-[#E7EFFA]">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#29C2B4_0%,#2E9EEA_100%)] transition-transform transition-shadow transition-opacity duration-700"
                style={{ width: `${weeklyPercent}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}


"use client";

import { cn } from "@/lib/utils";

type XPMeterProps = {
  xp: number;
  level: number;
  xpPercent: number;
  xpInLevel: number;
  xpToNextLevel: number;
  className?: string;
};

export function XPMeter({ xp, level, xpPercent, xpInLevel, xpToNextLevel, className }: XPMeterProps) {
  const safePercent = Math.max(0, Math.min(100, Math.round(xpPercent)));

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-[30px] bg-[linear-gradient(145deg,#2068F0_0%,#28AEE7_55%,#2BC8B0_100%)] p-[1.5px] shadow-[0_14px_28px_rgba(28,78,152,0.28)]",
        className,
      )}
      aria-label="Progresso de XP da matéria"
    >
      <div className="relative rounded-[28px] bg-[linear-gradient(180deg,#F9FCFF_0%,#EFF6FF_100%)] px-4 py-3.5">
        <div className="pointer-events-none absolute right-[-20px] top-[-22px] h-28 w-28 rounded-full bg-[#E0F3FF]/80" aria-hidden />
        <div className="pointer-events-none absolute bottom-[-24px] left-[-14px] h-20 w-20 rounded-full bg-[#DDF8EE]/80" aria-hidden />

        <div className="relative z-10 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.1em] text-[#5D7FA8]">XP da matéria</p>
            <p className="mt-0.5 text-[36px] font-black leading-none text-[#163F74]">{Math.max(0, Math.floor(xp))}</p>
            <p className="mt-1 text-[11px] font-black uppercase tracking-[0.06em] text-[#2E8ADC]">Barra de evolução</p>
          </div>

          <div className="rounded-2xl border border-[#FFD57B] bg-[linear-gradient(180deg,#FFF8DA_0%,#FFE9A4_100%)] px-3 py-2 text-center shadow-[0_7px_14px_rgba(245,185,57,0.24)]">
            <p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#7C5A00]">Nível</p>
            <p className="text-[28px] font-black leading-none text-[#7C5A00]">{Math.max(1, Math.floor(level))}</p>
          </div>
        </div>

        <div className="relative z-10 mt-3">
          <div className="mb-1.5 flex items-center justify-between text-[12px] font-black text-[#4A6890]">
            <span>Próximo nível</span>
            <span className="rounded-full border border-[#BFD9FB] bg-[#EAF4FF] px-2 py-0.5 text-[11px] text-[#1E79CD]">{safePercent}%</span>
          </div>

          <div className="h-3.5 overflow-hidden rounded-full border border-[#CCE0FB] bg-[#E6EEFA] shadow-[inset_0_2px_4px_rgba(70,102,148,0.15)]">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#FFD554_0%,#FFB52F_48%,#FF8E2C_100%)] transition-transform transition-shadow transition-opacity duration-700 ease-out"
              style={{ width: `${safePercent}%` }}
            />
          </div>

          <p className="mt-1.5 text-[11px] font-semibold text-[#5F7798]">
            {Math.max(0, Math.floor(xpInLevel))}/{Math.max(1, Math.floor(xpToNextLevel))} XP neste nível
          </p>
        </div>
      </div>
    </section>
  );
}



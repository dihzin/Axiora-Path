"use client";

import { CheckCircle2, Dot } from "lucide-react";
import { memo } from "react";

type UnitTransitionMarkerProps = {
  nextUnitLabel: string;
  completed: boolean;
  locked: boolean;
  gapHeight?: number;
};

function UnitTransitionMarkerComponent({ nextUnitLabel, completed, locked, gapHeight = 84 }: UnitTransitionMarkerProps) {
  const toneClass = completed
    ? "border-[#8FDCD0] bg-[#E9FAF6] text-[#0F9484]"
    : locked
      ? "border-[#D2D9E4] bg-[#EEF2F7] text-[#8A97AB]"
      : "border-[#BFD7EE] bg-[#F2F8FF] text-[#3F5E84]";

  return (
    <div className="relative z-0 w-full" style={{ height: `${gapHeight}px` }} aria-hidden>
      <div className="absolute left-1/2 top-1/2 h-6 -translate-x-1/2 -translate-y-[22px]">
        <svg width="44" height="24" viewBox="0 0 44 24" className="block">
          <path d="M2 2 C 12 14, 32 14, 42 22" fill="none" stroke="rgba(153,164,184,0.45)" strokeWidth="2.5" strokeDasharray="3 4" strokeLinecap="round" />
        </svg>
      </div>

      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className={`inline-flex min-h-[32px] items-center gap-1 rounded-full border px-3 text-[11px] font-black uppercase tracking-[0.04em] shadow-[0_2px_8px_rgba(0,0,0,0.08)] ${toneClass}`}>
          {completed ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : <Dot className="h-3.5 w-3.5" aria-hidden />}
          <span>{nextUnitLabel}</span>
          {completed ? (
            <span className="ml-0.5 inline-flex h-1.5 w-1.5 rounded-full bg-[#4DD9C0]" />
          ) : null}
        </div>
      </div>
    </div>
  );
}

export const UnitTransitionMarker = memo(UnitTransitionMarkerComponent);

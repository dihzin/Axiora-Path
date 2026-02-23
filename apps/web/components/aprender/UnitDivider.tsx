"use client";

import { memo } from "react";
import { cn } from "@/lib/utils";

type UnitDividerProps = {
  nextUnitLabel: string;
  completed: boolean;
  locked: boolean;
  gapHeight?: number;
};

function UnitDividerComponent({ nextUnitLabel, completed, locked, gapHeight = 108 }: UnitDividerProps) {
  const pillTone = completed
    ? "border-[#93DCD2] bg-[#EAF9F6] text-[#0E9484]"
    : locked
      ? "border-[#D5DCE7] bg-[#EEF2F7] text-[#8A96AB]"
      : "border-[#C6DFF5] bg-[#F3F9FF] text-[#4A6688]";

  const lineTone = completed ? "bg-[#6ED6C8]" : locked ? "bg-[#CFD7E2]" : "bg-[#B6DEE7]";

  return (
    <div className="relative z-0 w-full" style={{ height: `${gapHeight}px` }} aria-hidden>
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[86%] w-[220px] -translate-x-1/2 -translate-y-1/2 rounded-[999px] bg-[linear-gradient(to_bottom,rgba(255,255,255,0),rgba(255,255,255,0.38),rgba(255,255,255,0))]" />

      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[62%]">
        <span
          className={cn(
            "inline-flex min-h-[26px] items-center rounded-full border px-3 text-[10px] font-black uppercase tracking-[0.08em] shadow-[0_2px_8px_rgba(0,0,0,0.07)]",
            pillTone,
          )}
        >
          {nextUnitLabel}
        </span>
      </div>

      <div className="absolute left-1/2 top-1/2 h-[2px] w-[72px] -translate-x-1/2 translate-y-[14px] rounded-full bg-[#D7DEE9]" />
      <div className={cn("absolute left-1/2 top-1/2 h-[2px] w-[44px] -translate-x-1/2 translate-y-[14px] rounded-full", lineTone)} />
    </div>
  );
}

export const UnitDivider = memo(UnitDividerComponent);


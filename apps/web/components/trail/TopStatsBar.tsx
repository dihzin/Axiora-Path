"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type TopStatsBarProps = {
  streak: number;
  gems: number;
  xp: number;
  className?: string;
  action?: ReactNode;
};

export function TopStatsBar({ streak, gems, xp, className, action }: TopStatsBarProps) {
  const safeXp = Math.max(0, Math.min(100, xp));

  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-sm items-center justify-between rounded-3xl border border-[#D8E2F3] bg-white px-3 py-3 shadow-[0_6px_16px_rgba(0,0,0,0.06)] lg:rounded-2xl lg:px-2.5 lg:py-2.5",
        className,
      )}
    >
      <StatPill>
        <FlameIcon />
        <span>{streak}</span>
      </StatPill>

      <StatPill>
        <DiamondIcon />
        <span>{gems}</span>
      </StatPill>

      <div className="flex min-w-0 flex-col items-center gap-1 lg:gap-0.5">
        <StatPill>
          <StarIcon />
          <span>{safeXp}%</span>
        </StatPill>
        <div className="h-1.5 w-14 overflow-hidden rounded-full bg-[#EEF2F8] lg:w-12">
          <div className="h-full rounded-full bg-[#FFD34F] transition-all duration-700" style={{ width: `${safeXp}%` }} />
        </div>
      </div>

      {action ?? (
        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#E3EBF7] bg-[#F9FBFF] text-[#7A8DAA] transition-colors hover:bg-[#F1F6FF] lg:h-8 lg:w-8"
          aria-label="Abrir matérias"
        >
          <BookIcon />
        </button>
      )}
    </div>
  );
}

function StatPill({ children }: { children: ReactNode }) {
  return (
    <div className="inline-flex min-h-[42px] items-center gap-1.5 rounded-full border border-[#E7EDF8] bg-[#F9FBFF] px-2.5 py-2 text-[15px] font-black text-[#163258] lg:min-h-[38px] lg:px-2 lg:py-1.5 lg:text-[14px]">
      {children}
    </div>
  );
}

function FlameIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 2C12 2 7 7.5 7 13a5 5 0 0 0 10 0c0-2.5-1.5-5-5-11z" fill="#FF9600" />
      <path d="M12 8s-2.5 3-2.5 5.5a2.5 2.5 0 0 0 5 0C14.5 11 12 8 12 8z" fill="#FF6B00" />
    </svg>
  );
}

function DiamondIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 3 4 9l8 12 8-12-8-6z" fill="#4DD9F5" />
      <path d="M12 3 4 9h16L12 3z" fill="#83EEFF" />
      <path d="M4 9l8 12V9H4z" fill="#29C4E8" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 2l2.9 6.3 6.6.9-4.8 4.6 1.2 6.5L12 17l-5.9 3.3 1.2-6.5L2.5 9.2l6.6-.9L12 2z"
        fill="#FFD700"
        stroke="#F0B400"
        strokeWidth="0.5"
      />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 4h7a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" fill="#AFAFAF" />
      <path d="M13 4h7a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" fill="#CBCBCB" />
      <path d="M12 4v16" stroke="white" strokeWidth="1.5" />
    </svg>
  );
}

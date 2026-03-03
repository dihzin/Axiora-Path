"use client";

import { cn } from "@/lib/utils";

type SubjectStreakBadgeProps = {
  streakDays: number;
};

export function SubjectStreakBadge({ streakDays }: SubjectStreakBadgeProps) {
  const safe = Math.max(0, Math.floor(streakDays));
  const toneClass =
    safe >= 7
      ? "border-[#F0D078] bg-[#FFF5D1] text-[#8A6A00] motion-safe:animate-[badge-gold-pulse_760ms_ease-in-out_infinite]"
      : safe >= 4
        ? "border-[#C9B4F5] bg-[#F3ECFF] text-[#64459C]"
        : safe >= 1
          ? "border-[#BFD8FF] bg-[#EAF3FF] text-[#2E5FA8]"
          : "border-[#D9E3F2] bg-[#F4F7FC] text-[#6D819F]";

  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.05em]", toneClass)}>
      <span aria-hidden>🔥</span>
      {safe}d
    </span>
  );
}

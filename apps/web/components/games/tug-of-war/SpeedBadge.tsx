"use client";

type SpeedTier = "lightning" | "veryFast" | "good" | "slow";

type SpeedBadgeProps = {
  tier: SpeedTier;
};

const TIER_META: Record<SpeedTier, { label: string; className: string }> = {
  lightning: { label: "⚡ Relâmpago", className: "bg-[#fef3c7] border-[#f59e0b] text-[#92400e]" },
  veryFast: { label: "🔥 Muito rápido", className: "bg-[#fee2e2] border-[#ef4444] text-[#991b1b]" },
  good: { label: "👍 Boa", className: "bg-[#dcfce7] border-[#22c55e] text-[#166534]" },
  slow: { label: "🐢 Lento", className: "bg-[#e0e7ff] border-[#6366f1] text-[#3730a3]" },
};

export function SpeedBadge({ tier }: SpeedBadgeProps) {
  const meta = TIER_META[tier];

  return (
    <div className={`rounded-full border-2 px-3 py-1 text-xs font-black shadow-[0_4px_0_rgba(30,41,59,0.2)] ${meta.className}`}>
      {meta.label}
    </div>
  );
}

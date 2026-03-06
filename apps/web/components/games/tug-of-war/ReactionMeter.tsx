"use client";

type ReactionMeterProps = {
  reactionMs: number | null;
};

function toneForReaction(reactionMs: number | null): string {
  if (reactionMs === null) return "border-[#cbd5e1] bg-[#f8fafc] text-[#475569]";
  if (reactionMs < 500) return "border-[#22c55e] bg-[#dcfce7] text-[#166534]";
  if (reactionMs < 1000) return "border-[#f59e0b] bg-[#fef3c7] text-[#92400e]";
  return "border-[#ef4444] bg-[#fee2e2] text-[#991b1b]";
}

export function ReactionMeter({ reactionMs }: ReactionMeterProps) {
  const tone = toneForReaction(reactionMs);
  const valueLabel = reactionMs === null ? "-" : `${Math.round(reactionMs)} ms`;

  return (
    <div className={`mt-3 rounded-2xl border-2 px-4 py-2 text-center ${tone}`}>
      <p className="text-xs font-black uppercase tracking-wide">Reaction</p>
      <p className="text-lg font-black">{valueLabel}</p>
    </div>
  );
}

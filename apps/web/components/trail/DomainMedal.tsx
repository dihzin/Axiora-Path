"use client";

import { useEffect, useRef, useState } from "react";

import type { DomainMedalTier } from "@/lib/gamification-derivations";
import { cn } from "@/lib/utils";

type DomainMedalProps = {
  tier: DomainMedalTier;
  completionPercent: number;
};

const LABEL: Record<DomainMedalTier, string> = {
  none: "Sem medalha",
  bronze: "Bronze",
  silver: "Prata",
  gold: "Ouro",
  diamond: "Diamante",
};

const COLORS: Record<DomainMedalTier, string> = {
  none: "#A7B5C9",
  bronze: "#C57B42",
  silver: "#9AA7BB",
  gold: "#E2B22A",
  diamond: "#3DB9E6",
};

export function DomainMedal({ tier, completionPercent }: DomainMedalProps) {
  const prev = useRef<DomainMedalTier>(tier);
  const [highlight, setHighlight] = useState(false);

  useEffect(() => {
    if (prev.current !== tier && tier !== "none") {
      setHighlight(true);
      const t = window.setTimeout(() => setHighlight(false), 760);
      prev.current = tier;
      return () => window.clearTimeout(t);
    }
    prev.current = tier;
  }, [tier]);

  const fill = COLORS[tier];

  return (
    <div className={cn("inline-flex items-center gap-2 rounded-2xl border border-[#DCE6F3] bg-white px-3 py-1.5", highlight && "shadow-[0_0_22px_rgba(244,194,70,0.35)]")}>
      <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="12" r="9.2" fill={fill} />
        <path d="M12 6.8l1.8 3.8 4.1.6-3 2.9.7 4-3.6-1.9-3.6 1.9.7-4-3-2.9 4.1-.6L12 6.8z" fill="#fff" />
      </svg>
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.06em] text-[#6A7E9D]">Medalha</p>
        <p className="text-xs font-black text-[#1D3A63]">
          {LABEL[tier]} · {Math.max(0, Math.min(100, Math.round(completionPercent)))}%
        </p>
      </div>
    </div>
  );
}

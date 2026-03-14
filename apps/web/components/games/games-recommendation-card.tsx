import type { ComponentType } from "react";
import { ArrowRight, Clock3, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";

type GamesRecommendationCardProps = {
  title: string;
  subtitle: string;
  reason: string;
  ctaLabel: string;
  infoChips: string[];
  icon: ComponentType<{ className?: string }>;
  onPlay: () => void;
  disabled?: boolean;
};

export function GamesRecommendationCard({
  title,
  subtitle,
  reason,
  ctaLabel,
  infoChips,
  icon: Icon,
  onPlay,
  disabled = false,
}: GamesRecommendationCardProps) {
  return (
    <article className="rounded-[24px] border border-[#C8E7DD]/80 bg-[linear-gradient(150deg,rgba(255,255,255,0.96)_0%,rgba(236,255,247,0.94)_64%,rgba(218,255,243,0.92)_100%)] p-4 shadow-[0_10px_28px_rgba(9,40,27,0.12)] sm:p-5">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#BFE5D8] bg-white/95 text-[#128C76] shadow-[0_3px_0_rgba(16,122,102,0.14)]">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1 rounded-full border border-[#B9E9D8] bg-[#E9FFF7] px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-[#13866F]">
            <Sparkles className="h-3 w-3" />
            Recomendado para agora
          </p>
          <h2 className="mt-2 text-lg font-black leading-tight text-[#153A4A]">{title}</h2>
          <p className="mt-1 text-sm font-semibold leading-relaxed text-[#356476]">{subtitle}</p>
          <p className="mt-2 text-xs font-semibold text-[#1D8B75]">{reason}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {infoChips.map((chip) => (
          <span key={chip} className="inline-flex items-center gap-1 rounded-full border border-[#CBE4ED] bg-white/90 px-2.5 py-1 text-[11px] font-bold text-[#4B6D88]">
            <Clock3 className="h-3 w-3" />
            {chip}
          </span>
        ))}
      </div>
      <Button className="mt-4 w-full sm:w-auto" onClick={onPlay} disabled={disabled}>
        {ctaLabel}
        <ArrowRight className="h-4 w-4" />
      </Button>
    </article>
  );
}


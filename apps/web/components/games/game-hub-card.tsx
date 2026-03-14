import type { ComponentType } from "react";
import { ArrowRight, Clock3, Medal, Sparkles, Star } from "lucide-react";

import { Button } from "@/components/ui/button";

type PersonalBestSummary = {
  bestScore: number | null;
  bestStreak: number | null;
  bestDurationSeconds: number | null;
};

type GameHubCardProps = {
  title: string;
  description: string;
  skillLabel: string;
  durationLabel: string;
  ageBand: string;
  playStyle: string;
  whyItMatters: string;
  xpReward: number;
  available: boolean;
  stateLabel: string;
  isRecommended?: boolean;
  isFavorite?: boolean;
  personalBest?: PersonalBestSummary | null;
  icon: ComponentType<{ className?: string }>;
  onPlay: () => void;
  disabled?: boolean;
};

function personalBestText(value: PersonalBestSummary | null | undefined): string | null {
  if (!value) return null;
  if (typeof value.bestScore === "number") return `Recorde: ${value.bestScore} pts`;
  if (typeof value.bestStreak === "number") return `Melhor sequência: ${value.bestStreak}`;
  if (typeof value.bestDurationSeconds === "number") return `Melhor tempo: ${value.bestDurationSeconds}s`;
  return null;
}

export function GameHubCard({
  title,
  description,
  skillLabel,
  durationLabel,
  ageBand,
  playStyle,
  whyItMatters,
  xpReward,
  available,
  stateLabel,
  isRecommended = false,
  isFavorite = false,
  personalBest,
  icon: Icon,
  onPlay,
  disabled = false,
}: GameHubCardProps) {
  const personalBestLabel = personalBestText(personalBest);

  return (
    <article className="group rounded-[24px] border border-white/16 bg-[linear-gradient(160deg,rgba(16,40,63,0.9)_0%,rgba(12,33,54,0.88)_54%,rgba(10,28,45,0.9)_100%)] p-4 shadow-[0_14px_30px_rgba(3,10,22,0.28)] transition hover:-translate-y-[2px] hover:border-white/26 hover:shadow-[0_20px_36px_rgba(3,10,22,0.36)]">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/18 bg-[#123A5A]/88 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
          <Icon className="h-5 w-5 text-[#7DE8C6]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full border border-white/20 bg-[#0E2E4A]/86 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-[#BFD4EA]">
              {stateLabel}
            </span>
            {isRecommended ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-[#7BDCC3]/40 bg-[#103D4F]/90 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-[#8BFFD9]">
                <Sparkles className="h-3 w-3" />
                Recomendado
              </span>
            ) : null}
            {isFavorite ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-[#FFD08B]/45 bg-[#4F3A1A]/60 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-[#FFDFA8]">
                <Star className="h-3 w-3" />
                Favorito
              </span>
            ) : null}
          </div>
          <h3 className="mt-1 text-base font-black text-[#EAF4FF]">{title}</h3>
          <p className="mt-1 text-sm font-semibold leading-relaxed text-[#B7CDE2]">{description}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <span className="rounded-full border border-white/16 bg-[#0F3451]/84 px-2.5 py-1 text-[11px] font-bold text-[#BFD2E7]">{skillLabel}</span>
        <span className="inline-flex items-center gap-1 rounded-full border border-white/16 bg-[#0F3451]/84 px-2.5 py-1 text-[11px] font-bold text-[#BFD2E7]">
          <Clock3 className="h-3 w-3" />
          {durationLabel}
        </span>
        <span className="rounded-full border border-white/16 bg-[#0F3451]/84 px-2.5 py-1 text-[11px] font-bold text-[#BFD2E7]">{ageBand}</span>
      </div>

      <p className="mt-2 text-xs font-semibold text-[#8EFDDF]">{playStyle}</p>
      <p className="mt-1 text-xs text-[#9CBAD4]">{whyItMatters}</p>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 rounded-full border border-[#7DE8C6]/36 bg-[#103E4E]/88 px-2.5 py-1 text-[11px] font-black text-[#92FFDD]">
          <Sparkles className="h-3 w-3" />
          +{xpReward} XP
        </span>
        {personalBestLabel ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-[#FFD38E]/42 bg-[#533A18]/62 px-2.5 py-1 text-[11px] font-black text-[#FFE0A9]">
            <Medal className="h-3 w-3" />
            {personalBestLabel}
          </span>
        ) : null}
      </div>

      <Button className="mt-4 w-full sm:w-auto" onClick={onPlay} disabled={disabled || !available}>
        {available ? "Jogar" : "Em breve"}
        <ArrowRight className="h-4 w-4" />
      </Button>
    </article>
  );
}

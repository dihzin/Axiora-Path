"use client";

import { memo } from "react";
import { List, CheckCircle2 } from "lucide-react";

import { ProgressBar } from "@/components/ui/progress-bar";

type UnitCardProps = {
  sectionOrder?: number;
  order: number;
  title: string;
  completionRate: number;
  completedLessons: number;
  totalLessons: number;
  active?: boolean;
  variant?: "default" | "compact";
};

function UnitCardComponent({
  sectionOrder,
  order,
  title,
  completionRate,
  completedLessons,
  totalLessons,
  active = false,
  variant = "default",
}: UnitCardProps) {
  const safeProgress = Math.max(0, Math.min(100, Math.round(completionRate * 100)));
  const compact = variant === "compact";

  return (
    <article
      className="overflow-hidden rounded-[var(--path-radius-card)] border border-[#0BA590] bg-[color:var(--path-secondary)] text-white shadow-[var(--path-shadow-1)]"
      aria-label={`Unidade ${title}`}
    >
      <div
        className={`grid grid-cols-[1fr_auto] items-start gap-2 ${compact ? "px-3 pb-1.5 pt-2" : "px-[var(--path-space-2)] pb-2 pt-2.5"}`}
      >
        <div className="min-w-0 space-y-1">
          <p className={`${compact ? "text-[8px]" : "text-[10px]"} font-black uppercase leading-tight tracking-[0.06em] text-white/80`}>
            {sectionOrder ? `Seção ${sectionOrder}, ` : ""}Unidade {order}
          </p>
          <h2
            className={`break-words font-black ${compact ? "text-[1.3rem] leading-[0.88]" : "text-[1.9rem] leading-[0.92]"}`}
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {title}
          </h2>
        </div>
        <button
          type="button"
          className={`inline-flex shrink-0 items-center justify-center rounded-2xl border border-[#099381] bg-[#11BAA3] ${compact ? "h-9 w-9" : "h-11 w-11"}`}
          aria-label="Detalhes da unidade"
        >
          <List className={compact ? "h-4 w-4" : "h-5 w-5"} aria-hidden />
        </button>
      </div>

      <div className={`space-y-1 bg-[#10B198] ${compact ? "px-3 pb-1.5 pt-1" : "px-[var(--path-space-2)] pb-2 pt-1"}`}>
        <ProgressBar
          value={safeProgress}
          tone="secondary"
          className={`${compact ? "h-1.5" : "h-1.5"} border-white/25 bg-white/20`}
          barClassName="duo-progress__bar--secondary"
        />
        <p className={`inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 font-bold ${compact ? "text-[8px]" : "text-[9px]"}`}>
          <CheckCircle2 className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} aria-hidden />
          {completedLessons}/{totalLessons}
          <span className="sr-only">{active ? "Unidade atual" : "Unidade"}</span>
        </p>
      </div>
    </article>
  );
}

export const UnitCard = memo(UnitCardComponent);

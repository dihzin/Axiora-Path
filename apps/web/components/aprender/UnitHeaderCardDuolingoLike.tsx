"use client";

import { CheckCircle2, List } from "lucide-react";
import { memo, type CSSProperties } from "react";

type UnitHeaderCardDuolingoLikeProps = {
  sectionOrder?: number;
  order: number;
  title: string;
  completionRate: number;
  completedLessons: number;
  totalLessons: number;
  state?: "default" | "completed" | "locked" | "inProgress";
};

function UnitHeaderCardDuolingoLikeComponent({
  sectionOrder,
  order,
  title,
  completionRate,
  completedLessons,
  totalLessons,
  state = "default",
}: UnitHeaderCardDuolingoLikeProps) {
  const progress = Math.max(0, Math.min(100, Math.round(completionRate * 100)));
  const stateVars: CSSProperties =
    state === "locked"
      ? {
          ["--uhc-shell-bg" as string]: "var(--card-shell-bg-locked)",
          ["--uhc-shell-border" as string]: "var(--card-shell-border-locked)",
          ["--uhc-shell-fg" as string]: "var(--card-shell-fg-locked)",
          ["--uhc-action-bg" as string]: "var(--action-btn-bg-locked)",
          ["--uhc-action-border" as string]: "var(--action-btn-border-locked)",
          ["--uhc-progress-track" as string]: "var(--progress-track-locked)",
          ["--uhc-progress-fill" as string]: "var(--progress-fill-locked)",
        }
      : state === "completed"
        ? {
            ["--uhc-shell-bg" as string]: "var(--card-shell-bg-completed)",
            ["--uhc-shell-border" as string]: "var(--card-shell-border-completed)",
            ["--uhc-shell-fg" as string]: "var(--card-shell-fg-default)",
            ["--uhc-action-bg" as string]: "var(--action-btn-bg-completed)",
            ["--uhc-action-border" as string]: "var(--action-btn-border-completed)",
            ["--uhc-progress-track" as string]: "var(--progress-track)",
            ["--uhc-progress-fill" as string]: "var(--progress-fill)",
          }
        : {
            ["--uhc-shell-bg" as string]: "var(--card-shell-bg-inprogress)",
            ["--uhc-shell-border" as string]: "var(--card-shell-border-inprogress)",
            ["--uhc-shell-fg" as string]: "var(--card-shell-fg-default)",
            ["--uhc-action-bg" as string]: "var(--action-btn-bg-default)",
            ["--uhc-action-border" as string]: "var(--action-btn-border-default)",
            ["--uhc-progress-track" as string]: "var(--progress-track)",
            ["--uhc-progress-fill" as string]: "var(--progress-fill)",
          };

  return (
    <article
      className="relative min-h-[90px] overflow-hidden rounded-[var(--card-radius-xl)] border border-[color:var(--uhc-shell-border)] bg-[color:var(--uhc-shell-bg)] px-2.5 pb-2 pt-2 text-[color:var(--uhc-shell-fg)] shadow-[var(--card-shadow-soft)]"
      style={{ ...stateVars, boxShadow: "var(--card-shadow-soft), var(--card-highlight-inset)" }}
      aria-label={`Unidade ${title}`}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-11 bg-[image:var(--card-gloss-overlay)] opacity-90"
      />

      <div className="relative z-[1] grid grid-cols-[1fr_auto] items-start gap-1.5">
        <div className="min-w-0">
          <p className="text-[8px] font-black uppercase tracking-[0.06em] text-white/78">
            {sectionOrder ? `Seção ${sectionOrder}, ` : ""}Unidade {order}
          </p>
          <h2
            className="mt-0.5 break-words text-[1.22rem] font-extrabold leading-[0.9] text-white"
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            Unidade {order}: {title}
          </h2>
        </div>

        <button
          type="button"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[color:var(--uhc-action-border)] bg-[color:var(--uhc-action-bg)] shadow-[var(--action-btn-shadow)]"
          aria-label="Detalhes da unidade"
        >
          <List className="h-4.5 w-4.5 text-white" strokeWidth={2.5} aria-hidden />
        </button>
      </div>

      <div className="relative z-[1] mt-1.5 space-y-1">
        <div className="relative h-[6px] overflow-hidden rounded-full bg-[color:var(--uhc-progress-track)]">
          <div
            className="h-full rounded-full bg-[image:var(--uhc-progress-fill)]"
            style={{
              width: `${progress}%`,
              transition: state === "inProgress" ? "width 300ms ease" : "width 220ms ease",
            }}
          />
          {progress > 3 ? <span className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-white/95 shadow-[var(--progress-thumb-shadow)]" style={{ left: `calc(${progress}% - 6px)` }} /> : null}
        </div>
        <p className="inline-flex items-center gap-1 rounded-full bg-white/16 px-2 py-[1px] text-[8px] font-black uppercase tracking-[0.02em] text-white">
          {state === "completed" ? <CheckCircle2 className="h-3 w-3" aria-hidden /> : null}
          {completedLessons}/{totalLessons}
        </p>
      </div>
    </article>
  );
}

export const UnitHeaderCardDuolingoLike = memo(UnitHeaderCardDuolingoLikeComponent);

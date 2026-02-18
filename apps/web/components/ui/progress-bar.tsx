"use client";

import { cn } from "@/lib/utils";

type ProgressBarProps = {
  value: number;
  tone?: "primary" | "secondary";
  className?: string;
  barClassName?: string;
};

export function ProgressBar({ value, tone = "primary", className, barClassName }: ProgressBarProps) {
  const safeValue = Math.max(0, Math.min(100, value));

  return (
    <div className={cn("duo-progress", className)} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(safeValue)}>
      <div
        className={cn("duo-progress__bar", tone === "secondary" ? "duo-progress__bar--secondary" : "", barClassName)}
        style={{ width: `${safeValue}%` }}
      />
    </div>
  );
}

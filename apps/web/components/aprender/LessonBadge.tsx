"use client";

import { Check, Star } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type LessonBadgeStatus = "completed" | "current" | "available" | "locked";

type LessonBadgeProps = {
  label: string;
  ariaLabel: string;
  status: LessonBadgeStatus;
  onClick: () => void;
  size?: "small" | "default" | "hero" | "checkpoint";
  offsetX?: number;
  disabled?: boolean;
  celebrate?: boolean;
  icon?: ReactNode;
  startLabel?: string | null;
  checkpoint?: boolean;
  checkpointIcon?: ReactNode;
  milestone?: boolean;
  milestoneIcon?: ReactNode;
  pulseOnce?: boolean;
};

export function LessonBadge({
  label,
  ariaLabel,
  status,
  onClick,
  size = "default",
  offsetX = 0,
  disabled = false,
  celebrate = false,
  icon,
  startLabel = null,
  checkpoint = false,
  checkpointIcon,
  milestone = false,
  milestoneIcon,
  pulseOnce = false,
}: LessonBadgeProps) {
  const baseShade = status === "current" ? "bg-[#D06748]" : status === "completed" ? "bg-[#4AAE9D]" : status === "available" ? "bg-[#C6CED8]" : "bg-[#9AA3AF]";
  const surfaceSolid =
    status === "current"
      ? "bg-[#FF6B3D]"
      : status === "completed"
        ? "bg-[#4DD9C0]"
        : status === "available"
          ? "bg-[#DDE4EE]"
          : "bg-[#B0B8C4]";
  const sizeClass =
    size === "hero" ? "h-[106px] w-[106px]" : size === "checkpoint" ? "h-[102px] w-[102px]" : size === "small" ? "h-[86px] w-[86px]" : "h-[92px] w-[92px]";
  const iconSize = status === "completed" ? "h-6 w-6" : size === "hero" ? "h-6 w-6" : "h-5 w-5";
  const diameter = size === "hero" ? 106 : size === "checkpoint" ? 102 : size === "small" ? 86 : 92;

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      style={{
        ["--path-offset-x" as string]: `${offsetX}px`,
        ["--badge-diameter" as string]: `${diameter}px`,
        ["--badge-base-height" as string]: `calc(${diameter}px * 0.14)`,
        ["--badge-highlight-height" as string]: `calc(${diameter}px * 0.12)`,
      }}
      className={cn(
        "path-badge-button relative inline-flex shrink-0 items-center justify-center rounded-full border-[2px] text-[var(--path-ink)]",
        sizeClass,
        "translate-x-[var(--path-offset-x)] transition-[transform,filter,box-shadow] duration-[var(--path-motion-ui)] ease-[cubic-bezier(.22,.61,.36,1)] hover:scale-[1.04] active:translate-y-[4px] active:brightness-95 active:shadow-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--path-secondary)] focus-visible:ring-offset-2",
        status === "completed" &&
          "border-[#2FBEA9] text-white shadow-[0_12px_0_rgba(59,161,143,0.95),0_6px_14px_rgba(0,0,0,0.18)]",
        status === "current" &&
          "border-[#F05E35] text-white shadow-[0_13px_0_rgba(199,83,48,0.95),0_6px_14px_rgba(0,0,0,0.18)]",
        status === "available" &&
          "border-[#C8D0DB] text-[#7A8799] shadow-[0_12px_0_rgba(188,197,209,0.98),0_6px_14px_rgba(0,0,0,0.18)]",
        status === "locked" &&
          "border-[#9FA8B5] text-white shadow-[0_12px_0_rgba(144,153,166,0.98),0_6px_14px_rgba(0,0,0,0.18)]",
        checkpoint ? "border-[2.5px]" : "",
        milestone ? "border-[#F2C94C] ring-2 ring-[#F2C94C]/25" : "",
        disabled ? (status === "locked" ? "cursor-not-allowed opacity-100" : "cursor-not-allowed opacity-90") : "hover:brightness-105",
        status === "current" ? "path-badge-active-idle" : "",
        surfaceSolid,
        celebrate ? "path-completed-pop" : "",
        pulseOnce ? "path-next-badge-pulse" : "",
      )}
    >
      {status === "current" ? (
        <span
          aria-hidden
          className={cn(
            "path-hero-ring-breathe pointer-events-none absolute rounded-full border-[2px] border-[#CBE8E4]",
            size === "hero" ? "-inset-[14px]" : "-inset-[12px]",
          )}
        />
      ) : null}
      {startLabel && status === "current" ? (
        <span className="path-start-bob absolute -top-12 translate-x-[10px] rounded-xl border border-[#C6E6E2] bg-white px-2 py-1 text-[11px] font-black uppercase tracking-[0.03em] text-[#15A497] shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
          {startLabel}
        </span>
      ) : null}
      <span
        aria-hidden
        className={cn("path-badge-base pointer-events-none absolute inset-x-[8px] bottom-[4px] rounded-b-full", baseShade)}
        style={{ height: "var(--badge-base-height)" }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-[12px] bottom-[15px] h-1 rounded-full bg-black/6"
      />
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-x-4 top-[7px] rounded-full",
          "bg-white",
        )}
        style={{ height: "var(--badge-highlight-height)", opacity: 0.25 }}
      />
      {checkpoint && status === "available" ? (
        <span aria-hidden className="path-checkpoint-shine pointer-events-none absolute inset-0 overflow-hidden rounded-full">
          <span className="absolute -left-6 top-2 h-[120%] w-5 rotate-[22deg] bg-white/35" />
        </span>
      ) : null}
      <span className="sr-only">{label}</span>
      <span aria-hidden className="inline-flex items-center justify-center">
        {status === "completed" ? (milestone && milestoneIcon ? milestoneIcon : checkpointIcon ?? <Check className={iconSize} aria-hidden />) : null}
        {status === "locked" ? <span className="h-3.5 w-3.5 rounded-full bg-white/55" aria-hidden /> : null}
        {status === "current" ? (milestone && milestoneIcon ? milestoneIcon : checkpoint && checkpointIcon ? checkpointIcon : <Star className={iconSize} aria-hidden />) : null}
        {status === "available" ? (milestone && milestoneIcon ? milestoneIcon : checkpoint && checkpointIcon ? checkpointIcon : icon ?? <span className="text-sm font-black">{label}</span>) : null}
      </span>
      {milestone && status === "completed" ? (
        <span aria-hidden className="path-milestone-radial pointer-events-none absolute inset-0">
          <span className="path-milestone-radial-ring absolute inset-[-10px] rounded-full border-2 border-[#F2C94C]/35" />
          <span className="path-milestone-radial-ring absolute inset-[-16px] rounded-full border border-[#F2C94C]/28 [animation-delay:90ms]" />
        </span>
      ) : null}
      {checkpoint && !milestone && status === "completed" ? (
        <span aria-hidden className="pointer-events-none absolute inset-0">
          <span className="path-checkpoint-confetti absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-[22px] -translate-y-[26px] rounded-full bg-[#FFD166]" />
          <span className="path-checkpoint-confetti absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-[2px] -translate-y-[30px] rounded-full bg-[#FF7A59]" />
          <span className="path-checkpoint-confetti absolute left-1/2 top-1/2 h-1.5 w-1.5 translate-x-[20px] -translate-y-[24px] rounded-full bg-[#3ECFBC]" />
        </span>
      ) : null}
    </button>
  );
}

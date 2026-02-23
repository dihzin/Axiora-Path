"use client";

import { cloneElement, isValidElement, type CSSProperties, type ReactElement, type ReactNode } from "react";

import { BadgeIcon } from "@/components/icons/badges/BadgeIcon";
import { cn } from "@/lib/utils";

type NodeState = "done" | "active" | "available" | "locked";

type NodeProps = {
  label: string;
  ariaLabel: string;
  state: NodeState;
  onClick: () => void;
  size?: "small" | "default" | "hero" | "checkpoint";
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

type NodeVisual = {
  base: string;
  border: string;
  icon: string;
  highlightOpacity: number;
  nodeOpacity: number;
  iconOpacity: number;
};

const NODE_VISUALS: Record<NodeState, NodeVisual> = {
  done: {
    base: "var(--node-done-shell)",
    border: "rgba(0,0,0,0.06)",
    icon: "var(--node-done-icon)",
    highlightOpacity: 0.2,
    nodeOpacity: 1,
    iconOpacity: 1,
  },
  active: {
    base: "var(--node-active-shell)",
    border: "rgba(0,0,0,0.08)",
    icon: "var(--node-active-icon)",
    highlightOpacity: 0.2,
    nodeOpacity: 1,
    iconOpacity: 1,
  },
  available: {
    base: "var(--node-available-shell)",
    border: "rgba(0,0,0,0.06)",
    icon: "var(--node-available-icon)",
    highlightOpacity: 0.18,
    nodeOpacity: 1,
    iconOpacity: 1,
  },
  locked: {
    base: "var(--node-locked-shell)",
    border: "rgba(0,0,0,0.05)",
    icon: "var(--node-locked-icon)",
    highlightOpacity: 0,
    nodeOpacity: 0.94,
    iconOpacity: 0.5,
  },
};

export function Node({
  label,
  ariaLabel,
  state,
  onClick,
  size = "default",
  disabled = false,
  celebrate = false,
  icon,
  startLabel = null,
  checkpoint = false,
  checkpointIcon,
  milestone = false,
  milestoneIcon,
  pulseOnce = false,
}: NodeProps) {
  const sizeClass =
    size === "hero" ? "h-[96px] w-[96px]" : size === "checkpoint" ? "h-[92px] w-[92px]" : size === "small" ? "h-[78px] w-[78px]" : "h-[84px] w-[84px]";
  const diameter = size === "hero" ? 96 : size === "checkpoint" ? 92 : size === "small" ? 78 : 84;
  const iconPixel = Math.round(diameter * 0.44);
  const styleIcon = (node: ReactNode, className: string) => {
    if (!isValidElement(node)) return node;
    return cloneElement(node as ReactElement<{ className?: string; strokeWidth?: number; size?: number; width?: number; height?: number }>, {
      className,
      strokeWidth: 2.6,
      size: iconPixel,
      width: iconPixel,
      height: iconPixel,
    });
  };
  const visual = NODE_VISUALS[state];
  const milestoneAccent = milestone && (state === "done" || state === "active");

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      style={
        {
          ["--node-base-color" as string]: visual.base,
          ["--node-icon-color" as string]: visual.icon,
          ["--node-border-color" as string]: visual.border,
          ["--node-highlight-alpha" as string]: visual.highlightOpacity,
          ["--badge-diameter" as string]: `${diameter}px`,
        } as CSSProperties
      }
      className={cn(
        "path-badge-button relative inline-flex shrink-0 items-center justify-center rounded-full",
        sizeClass,
        "transition-[transform,filter,box-shadow] duration-[120ms] ease-out hover:scale-[1.04] active:scale-[0.97]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--path-secondary)] focus-visible:ring-offset-2",
        disabled ? "cursor-not-allowed" : "hover:brightness-105",
        state === "active" ? "path-badge-active-idle scale-[1.03]" : "",
        celebrate ? "path-completed-pop" : "",
        pulseOnce ? "path-next-badge-pulse" : "",
      )}
    >
      {state === "active" ? (
        <span
          aria-hidden
          className={cn(
            "path-hero-ring-breathe pointer-events-none absolute rounded-full border-[2px] border-[#CBE8E4]/70",
            size === "hero" ? "-inset-[14px]" : "-inset-[12px]",
          )}
        />
      ) : null}

      {startLabel && state === "active" ? (
        <span className="path-start-bob absolute -top-12 translate-x-[10px] rounded-xl border border-[#C6E6E2] bg-white px-2 py-1 text-[11px] font-black uppercase tracking-[0.03em] text-[#15A497] shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
          {startLabel}
        </span>
      ) : null}

      <span
        aria-hidden
        className={cn("pointer-events-none absolute inset-0 rounded-full border", milestoneAccent ? "ring-2 ring-[#F2C94C]/25" : "")}
        style={{
          backgroundColor: "var(--node-base-color)",
          backgroundImage:
            "radial-gradient(circle at 50% 25%, rgba(255,255,255,var(--node-highlight-alpha)), transparent 60%), linear-gradient(to bottom, rgba(0,0,0,0) 60%, rgba(0,0,0,0.08))",
          borderColor: "var(--node-border-color)",
          boxShadow:
            state === "active"
              ? "0 8px 16px rgba(0,0,0,0.1), 0 3px 6px rgba(0,0,0,0.06), var(--node-active-glow)"
              : "0 6px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.05)",
          opacity: visual.nodeOpacity,
        }}
      />

      {checkpoint && state === "available" ? (
        <span aria-hidden className="path-checkpoint-shine pointer-events-none absolute inset-0 overflow-hidden rounded-full">
          <span className="absolute -left-6 top-2 h-[120%] w-5 rotate-[22deg] bg-white/30" />
        </span>
      ) : null}

      <span className="sr-only">{label}</span>
      <span
        aria-hidden
        className="relative z-[1] inline-flex items-center justify-center [filter:drop-shadow(0_1px_0_rgba(255,255,255,0.32))]"
        style={{ color: "var(--node-icon-color)", opacity: visual.iconOpacity }}
      >
        {state === "done"
            ? milestone && milestoneIcon
            ? styleIcon(milestoneIcon, "shrink-0")
            : checkpointIcon
              ? styleIcon(checkpointIcon, "shrink-0")
              : <BadgeIcon type="check" state="done" size={iconPixel} emphasis={size === "hero" ? "hero" : "normal"} />
          : null}
        {state === "locked"
          ? icon
            ? styleIcon(icon, "shrink-0")
            : <BadgeIcon type="lesson" state="locked" size={iconPixel} />
          : null}
        {state === "active"
          ? milestone && milestoneIcon
            ? styleIcon(milestoneIcon, "shrink-0")
            : checkpoint && checkpointIcon
              ? styleIcon(checkpointIcon, "shrink-0")
              : <BadgeIcon type="star" state="active" size={iconPixel} emphasis={size === "hero" ? "hero" : "normal"} />
          : null}
        {state === "available"
          ? milestone && milestoneIcon
            ? styleIcon(milestoneIcon, "shrink-0")
            : checkpoint && checkpointIcon
              ? styleIcon(checkpointIcon, "shrink-0")
              : icon
                ? styleIcon(icon, "shrink-0")
                : <span className="text-base font-black text-[var(--node-icon-color)]">{label}</span>
          : null}
      </span>

      {milestone && state === "done" ? (
        <span aria-hidden className="path-milestone-radial pointer-events-none absolute inset-0">
          <span className="path-milestone-radial-ring absolute inset-[-10px] rounded-full border-2 border-[#F2C94C]/35" />
          <span className="path-milestone-radial-ring absolute inset-[-16px] rounded-full border border-[#F2C94C]/28 [animation-delay:90ms]" />
        </span>
      ) : null}

      {checkpoint && !milestone && state === "done" ? (
        <span aria-hidden className="pointer-events-none absolute inset-0">
          <span className="path-checkpoint-confetti absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-[22px] -translate-y-[26px] rounded-full bg-[#FFD166]" />
          <span className="path-checkpoint-confetti absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-[2px] -translate-y-[30px] rounded-full bg-[#FF7A59]" />
          <span className="path-checkpoint-confetti absolute left-1/2 top-1/2 h-1.5 w-1.5 translate-x-[20px] -translate-y-[24px] rounded-full bg-[#3ECFBC]" />
        </span>
      ) : null}
    </button>
  );
}

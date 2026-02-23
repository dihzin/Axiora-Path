"use client";

import { memo, type CSSProperties } from "react";

import { cn } from "@/lib/utils";

type BadgeIconType = "lesson" | "book" | "star" | "dumbbell" | "chest" | "check";
type BadgeIconState = "locked" | "available" | "active" | "done";

type BadgeIconProps = {
  type: BadgeIconType;
  state: BadgeIconState;
  size?: number;
  emphasis?: "normal" | "hero";
  className?: string;
};

const BASE_STROKE_WIDTH = 2.3;

const TYPE_LABEL: Record<BadgeIconType, string> = {
  lesson: "Lição",
  book: "Livro",
  star: "Estrela",
  dumbbell: "Halter",
  chest: "Baú",
  check: "Concluído",
};

const TYPE_TWEAK: Record<BadgeIconType, { scale: number; x: number; y: number }> = {
  lesson: { scale: 1.12, x: 0, y: 0.1 },
  book: { scale: 1.06, x: 0.08, y: 0.12 },
  star: { scale: 1.12, x: 0, y: 0.14 },
  dumbbell: { scale: 1.07, x: 0.04, y: 0.12 },
  chest: { scale: 1.03, x: 0, y: 0.06 },
  check: { scale: 1.08, x: 0, y: 0.12 },
};

function Glyph({ type }: { type: BadgeIconType }) {
  if (type === "lesson") {
    return (
      <>
        <rect x="7.4" y="6.8" width="9.2" height="10.4" rx="2.2" fill="none" />
        <rect x="17.4" y="6.8" width="9.2" height="10.4" rx="2.2" fill="none" />
        <path d="M17 7.6v9.6" />
      </>
    );
  }
  if (type === "book") {
    return (
      <>
        <path d="M6.8 8.2A2.2 2.2 0 0 1 9 6h8.2v12.2H9a2.2 2.2 0 0 1-2.2-2.2V8.2Z" fill="none" />
        <path d="M17.8 6H26a2.2 2.2 0 0 1 2.2 2.2V16a2.2 2.2 0 0 1-2.2 2.2h-8.2V6Z" fill="none" />
        <path d="M17.5 6.3V18" />
      </>
    );
  }
  if (type === "star") {
    return <path d="m17.5 5.8 3.1 6.1 6.7 1-4.9 4.7 1.2 6.6-6.1-3.3-6.1 3.3 1.2-6.6-4.9-4.7 6.7-1 3.1-6.1Z" fill="none" />;
  }
  if (type === "dumbbell") {
    return (
      <>
        <rect x="5.8" y="11.4" width="3.2" height="7.2" rx="1" fill="none" />
        <rect x="9.4" y="12.3" width="2.5" height="5.4" rx="0.8" fill="none" />
        <rect x="23.1" y="11.4" width="3.2" height="7.2" rx="1" fill="none" />
        <rect x="20.2" y="12.3" width="2.5" height="5.4" rx="0.8" fill="none" />
        <path d="M12.7 15h6.7" />
      </>
    );
  }
  if (type === "chest") {
    return (
      <>
        <path d="M6.6 11.2h21.8v8a2 2 0 0 1-2 2H8.6a2 2 0 0 1-2-2v-8Z" fill="none" />
        <path d="M7.7 8h19.6a1.4 1.4 0 0 1 1.4 1.4v1.8H6.3V9.4A1.4 1.4 0 0 1 7.7 8Z" fill="none" />
        <rect x="14.6" y="13.3" width="5.8" height="3.8" rx="1.1" fill="none" />
        <path d="M17.5 13.3v3.8" />
      </>
    );
  }
  return <path d="m7.8 14.2 6 6 10.6-10.6" fill="none" />;
}

function BadgeIconComponent({ type, state, size = 30, emphasis = "normal", className }: BadgeIconProps) {
  const tone =
    state === "done" || state === "active"
      ? "#FFFFFF"
      : state === "locked"
        ? "#8E99A8"
        : "#76849A";
  const strokeWidth = state === "done" ? 2.5 : state === "active" ? 2.4 : BASE_STROKE_WIDTH;

  const tweak = TYPE_TWEAK[type];
  const emphasisScale = emphasis === "hero" ? 1.06 : 1;
  const transform = `translate(${tweak.x} ${tweak.y}) scale(${tweak.scale * emphasisScale})`;

  return (
    <span
      role="img"
      aria-label={`${TYPE_LABEL[type]} ${state}`}
      title={`${TYPE_LABEL[type]} ${state}`}
      className={cn(
        "relative inline-flex items-center justify-center rounded-full",
        state === "active" ? "shadow-[0_0_0_2px_rgba(133,226,216,0.42),0_0_16px_rgba(77,217,192,0.25)]" : "",
        className,
      )}
      style={{ width: size, height: size } as CSSProperties}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 35 30"
        aria-hidden
        focusable="false"
        className="block [shape-rendering:geometricPrecision]"
      >
        {state === "active" ? (
          <g
            transform={`translate(${tweak.x + 0.12} ${tweak.y + 0.26}) scale(${tweak.scale * emphasisScale})`}
            fill="none"
            stroke="rgba(0,0,0,0.18)"
            strokeWidth={strokeWidth + 0.3}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            opacity={0.22}
          >
            <Glyph type={type} />
          </g>
        ) : null}
        <g
          transform={transform}
          fill="none"
          stroke={tone}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        >
          <Glyph type={type} />
        </g>
      </svg>
    </span>
  );
}

export const BadgeIcon = memo(BadgeIconComponent);

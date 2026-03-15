"use client";

import type { ReactNode, CSSProperties } from "react";

import { cn } from "@/lib/utils";

/**
 * ParchmentCard — base visual container para cards medievais.
 *
 * variant="light"  → pergaminho sólido (#FDF5E6), ideal para conteúdo com texto escuro
 * variant="glass"  → pergaminho translúcido com backdrop-blur, ideal para conteúdo
 *                    que já usa texto claro (preserva legibilidade sobre o fundo)
 */
export type ParchmentCardVariant = "light" | "glass";

type ParchmentCardProps = {
  children: ReactNode;
  variant?: ParchmentCardVariant;
  className?: string;
  style?: CSSProperties;
  as?: "section" | "div" | "article";
  /** Forwarded aria-label */
  ariaLabel?: string;
};

/** Shared structural classes (radius, overflow, position) */
const BASE =
  "relative overflow-hidden rounded-[22px] transition-all duration-300";

/** Full parchment — opaque warm paper look */
const LIGHT_SHELL =
  "border-[3px] border-[#A07850] bg-[linear-gradient(155deg,#FDF5E6_0%,#F5E4C4_55%,#EDCF9C_100%)] shadow-[0_12px_32px_rgba(44,30,18,0.28),inset_0_1px_0_rgba(255,255,255,0.72)]";

/** Translucent parchment glass — keeps dark/light inner text readable */
const GLASS_SHELL =
  "border-2 border-[#A07850]/55 bg-[linear-gradient(155deg,rgba(253,245,230,0.88)_0%,rgba(240,222,188,0.84)_100%)] shadow-[0_12px_32px_rgba(44,30,18,0.28),inset_0_1px_0_rgba(255,255,255,0.55)] backdrop-blur-[14px] [--webkit-backdrop-filter:blur(14px)]";

export function ParchmentCard({
  children,
  variant = "light",
  className,
  style,
  as: Tag = "div",
  ariaLabel,
}: ParchmentCardProps) {
  return (
    <Tag
      className={cn(BASE, variant === "light" ? LIGHT_SHELL : GLASS_SHELL, className)}
      style={style}
      aria-label={ariaLabel}
    >
      {/* Parchment texture overlay — pointer-events-none so content is fully interactive */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[22px]"
        style={{
          backgroundImage: "url('/textures/parchment-noise.png')",
          backgroundSize: "256px 256px",
          backgroundRepeat: "repeat",
          opacity: 0.08,
          mixBlendMode: "multiply",
        }}
      />
      {/* Top warm shimmer */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-16 rounded-t-[22px]"
        style={{
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.30), rgba(255,255,255,0))",
        }}
      />
      {/* Left rune accent — subtle gold stripe */}
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-5 left-[3px] top-5 w-[2px] rounded-full"
        style={{
          background:
            "linear-gradient(180deg, rgba(160,120,80,0) 0%, rgba(255,183,3,0.42) 30%, rgba(255,183,3,0.55) 50%, rgba(255,183,3,0.42) 70%, rgba(160,120,80,0) 100%)",
        }}
      />
      {/* Bottom dark vignette — grounds the card */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-10 rounded-b-[22px]"
        style={{
          background:
            "linear-gradient(0deg, rgba(44,30,18,0.07), rgba(44,30,18,0))",
        }}
      />
      {/* Content layer — above all overlays */}
      <div className="relative z-10">{children}</div>
    </Tag>
  );
}

import type { CSSProperties } from "react";

import { BookOpen, Check, Flag, Lock, Sparkles, Star, Zap } from "lucide-react";

import { cn } from "@/lib/utils";

export type RenderNodeStatus = "done" | "current" | "available" | "locked";

export type RenderableMapNode = {
  id: string;
  lessonId: number;
  skill: string;
  difficulty: string;
  completed: boolean;
  stars: number;
  title: string;
  subtitle?: string;
  xp?: number;
  status: RenderNodeStatus;
  isCheckpoint?: boolean;
};

type RenderNodeOptions = {
  node: RenderableMapNode;
  point: { x: number; y: number };
  prevPoint?: { x: number; y: number };
  nextPoint?: { x: number; y: number };
  nodeIndex: number;
  compactMobile: boolean;
  highlightedNodeId?: string;
  onNodeClick?: (node: RenderableMapNode) => void;
  quality: "low" | "high";
  reducedMotion?: boolean;
  enterProgress?: number;
  unlockBurstProgress?: number;
  canvasWidth?: number;
  /** Mobile: hides the side badge, only renders the clickable node button */
  hideBadge?: boolean;
};

// ─── Node types ──────────────────────────────────────────────────────────────

/** Internal mission category. Drives shape, icon, and halo color. */
type MissionKind = "lesson" | "story" | "challenge" | "checkpoint" | "boss";

/** Geometric shape applied via clip-path to the button body */
type NodeShape = "circle" | "hexagon" | "diamond" | "star";


function resolveMissionKind(node: RenderableMapNode): MissionKind {
  const title = node.title.toLowerCase();
  if (node.isCheckpoint || title.includes("checkpoint") || title.includes("marco")) return "checkpoint";
  if (title.includes("boss") || title.includes("chefe") || title.includes("final")) return "boss";
  if (title.includes("historia") || title.includes("contagem") || title.includes("sequencia")) return "story";
  if (title.includes("desafio") || title.includes("escolha") || title.includes("conexao")) return "challenge";
  return "lesson";
}

function getNodeShape(kind: MissionKind): NodeShape {
  if (kind === "challenge") return "hexagon";
  if (kind === "checkpoint") return "diamond";
  if (kind === "boss") return "star";
  return "circle";
}

/** Halo color — PROMPT 05: lesson=sky, challenge=amber, boss=violet, done=emerald, current=cyan */
function getHaloColor(status: RenderNodeStatus, kind: MissionKind): string {
  if (status === "done")    return "rgba(52,211,153,0.30)";     // emerald-400
  if (status === "current") return "rgba(6,182,212,0.35)";      // cyan-400
  if (kind === "challenge") return "rgba(251,191,36,0.32)";     // amber-400
  if (kind === "boss")      return "rgba(167,139,250,0.38)";    // violet-400
  if (kind === "checkpoint") return "rgba(110,231,183,0.28)";   // emerald-300
  return "rgba(56,189,248,0.28)";                                // sky-400 (lesson/story)
}

// ─── Node kind meta (icon, label, accent colors) ─────────────────────────────

function getMissionKindMeta(kind: MissionKind) {
  switch (kind) {
    case "story":
      return { label: "História",   accent: "rgba(255,190,133,0.92)", accentSoft: "rgba(255,122,47,0.16)",  glow: "0 0 18px rgba(255,122,47,0.18)",   Icon: Sparkles };
    case "challenge":
      return { label: "Desafio",    accent: "rgba(250,204,21,0.94)",  accentSoft: "rgba(251,191,36,0.18)",  glow: "0 0 20px rgba(250,204,21,0.24)",   Icon: Zap };
    case "checkpoint":
      return { label: "Marco",      accent: "rgba(110,231,183,0.94)", accentSoft: "rgba(52,211,153,0.18)",  glow: "0 0 18px rgba(16,185,129,0.18)",   Icon: Flag };
    case "boss":
      return { label: "Boss",       accent: "rgba(167,139,250,0.94)", accentSoft: "rgba(139,92,246,0.20)",  glow: "0 0 24px rgba(139,92,246,0.32)",   Icon: Star };
    default:
      return { label: "Lição",      accent: "rgba(255,163,94,0.94)",  accentSoft: "rgba(255,122,47,0.14)",  glow: "0 0 18px rgba(255,122,47,0.16)",   Icon: BookOpen };
  }
}

// ─── Visual shell by status ───────────────────────────────────────────────────

function getNodeVisuals(status: RenderNodeStatus, kind: MissionKind) {
  const kindMeta = getMissionKindMeta(kind);
  // Parchment base — shared by all statuses (badge always uses warm paper style)
  const PARCHMENT_BG     = "linear-gradient(155deg,rgba(253,245,230,0.97),rgba(240,222,188,0.94))";
  const PARCHMENT_BORDER = "rgba(160,120,80,0.55)";
  const PARCHMENT_TEXT   = "#2C1E16";
  const PARCHMENT_SHADOW = "0 4px 18px rgba(44,30,18,0.22), inset 0 1px 0 rgba(255,255,255,0.70)";

  if (status === "done") {
    return {
      gradient: "linear-gradient(160deg,#D1FAE5 0%,#6EE7B7 18%,#34D399 45%,#059669 78%,#064E3B 100%)",
      border: "2.5px solid rgba(167,243,208,0.90)",
      highlight: "linear-gradient(160deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.06) 60%)",
      labelBg: PARCHMENT_BG, labelBorder: PARCHMENT_BORDER, labelShadow: PARCHMENT_SHADOW, labelText: PARCHMENT_TEXT,
      accentA: "rgba(253,224,71,0.92)", accentB: "rgba(187,247,208,0.92)",
      kindAccent: kindMeta.accent, kindAccentSoft: kindMeta.accentSoft, kindGlow: kindMeta.glow,
    };
  }
  if (status === "current") {
    return {
      gradient: "linear-gradient(160deg,#FEF9C3 0%,#FDE68A 18%,#FBBF24 42%,#F59E0B 68%,#B45309 100%)",
      border: "2.5px solid rgba(253,224,71,0.92)",
      highlight: "linear-gradient(160deg, rgba(255,255,255,0.62) 0%, rgba(255,255,255,0.06) 60%)",
      labelBg: PARCHMENT_BG, labelBorder: PARCHMENT_BORDER, labelShadow: PARCHMENT_SHADOW, labelText: PARCHMENT_TEXT,
      accentA: "rgba(255,246,236,0.96)", accentB: "rgba(241,197,107,0.86)",
      kindAccent: kindMeta.accent, kindAccentSoft: kindMeta.accentSoft, kindGlow: kindMeta.glow,
    };
  }
  if (status === "available") {
    return {
      gradient: "linear-gradient(160deg,#CCFBF1 0%,#5EEAD4 18%,#14B8A6 45%,#0F766E 78%,#134E4A 100%)",
      border: "2.5px solid rgba(94,234,212,0.88)",
      highlight: "linear-gradient(160deg, rgba(255,255,255,0.52) 0%, rgba(255,255,255,0.06) 60%)",
      labelBg: PARCHMENT_BG, labelBorder: PARCHMENT_BORDER, labelShadow: PARCHMENT_SHADOW, labelText: PARCHMENT_TEXT,
      accentA: "rgba(240,253,250,0.96)", accentB: "rgba(167,243,208,0.88)",
      kindAccent: kindMeta.accent, kindAccentSoft: kindMeta.accentSoft, kindGlow: kindMeta.glow,
    };
  }
  // locked — solid stone with clear silhouette
  return {
    gradient: "linear-gradient(160deg,#E2E8F0 0%,#94A3B8 30%,#64748B 65%,#334155 100%)",
    border: "2px dashed rgba(148,163,184,0.65)",
    highlight: "linear-gradient(160deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.03) 60%)",
    labelBg: "linear-gradient(155deg,rgba(220,210,195,0.92),rgba(200,185,165,0.86))",
    labelBorder: "rgba(160,120,80,0.30)",
    labelShadow: "0 4px 12px rgba(44,30,18,0.14)",
    labelText: "#7A6050",
    accentA: "rgba(203,213,225,0.80)", accentB: "rgba(148,163,184,0.70)",
    kindAccent: "rgba(148,163,184,0.85)", kindAccentSoft: "rgba(148,163,184,0.12)", kindGlow: "none",
  };
}

// ─── Layout constants ─────────────────────────────────────────────────────────

/** #4 — Node size hierarchy by status */
function getNodeSize(status: RenderNodeStatus): number {
  if (status === "current") return 74;
  if (status === "locked")  return 58;
  return 68; // done + available
}

const CONNECTOR_GAP_PX = 52; // fixed gap between node edge and badge
const BADGE_WIDTH_EST  = 200;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - edge0) / Math.max(0.0001, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

const statusLabel: Record<RenderNodeStatus, string> = {
  done: "Concluída",
  current: "Atual",
  available: "Desbloqueada",
  locked: "Bloqueada",
};

const difficultyPt: Record<string, string> = {
  easy: "Fácil",
  medium: "Médio",
  hard: "Difícil",
};
function translateDifficulty(d: string): string {
  return difficultyPt[d.toLowerCase()] ?? d;
}
function renderStars(filled: number, total = 3): string {
  const safe = Math.max(0, Math.min(total, filled));
  return "★".repeat(safe) + "☆".repeat(total - safe);
}

const TEXT_MUTED = "#7A5C3A";

// ─── Item 5: SVG-native shapes for perfect AA ────────────────────────────────

const SVG_POINTS: Record<"hexagon" | "diamond" | "star", string> = {
  hexagon: "50,2 98,26.5 98,73.5 50,98 2,73.5 2,26.5",
  diamond: "50,2 98,50 50,98 2,50",
  star:    "50,2 61,35 98,35 68,57 79,91 50,70 21,91 32,57 2,35 39,35",
};

function getGradientStops(status: RenderNodeStatus) {
  if (status === "current") return [
    { offset: "0%",   color: "#FEF9C3" }, { offset: "18%",  color: "#FDE68A" },
    { offset: "42%",  color: "#FBBF24" }, { offset: "68%",  color: "#F59E0B" },
    { offset: "100%", color: "#B45309" },
  ];
  if (status === "done") return [
    { offset: "0%",   color: "#D1FAE5" }, { offset: "18%",  color: "#6EE7B7" },
    { offset: "45%",  color: "#34D399" }, { offset: "78%",  color: "#059669" },
    { offset: "100%", color: "#064E3B" },
  ];
  if (status === "available") return [
    { offset: "0%",   color: "#CCFBF1" }, { offset: "18%",  color: "#5EEAD4" },
    { offset: "45%",  color: "#14B8A6" }, { offset: "78%",  color: "#0F766E" },
    { offset: "100%", color: "#134E4A" },
  ];
  return [
    { offset: "0%",   color: "#E2E8F0" }, { offset: "30%",  color: "#94A3B8" },
    { offset: "65%",  color: "#64748B" }, { offset: "100%", color: "#334155" },
  ];
}

function getSvgStroke(status: RenderNodeStatus): { color: string; width: number } {
  if (status === "current")   return { color: "rgba(253,224,71,0.92)",   width: 2.5 };
  if (status === "done")      return { color: "rgba(167,243,208,0.90)",  width: 2.5 };
  if (status === "available") return { color: "rgba(94,234,212,0.88)",   width: 2.5 };
  return                               { color: "rgba(148,163,184,0.65)", width: 2.0 };
}

function SvgNodeShape({ uid, shape, size, status, isLocked }: {
  uid: string;
  shape: "hexagon" | "diamond" | "star";
  size: number;
  status: RenderNodeStatus;
  isLocked: boolean;
}) {
  const stops  = getGradientStops(status);
  const stroke = getSvgStroke(status);
  const pts    = SVG_POINTS[shape];

  return (
    <svg
      width={size} height={size} viewBox="0 0 100 100"
      aria-hidden
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", zIndex: 10, pointerEvents: "none" }}
    >
      <defs>
        <linearGradient id={`${uid}-g`} x1="25%" y1="0%" x2="75%" y2="100%">
          {stops.map((s, i) => <stop key={i} offset={s.offset} stopColor={s.color} />)}
        </linearGradient>
        <linearGradient id={`${uid}-hl`} x1="0%" y1="0%" x2="10%" y2="100%">
          <stop offset="0%"  stopColor="rgba(255,255,255,0.50)" />
          <stop offset="55%" stopColor="rgba(255,255,255,0.00)" />
        </linearGradient>
        <linearGradient id={`${uid}-dp`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="50%"  stopColor="rgba(0,0,0,0.00)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.28)" />
        </linearGradient>
        <clipPath id={`${uid}-cp`}><polygon points={pts} /></clipPath>
      </defs>

      {/* Drop shadow */}
      <polygon points={pts} fill="rgba(0,0,0,0.24)" transform="translate(0,3.5)" style={{ filter: "blur(3px)" }} />

      {/* Main fill */}
      <polygon points={pts} fill={`url(#${uid}-g)`} stroke={stroke.color} strokeWidth={stroke.width} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />

      {/* Specular top-left overlay */}
      <polygon points={pts} fill={`url(#${uid}-hl)`} vectorEffect="non-scaling-stroke" />

      {/* Bottom depth overlay */}
      <polygon points={pts} fill={`url(#${uid}-dp)`} vectorEffect="non-scaling-stroke" />

      {/* Gem gleam — clipped inside shape */}
      {!isLocked ? (
        <g clipPath={`url(#${uid}-cp)`}>
          <ellipse cx="30" cy="20" rx="20" ry="11" fill="rgba(255,255,255,0.72)"
            transform="rotate(-18,30,20)" style={{ filter: "blur(1.2px)" }} />
          <ellipse cx="62" cy="18" rx="8" ry="5" fill="rgba(255,255,255,0.48)" />
        </g>
      ) : null}
    </svg>
  );
}

// ─── MapNodeItem ──────────────────────────────────────────────────────────────

function MapNodeItem({
  node,
  isActive,
  canvasWidth,
  compactMobile,
  point,
  prevPoint,
  nextPoint,
  nodeIndex,
  onClick,
  quality,
  reducedMotion,
  hideBadge,
}: {
  node: RenderableMapNode;
  isActive: boolean;
  canvasWidth: number;
  compactMobile: boolean;
  point: { x: number; y: number };
  prevPoint?: { x: number; y: number };
  nextPoint?: { x: number; y: number };
  nodeIndex: number;
  onClick?: () => void;
  quality: "low" | "high";
  reducedMotion?: boolean;
  hideBadge?: boolean;
}) {
  const isCurrent   = node.status === "current";
  const isAvailable = node.status === "available";
  const isLocked    = node.status === "locked";
  const isDone      = node.status === "done";

  const missionKind = resolveMissionKind(node);
  const missionMeta = getMissionKindMeta(missionKind);
  const visuals     = getNodeVisuals(node.status, missionKind);
  const nodeShape   = getNodeShape(missionKind);
  const MissionIcon = missionMeta.Icon;
  const showOrbital = isActive;
  const haloColor   = getHaloColor(node.status, missionKind);

  // #4 — Dynamic size by status
  const nodeSize = getNodeSize(node.status);
  const nodeHalf = nodeSize / 2;
  const badgeOffset   = nodeHalf + CONNECTOR_GAP_PX;
  const connectorLen  = CONNECTOR_GAP_PX;

  // CSS classes
  const statusClass = isDone ? "ax-node-completed" : isCurrent ? "ax-node-current" : isLocked ? "ax-node-locked" : "ax-node-available";
  const kindClass   = `ax-node-${missionKind}`;

  const hoverableClasses = reducedMotion
    ? "transition-opacity duration-200"
    : "transition-transform duration-200 active:scale-105 hover:-translate-y-[2px] hover:scale-[1.08]";

  const ringPrimaryOpacityClass   = isCurrent ? "opacity-[0.72] group-hover:opacity-[0.84]" : isAvailable ? "opacity-[0.56] group-hover:opacity-[0.66]" : "opacity-[0.40] group-hover:opacity-[0.52]";
  const ringSecondaryOpacityClass = isCurrent ? "opacity-[0.54] group-hover:opacity-[0.66]" : isAvailable ? "opacity-[0.38] group-hover:opacity-[0.48]" : "opacity-[0.28] group-hover:opacity-[0.40]";

  const ring1Style = { width: nodeSize + 10, height: nodeSize + 10 } satisfies CSSProperties;
  const ring2Style = { width: nodeSize + 28, height: nodeSize + 28 } satisfies CSSProperties;

  const badgeOffsetY = 0;
  const sideX: 1 | -1 = nodeIndex % 2 === 0 ? -1 : 1;

  const badgeAnchorStyle: CSSProperties = sideX > 0 ? { left: "50%" } : { right: "50%" };
  const badgeTranslateX = sideX > 0 ? `${badgeOffset}px` : `-${badgeOffset}px`;
  const connectorLeft   = sideX > 0
    ? `calc(50% + ${nodeHalf}px)`
    : `calc(50% - ${badgeOffset}px)`;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    /**
     * Wrapper — explicit 56×56 so absolute children position relative to the
     * node bounds.  Decorative elements (halos, sparkles, orbital rings) live
     * here so they are NOT clipped by the button's clip-path.
     */
    <div
      className={cn("group relative ax-node", kindClass, statusClass)}
      style={{
        width: nodeSize,
        height: nodeSize,
        transform: "translateZ(0)",
        willChange: "transform",
      }}
      role="group"
    >
      {/* ── HALO — PROMPT 05: radius +10px, type-specific color ── */}
      {!isLocked ? (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute rounded-full",
            !reducedMotion && isCurrent ? "animate-[pulse_2.4s_ease-in-out_infinite]" : "",
          )}
          style={{
            inset: "-10px",  // +10px from node edge per spec
            background: `radial-gradient(circle, ${haloColor} 30%, transparent 72%)`,
            filter: "blur(4px)",
          }}
        />
      ) : null}

      {/* ── ORBITAL RINGS (active node) ── */}
      {showOrbital ? (
        <>
          {!reducedMotion ? <span aria-hidden className="active-halo" /> : null}
          <span aria-hidden className={cn("orbital-ring", "orbital-ring-1", "orbital-ring-dot-lg", ringPrimaryOpacityClass)} style={ring1Style} />
          <span aria-hidden className={cn("orbital-ring", "orbital-ring-2", "orbital-ring-dot-sm", ringSecondaryOpacityClass)} style={ring2Style} />
        </>
      ) : null}

      {/* ── DONE: sparkle dots ── */}
      {isDone ? (
        <>
          <span aria-hidden className="pointer-events-none absolute left-[-6px] top-[4px] h-[6px] w-[6px] rounded-full" style={{ background: visuals.accentA, boxShadow: "0 0 8px rgba(250,204,21,0.55)" }} />
          <span aria-hidden className="pointer-events-none absolute right-[-7px] top-[10px] h-[5px] w-[5px] rounded-full" style={{ background: visuals.accentB, boxShadow: "0 0 8px rgba(187,247,208,0.48)" }} />
        </>
      ) : null}

      {/* ── CURRENT: pulse sparkles ── */}
      {isCurrent ? (
        <>
          <span aria-hidden className={cn("pointer-events-none absolute left-[-8px] top-[7px] h-[7px] w-[7px] rounded-full", !reducedMotion ? "animate-[pulse_2.1s_ease-in-out_infinite]" : "")} style={{ background: visuals.accentA, boxShadow: "0 0 10px rgba(255,190,133,0.48)" }} />
          <span aria-hidden className={cn("pointer-events-none absolute right-[-8px] top-[5px] h-[6px] w-[6px] rounded-full", !reducedMotion ? "animate-[pulse_2.8s_ease-in-out_infinite]" : "")} style={{ background: visuals.accentB, boxShadow: "0 0 10px rgba(255,122,47,0.4)" }} />
          <span aria-hidden className={cn("pointer-events-none absolute left-1/2 top-[-8px] h-[5px] w-[5px] -translate-x-1/2 rounded-full bg-white/95", !reducedMotion ? "animate-[pulse_1.8s_ease-in-out_infinite]" : "")} style={{ boxShadow: "0 0 12px rgba(255,255,255,0.62)" }} />
        </>
      ) : null}

      {/* ── CURRENT: conic sweep + pulse ring + border ring ── */}
      {isCurrent ? (
        <>
          <span
            aria-hidden
            className={cn("pointer-events-none absolute inset-[-16px]", !reducedMotion ? "animate-[spin_16s_linear_infinite]" : "")}
            style={{
              background: "conic-gradient(from 90deg, rgba(255,255,255,0) 0deg, rgba(255,190,133,0.24) 38deg, rgba(255,255,255,0) 72deg, rgba(255,255,255,0) 360deg)",
              maskImage: "radial-gradient(circle, transparent 54%, black 64%, transparent 74%)",
              WebkitMaskImage: "radial-gradient(circle, transparent 54%, black 64%, transparent 74%)",
            }}
          />
          <span aria-hidden className={cn("pointer-events-none absolute inset-[-10px] rounded-full border border-[#FFBE85]/28", !reducedMotion ? "animate-[pulse_2.6s_ease-out_infinite]" : "")} />
          <span aria-hidden className="pointer-events-none absolute inset-[-4px] rounded-full shadow-[0_0_20px_rgba(255,122,47,0.2)]" />
        </>
      ) : null}

      {/* ── DONE: glow shadow ring ── */}
      {isDone ? (
        <span aria-hidden className="pointer-events-none absolute inset-[-3px] rounded-full shadow-[0_0_18px_rgba(16,185,129,0.22)]" />
      ) : null}

      {/* ── Item 5: SVG shape for non-circles (perfect AA) ── */}
      {nodeShape !== "circle" ? (
        <SvgNodeShape
          uid={`node-${node.id}`}
          shape={nodeShape}
          size={nodeSize}
          status={node.status}
          isLocked={isLocked}
        />
      ) : null}

      {/* ── NODE BUTTON ── */}
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "absolute inset-0 z-20 flex items-center justify-center",
          nodeShape === "circle" ? "overflow-hidden rounded-full" : "overflow-visible bg-transparent",
          isCurrent && !reducedMotion ? "pulse-current" : "",
          isDone    && !reducedMotion ? "pulse-soft"    : "",
          hoverableClasses,
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400",
        )}
        style={{
          // Circle: full visual on button. Non-circle: transparent — SVG handles visual
          background:  nodeShape === "circle" ? visuals.gradient : "transparent",
          border:      nodeShape === "circle" ? visuals.border   : "none",
          borderRadius: nodeShape === "circle" ? "50%" : undefined,
          transform: "translateZ(0)",
          backfaceVisibility: "hidden",
          WebkitBackfaceVisibility: "hidden",
          cursor: "pointer",
          transition: "transform 220ms ease, opacity 200ms ease",
          boxShadow: nodeShape === "circle"
            ? "inset 0 2px 6px rgba(255,255,255,0.45), inset 0 -3px 8px rgba(0,0,0,0.28)"
            : undefined,
        }}
        aria-current={isActive ? "step" : undefined}
        aria-label={`Abrir missão ${node.title} · ${missionMeta.label} · ${statusLabel[node.status]}`}
        title={node.title}
      >
        {/* Circle-only layers (SVG handles non-circles) */}
        {nodeShape === "circle" ? (
          <>
            <span aria-hidden className="pointer-events-none absolute" style={{ inset: "3px", background: visuals.highlight, borderRadius: "50%" }} />
            <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(0deg,rgba(0,0,0,0.22) 0%,transparent 52%)", borderRadius: "50%" }} />
            {!isLocked && <span aria-hidden className="pointer-events-none absolute" style={{ top:"10%", left:"12%", width:"42%", height:"26%", background:"radial-gradient(ellipse at 35% 40%,rgba(255,255,255,0.82),rgba(255,255,255,0.18) 55%,transparent 80%)", borderRadius:"50%", transform:"rotate(-18deg)", filter:"blur(0.8px)", zIndex:12 }} />}
            {!isLocked && <span aria-hidden className="pointer-events-none absolute" style={{ top:"18%", left:"58%", width:"16%", height:"10%", background:"radial-gradient(ellipse,rgba(255,255,255,0.55),transparent 70%)", borderRadius:"50%", zIndex:12 }} />}
          </>
        ) : null}

        {/* Icons — always on top */}
        {isDone   ? <Check      className="relative z-10 h-8 w-8"       strokeWidth={2.8} aria-hidden style={{ color:"rgba(255,255,255,0.96)", filter:"drop-shadow(0 1px 4px rgba(0,0,0,0.55))" }} /> : null}
        {isLocked ? <Lock       className="relative z-10 h-[26px] w-[26px]" strokeWidth={2.1} aria-hidden style={{ color:"rgba(203,213,225,0.88)", filter:"drop-shadow(0 1px 3px rgba(0,0,0,0.50))" }} /> : null}
        {!isDone && !isLocked ? <MissionIcon className="relative z-10 h-7 w-7" strokeWidth={2.3} aria-hidden style={{ color:"rgba(255,255,255,0.96)", filter:"drop-shadow(0 1px 4px rgba(0,0,0,0.50))" }} /> : null}

        {/* Checkpoint star badge */}
        {node.isCheckpoint ? (
          <span className="absolute -right-1 -top-1 z-20 inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/25 bg-[#18312E]/80 text-[#F3E7D8]">
            <Star className="h-2.5 w-2.5" strokeWidth={2} aria-hidden />
          </span>
        ) : null}
      </button>

      {/* ── CONNECTOR — PROMPT 03: slate-300, 2px, 0.6 opacity ── */}
      {!hideBadge ? (
        <span
          aria-hidden
          className="pointer-events-none absolute z-10"
          style={{
            top: "50%",
            left: connectorLeft,
            width: `${connectorLen}px`,
            height: 0,
            transform: "translateY(-50%)",
            borderTop: "2px solid rgba(160,120,80,0.55)",
            opacity: 1,
          }}
        />
      ) : null}

      {/* ── LABEL BADGE ── */}
      {!hideBadge ? (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-1/2 z-20 overflow-hidden rounded-2xl",
            "",
          )}
          style={{
            ...badgeAnchorStyle,
            transform: `translate(${badgeTranslateX}, calc(-50% + ${badgeOffsetY.toFixed(1)}px))`,
            background: visuals.labelBg,
            border: `1.5px solid ${visuals.labelBorder}`,
            boxShadow: visuals.labelShadow,
            minWidth: compactMobile ? "130px" : "160px",
            maxWidth: `${BADGE_WIDTH_EST}px`,
            transition: "box-shadow 200ms ease",
            textRendering: "geometricPrecision",
            WebkitFontSmoothing: "antialiased",
          }}
        >
          {/* Left accent stripe */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 w-[3px]"
            style={{ background: `linear-gradient(180deg, ${missionMeta.accent}, ${missionMeta.accent}44)` }}
          />

          <div className={cn("pl-3.5 pr-3", compactMobile ? "py-1.5" : "py-2.5")}>
            {/* Header: icon pill + type label */}
            <div className="mb-1.5 flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-flex items-center justify-center rounded-full p-[3.5px]"
                style={{ background: visuals.kindAccentSoft, boxShadow: `0 0 8px ${missionMeta.accent}33` }}
              >
                <MissionIcon className="h-[10px] w-[10px]" strokeWidth={2.6} style={{ color: missionMeta.accent }} aria-hidden />
              </span>
              <span className="text-[9px] font-black uppercase tracking-[0.14em]" style={{ color: missionMeta.accent }}>
                {missionMeta.label}
              </span>
            </div>

            {/* Title */}
            <p
              className={cn("font-bold leading-[1.22] tracking-[-0.015em]", compactMobile ? "text-[11px]" : "text-[13px]")}
              style={{ color: visuals.labelText }}
            >
              {node.title}
            </p>

            {/* Footer: difficulty + stars */}
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <span
                className="rounded-full px-1.5 py-[2px] text-[9px] font-semibold uppercase tracking-[0.06em]"
                style={{ color: TEXT_MUTED, background: "rgba(160,120,80,0.10)", border: "1px solid rgba(160,120,80,0.25)" }}
              >
                {translateDifficulty(node.difficulty)}
              </span>
              <span className="shrink-0 text-[10px] leading-none" style={{ color: missionMeta.accent, opacity: 0.82, letterSpacing: "0.04em" }}>
                {renderStars(node.stars)}
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─── renderNode (public API) ──────────────────────────────────────────────────

export function renderNode({
  node,
  point,
  prevPoint,
  nextPoint,
  nodeIndex,
  compactMobile,
  highlightedNodeId,
  onNodeClick,
  quality,
  reducedMotion,
  enterProgress = 1,
  unlockBurstProgress = 0,
  canvasWidth = 0,
  hideBadge = false,
}: RenderNodeOptions) {
  const isActive = highlightedNodeId === node.id;
  const delay = nodeIndex * 0.03;
  const nodeAppear = smoothstep(delay, delay + 0.25, enterProgress);
  const scale = 0.92 + (1 - 0.92) * nodeAppear;

  const burstA = 0.9 + 0.45 * unlockBurstProgress;
  const burstB = 1 + 0.55 * unlockBurstProgress;
  const burstAOpacity = (1 - unlockBurstProgress) * 0.9;
  const burstBOpacity = (1 - unlockBurstProgress) * 0.7;

  const isLocked    = node.status === "locked";
  const statusScale = isLocked ? 0.86 : node.status === "current" ? 1.04 : 1.0;
  const statusOpacity = isLocked ? 0.70 : 1.0;
  const glowAlphaA = isLocked ? 0 : 0.16 + nodeAppear * 0.16;
  const glowAlphaB = isLocked ? 0 : 0.05 + nodeAppear * 0.08;

  return (
    <div
      key={node.id}
      id={`map-node-${node.id}`}
      data-progression-node="true"
      data-node-type={resolveMissionKind(node)}
      data-node-status={node.status}
      className="absolute z-20"
      style={{
        left: point.x,
        top: point.y,
        transform: `translate(-50%, -50%) scale(${scale * statusScale})`,
        opacity: nodeAppear * statusOpacity,
        filter: node.status === "current"
          ? `drop-shadow(0 0 ${10 + nodeAppear * 12}px rgba(251,191,36,0.85)) drop-shadow(0 3px ${18 + nodeAppear * 10}px rgba(245,158,11,0.60)) drop-shadow(0 1px 2px rgba(0,0,0,0.30))`
          : node.status === "done"
          ? `drop-shadow(0 0 ${8 + nodeAppear * 8}px rgba(52,211,153,0.72)) drop-shadow(0 3px ${14 + nodeAppear * 8}px rgba(16,185,129,0.52)) drop-shadow(0 1px 2px rgba(0,0,0,0.28))`
          : node.status === "available"
          ? `drop-shadow(0 0 ${6 + nodeAppear * 6}px rgba(20,184,166,0.60)) drop-shadow(0 3px ${12 + nodeAppear * 6}px rgba(15,118,110,0.42)) drop-shadow(0 1px 2px rgba(0,0,0,0.28))`
          : `drop-shadow(0 2px 8px rgba(0,0,0,0.45)) drop-shadow(0 1px 2px rgba(0,0,0,0.30))`,
        transition: "transform 160ms linear, opacity 160ms linear, filter 160ms linear",
      }}
    >
      <div className="relative flex flex-col items-center">
        {/* Unlock burst rings */}
        {unlockBurstProgress > 0 ? (
          <>
            <span aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[84px] w-[84px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#FFBE85]/70" style={{ transform: `translate(-50%, -50%) scale(${burstA})`, opacity: burstAOpacity }} />
            <span aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[84px] w-[84px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#4F9D8A]/55" style={{ transform: `translate(-50%, -50%) scale(${burstB})`, opacity: burstBOpacity }} />
          </>
        ) : null}

        <MapNodeItem
          node={node}
          isActive={isActive}
          canvasWidth={canvasWidth}
          compactMobile={compactMobile}
          point={point}
          prevPoint={prevPoint}
          nextPoint={nextPoint}
          nodeIndex={nodeIndex}
          onClick={() => onNodeClick?.(node)}
          quality={quality}
          reducedMotion={reducedMotion}
          hideBadge={hideBadge}
        />
      </div>
    </div>
  );
}

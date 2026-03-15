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
};

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
function translateDifficulty(difficulty: string): string {
  return difficultyPt[difficulty.toLowerCase()] ?? difficulty;
}
function renderStars(filled: number, total = 3): string {
  const safe = Math.max(0, Math.min(total, filled));
  return "★".repeat(safe) + "☆".repeat(total - safe);
}

const TEXT_PRIMARY = "rgba(255,246,236,0.94)";
const TEXT_MUTED = "rgba(231,220,205,0.68)";
type MissionKind = "story" | "challenge" | "checkpoint" | "lesson";

function resolveMissionKind(node: RenderableMapNode): MissionKind {
  const title = node.title.toLowerCase();
  if (node.isCheckpoint || title.includes("checkpoint") || title.includes("marco")) return "checkpoint";
  if (title.includes("historia") || title.includes("contagem") || title.includes("sequencia")) return "story";
  if (title.includes("desafio") || title.includes("escolha") || title.includes("conexao")) return "challenge";
  return "lesson";
}

function getMissionKindMeta(kind: MissionKind) {
  if (kind === "story") {
    return {
      label: "História",
      accent: "rgba(255,190,133,0.92)",
      accentSoft: "rgba(255,122,47,0.16)",
      glow: "0 0 18px rgba(255,122,47,0.18)",
      Icon: Sparkles,
    };
  }
  if (kind === "challenge") {
    return {
      label: "Desafio",
      accent: "rgba(250,204,21,0.94)",
      accentSoft: "rgba(251,191,36,0.18)",
      glow: "0 0 18px rgba(250,204,21,0.2)",
      Icon: Zap,
    };
  }
  if (kind === "checkpoint") {
    return {
      label: "Marco",
      accent: "rgba(110,231,183,0.94)",
      accentSoft: "rgba(52,211,153,0.18)",
      glow: "0 0 18px rgba(16,185,129,0.18)",
      Icon: Flag,
    };
  }
  return {
    label: "Lição",
    accent: "rgba(255,163,94,0.94)",
    accentSoft: "rgba(255,122,47,0.14)",
    glow: "0 0 18px rgba(255,122,47,0.16)",
    Icon: BookOpen,
  };
}

function getNodeVisuals(status: RenderNodeStatus, kind: MissionKind) {
  const kindMeta = getMissionKindMeta(kind);
  if (status === "done") {
    return {
      shell: "border-2 border-emerald-50 bg-[linear-gradient(180deg,#86efac_0%,#34d399_42%,#16a34a_82%,#facc15_118%)] text-white shadow-[0_14px_32px_rgba(34,197,94,0.38),0_0_24px_rgba(250,204,21,0.28)]",
      shellHighlight: "linear-gradient(180deg, rgba(255,255,255,0.42), rgba(255,255,255,0.08))",
      // Translucent glass label — blur shows background
      labelBg: "linear-gradient(160deg, rgba(10,28,20,0.80), rgba(7,19,13,0.80))",
      labelBorder: "rgba(253,224,71,0.38)",
      labelShadow: "0 14px 30px rgba(2,10,6,0.62), 0 0 22px rgba(250,204,21,0.22)",
      labelText: "rgba(247,254,231,0.98)",
      accentA: "rgba(253,224,71,0.92)",
      accentB: "rgba(187,247,208,0.92)",
      kindAccent: kindMeta.accent,
      kindAccentSoft: kindMeta.accentSoft,
      kindGlow: kindMeta.glow,
    };
  }
  if (status === "current") {
    return {
      shell: "border-2 border-[#FFF3E5] bg-[linear-gradient(180deg,#FFBE85_0%,#FF9A48_34%,#4F9D8A_72%,#24433F_118%)] text-white shadow-[0_16px_36px_rgba(255,122,47,0.40),0_0_28px_rgba(255,154,72,0.32)]",
      shellHighlight: "linear-gradient(180deg, rgba(255,255,255,0.48), rgba(255,255,255,0.08))",
      labelBg: "linear-gradient(160deg, rgba(22,46,42,0.82), rgba(14,30,28,0.82))",
      labelBorder: "rgba(255,190,133,0.40)",
      labelShadow: "0 16px 34px rgba(6,16,14,0.62), 0 0 24px rgba(255,122,47,0.28)",
      labelText: "rgba(255,246,236,0.98)",
      accentA: "rgba(255,246,236,0.96)",
      accentB: "rgba(241,197,107,0.86)",
      kindAccent: kindMeta.accent,
      kindAccentSoft: kindMeta.accentSoft,
      kindGlow: kindMeta.glow,
    };
  }
  if (status === "available") {
    return {
      shell: "border-2 border-[#D9F3EE] bg-[linear-gradient(180deg,#8EE3D2_0%,#4F9D8A_34%,#285C56_76%,#193533_118%)] text-white shadow-[0_14px_30px_rgba(40,92,86,0.38),0_0_22px_rgba(79,157,138,0.28)]",
      shellHighlight: "linear-gradient(180deg, rgba(255,255,255,0.38), rgba(255,255,255,0.07))",
      labelBg: "linear-gradient(160deg, rgba(14,38,35,0.80), rgba(8,22,20,0.80))",
      labelBorder: "rgba(142,227,210,0.35)",
      labelShadow: "0 12px 28px rgba(2,10,9,0.58), 0 0 20px rgba(79,157,138,0.20)",
      labelText: "rgba(240,253,250,0.98)",
      accentA: "rgba(240,253,250,0.96)",
      accentB: "rgba(167,243,208,0.88)",
      kindAccent: kindMeta.accent,
      kindAccentSoft: kindMeta.accentSoft,
      kindGlow: kindMeta.glow,
    };
  }
  // locked — subdued glass, visually recessed
  return {
    shell: "border border-dashed border-white/22 bg-[linear-gradient(180deg,rgba(80,96,116,0.55),rgba(40,52,70,0.65))] text-white/80 shadow-[0_6px_16px_rgba(10,16,30,0.22)]",
    shellHighlight: "linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.02))",
    labelBg: "linear-gradient(160deg, rgba(8,14,28,0.74), rgba(5,9,20,0.74))",
    labelBorder: "rgba(148,163,184,0.20)",
    labelShadow: "0 8px 18px rgba(2,6,16,0.48)",
    labelText: "rgba(185,200,220,0.88)",
    accentA: "rgba(185,200,220,0.65)",
    accentB: "rgba(130,148,172,0.65)",
    kindAccent: kindMeta.accent,
    kindAccentSoft: "rgba(255,255,255,0.06)",
    kindGlow: "none",
  };
}

// NODE_HALF_PX must match the h-14 w-14 button (56px / 2 = 28px)
const NODE_HALF_PX = 28;
// Badge offset from node center (user spec: BADGE_OFFSET = 70)
const BADGE_OFFSET_PX = 70;
// Connector spans from node edge to badge start
const CONNECTOR_LENGTH = BADGE_OFFSET_PX - NODE_HALF_PX; // 42px
// Estimated badge width for viewport clamping
const BADGE_WIDTH_EST = 200;

function MapNodeItem({
  node,
  isActive,
  canvasWidth,
  compactMobile,
  point,
  prevPoint,
  nextPoint,
  onClick,
  quality,
  reducedMotion,
}: {
  node: RenderableMapNode;
  isActive: boolean;
  canvasWidth: number;
  compactMobile: boolean;
  point: { x: number; y: number };
  prevPoint?: { x: number; y: number };
  nextPoint?: { x: number; y: number };
  onClick?: () => void;
  quality: "low" | "high";
  reducedMotion?: boolean;
}) {
  const isCurrent = node.status === "current";
  const isAvailable = node.status === "available";
  const isLocked = node.status === "locked";
  const isDone = node.status === "done";
  const missionKind = resolveMissionKind(node);
  const missionMeta = getMissionKindMeta(missionKind);
  const visuals = getNodeVisuals(node.status, missionKind);
  const MissionIcon = missionMeta.Icon;
  const showOrbital = isActive;

  const ringPrimaryOpacityClass = isCurrent
    ? "opacity-[0.72] group-hover:opacity-[0.84]"
    : isAvailable
      ? "opacity-[0.56] group-hover:opacity-[0.66]"
      : "opacity-[0.40] group-hover:opacity-[0.52]";
  const ringSecondaryOpacityClass = isCurrent
    ? "opacity-[0.54] group-hover:opacity-[0.66]"
    : isAvailable
      ? "opacity-[0.38] group-hover:opacity-[0.48]"
      : "opacity-[0.28] group-hover:opacity-[0.40]";
  const hoverableClasses = reducedMotion
    ? "transition-opacity duration-200"
    : "transition-transform duration-200 active:scale-105 hover:-translate-y-[2px] hover:scale-[1.12] hover:shadow-[0_0_18px_rgba(255,122,47,0.35)]";

  const ring1Style = { width: 60, height: 60 } satisfies CSSProperties;
  const ring2Style = { width: 76, height: 76 } satisfies CSSProperties;

  // Tangent-based Y offset for smooth label alignment along path curves
  const segmentStart = prevPoint ?? point;
  const segmentEnd = nextPoint ?? point;
  const tangentX = segmentEnd.x - segmentStart.x;
  const tangentY = segmentEnd.y - segmentStart.y;
  const tangentLength = Math.hypot(tangentX, tangentY) || 1;
  let normalX = -tangentY / tangentLength;
  let normalY = tangentX / tangentLength;
  if (normalX < 0) { normalX *= -1; normalY *= -1; }
  const badgeOffsetY = Math.max(-6, Math.min(6, normalY * 8));

  // Base side: node on LEFT half → label RIGHT, node on RIGHT half → label LEFT
  let sideX = canvasWidth > 0 && point.x >= canvasWidth / 2 ? -1 : 1;

  // Viewport clamping (item 7): prevent badge from leaving the canvas bounds
  if (canvasWidth > 0) {
    const badgeXRight = point.x + BADGE_OFFSET_PX;
    const badgeXLeft  = point.x - BADGE_OFFSET_PX - BADGE_WIDTH_EST;
    if (sideX > 0 && badgeXRight + BADGE_WIDTH_EST > canvasWidth - 40) sideX = -1;
    if (sideX < 0 && badgeXLeft < 40) sideX = 1;
  }

  // CSS anchor for the label's near edge
  const badgeAnchorStyle: CSSProperties =
    sideX > 0
      ? { left: "50%" }
      : { right: "50%" };

  const badgeTranslateX = sideX > 0
    ? `${BADGE_OFFSET_PX}px`
    : `-${BADGE_OFFSET_PX}px`;

  // Connector: spans from node edge to badge near edge
  const connectorLeft =
    sideX > 0
      ? `calc(50% + ${NODE_HALF_PX}px)`
      : `calc(50% - ${BADGE_OFFSET_PX}px)`;

  return (
    <div
      className="group relative"
      role="group"
    >
      {/* ── Node button ── */}
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "relative z-20 flex h-14 w-14 items-center justify-center rounded-full",
          visuals.shell,
          isActive && !isCurrent ? "ring-2 ring-white/25 ring-offset-2 ring-offset-transparent" : "",
          isActive && !reducedMotion ? "animate-[pulse_2.8s_ease-in-out_infinite]" : "",
          hoverableClasses,
        )}
        style={{ transition: "transform 220ms ease, filter 220ms ease, opacity 200ms ease" }}
        aria-current={isActive ? "step" : undefined}
        aria-label={`Abrir missão ${node.title} · ${missionMeta.label} · ${statusLabel[node.status]}`}
      >
        {/* Inner highlight */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-[3px] rounded-full"
          style={{ background: visuals.shellHighlight }}
        />
        {/* Done: outer glow */}
        {isDone ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-[-6px] rounded-full"
            style={{ background: "radial-gradient(circle, rgba(110,231,183,0.18), rgba(16,185,129,0.02) 64%, transparent 72%)" }}
          />
        ) : null}
        {/* Current: outer glow */}
        {isCurrent ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-[-8px] rounded-full"
            style={{ background: "radial-gradient(circle, rgba(255,179,122,0.22), rgba(255,122,47,0.04) 62%, transparent 72%)" }}
          />
        ) : null}
        {/* Done: sparkle dots */}
        {isDone ? (
          <>
            <span aria-hidden className="pointer-events-none absolute left-[-6px] top-[4px] h-[6px] w-[6px] rounded-full" style={{ background: visuals.accentA, boxShadow: "0 0 8px rgba(250,204,21,0.55)" }} />
            <span aria-hidden className="pointer-events-none absolute right-[-7px] top-[10px] h-[5px] w-[5px] rounded-full" style={{ background: visuals.accentB, boxShadow: "0 0 8px rgba(187,247,208,0.48)" }} />
          </>
        ) : null}
        {/* Current: pulse sparkles */}
        {isCurrent ? (
          <>
            <span aria-hidden className={cn("pointer-events-none absolute left-[-8px] top-[7px] h-[7px] w-[7px] rounded-full", !reducedMotion ? "animate-[pulse_2.1s_ease-in-out_infinite]" : "")} style={{ background: visuals.accentA, boxShadow: "0 0 10px rgba(255,190,133,0.48)" }} />
            <span aria-hidden className={cn("pointer-events-none absolute right-[-8px] top-[5px] h-[6px] w-[6px] rounded-full", !reducedMotion ? "animate-[pulse_2.8s_ease-in-out_infinite]" : "")} style={{ background: visuals.accentB, boxShadow: "0 0 10px rgba(255,122,47,0.4)" }} />
            <span aria-hidden className={cn("pointer-events-none absolute left-1/2 top-[-8px] h-[5px] w-[5px] -translate-x-1/2 rounded-full bg-white/95", !reducedMotion ? "animate-[pulse_1.8s_ease-in-out_infinite]" : "")} style={{ boxShadow: "0 0 12px rgba(255,255,255,0.62)" }} />
          </>
        ) : null}
        {/* Active: orbital rings */}
        {showOrbital ? (
          <>
            {!reducedMotion ? <span aria-hidden className="active-halo" /> : null}
            <span aria-hidden className={cn("orbital-ring", "orbital-ring-1", "orbital-ring-dot-lg", ringPrimaryOpacityClass)} style={ring1Style} />
            <span aria-hidden className={cn("orbital-ring", "orbital-ring-2", "orbital-ring-dot-sm", ringSecondaryOpacityClass)} style={ring2Style} />
          </>
        ) : null}
        {/* Current: conic sweep */}
        {isCurrent ? (
          <span
            aria-hidden
            className={cn("pointer-events-none absolute inset-[-16px]", !reducedMotion ? "animate-[spin_16s_linear_infinite]" : "")}
            style={{
              background: "conic-gradient(from 90deg, rgba(255,255,255,0) 0deg, rgba(255,190,133,0.24) 38deg, rgba(255,255,255,0) 72deg, rgba(255,255,255,0) 360deg)",
              maskImage: "radial-gradient(circle, transparent 54%, black 64%, transparent 74%)",
              WebkitMaskImage: "radial-gradient(circle, transparent 54%, black 64%, transparent 74%)",
            }}
          />
        ) : null}
        {isCurrent ? <span aria-hidden className={cn("pointer-events-none absolute inset-[-10px] rounded-full border border-[#FFBE85]/28", !reducedMotion ? "animate-[pulse_2.6s_ease-out_infinite]" : "")} /> : null}
        {isDone ? <span aria-hidden className="pointer-events-none absolute inset-[-3px] rounded-full shadow-[0_0_18px_rgba(16,185,129,0.22)]" /> : null}
        {isCurrent ? <span aria-hidden className="pointer-events-none absolute inset-[-4px] rounded-full shadow-[0_0_20px_rgba(255,122,47,0.2)]" /> : null}
        {isCurrent ? <span aria-hidden className="pointer-events-none absolute inset-0 rounded-full border border-[#FFF3E5]/28" /> : null}
        {/* Universal halo for unlocked nodes (item 4) */}
        {!isLocked ? (
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute rounded-full border",
              isDone
                ? "inset-[-6px] border-emerald-300/30"
                : isCurrent
                  ? "inset-[-8px] border-[#FF9A48]/35"
                  : "inset-[-5px] border-teal-300/25",
              !reducedMotion && isCurrent
                ? "animate-[pulse_2.4s_ease-in-out_infinite]"
                : "",
            )}
          />
        ) : null}

        {/* Core icon */}
        {isDone ? <Check className="h-7 w-7" strokeWidth={2.6} aria-hidden /> : null}
        {isLocked ? <Lock className="h-[22px] w-[22px]" strokeWidth={2.2} aria-hidden /> : null}
        {!isDone && !isLocked ? <MissionIcon className="h-[22px] w-[22px]" strokeWidth={2.3} aria-hidden /> : null}

        {/* Checkpoint star badge */}
        {node.isCheckpoint ? (
          <span className="absolute -right-1 -top-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/25 bg-[#18312E]/80 text-[#F3E7D8]">
            <Star className="h-2.5 w-2.5" strokeWidth={2} aria-hidden />
          </span>
        ) : null}
      </button>

      {/* ── Connector: dashed line from node edge → badge (item 2) ── */}
      <span
        aria-hidden
        className="pointer-events-none absolute z-10"
        style={{
          top: "50%",
          left: connectorLeft,
          width: `${CONNECTOR_LENGTH}px`,
          height: 0,
          transform: "translateY(-50%)",
          borderTop: `2px dashed ${visuals.labelBorder}`,
          opacity: 0.70,
        }}
      />

      {/* ── Label badge ── */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-1/2 z-20 overflow-hidden rounded-2xl",
        )}
        style={{
          ...badgeAnchorStyle,
          transform: `translate(${badgeTranslateX}, calc(-50% + ${badgeOffsetY.toFixed(1)}px))`,
          background: visuals.labelBg,
          border: `1.5px solid ${visuals.labelBorder}`,
          boxShadow: `${visuals.labelShadow}, inset 0 1px 0 rgba(255,255,255,0.08)`,
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
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
          style={{
            background: `linear-gradient(180deg, ${missionMeta.accent}, ${missionMeta.accent}44)`,
          }}
        />

        <div className={cn("pl-3.5 pr-3", compactMobile ? "py-1.5" : "py-2.5")}>
          {/* Header: icon pill + type label */}
          <div className="mb-1.5 flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-flex items-center justify-center rounded-full p-[3.5px]"
              style={{
                background: visuals.kindAccentSoft,
                boxShadow: `0 0 8px ${missionMeta.accent}33`,
              }}
            >
              <MissionIcon
                className="h-[10px] w-[10px]"
                strokeWidth={2.6}
                style={{ color: missionMeta.accent }}
                aria-hidden
              />
            </span>
            <span
              className="text-[9px] font-black uppercase tracking-[0.14em]"
              style={{ color: missionMeta.accent }}
            >
              {missionMeta.label}
            </span>
          </div>

          {/* Title */}
          <p
            className={cn("font-bold leading-[1.22] tracking-[-0.015em]", compactMobile ? "text-[11px]" : "text-[13px]")}
            style={{ color: visuals.labelText, textShadow: "0 1px 8px rgba(2,6,23,0.5)" }}
          >
            {node.title}
          </p>

          {/* Footer: difficulty chip + stars */}
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <span
              className="rounded-full px-1.5 py-[2px] text-[9px] font-semibold uppercase tracking-[0.06em]"
              style={{ color: TEXT_MUTED, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              {translateDifficulty(node.difficulty)}
            </span>
            <span
              className="shrink-0 text-[10px] leading-none"
              style={{ color: missionMeta.accent, opacity: 0.82, letterSpacing: "0.04em" }}
            >
              {renderStars(node.stars)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

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
}: RenderNodeOptions) {
  const isActive = highlightedNodeId === node.id;
  const delay = nodeIndex * 0.03;
  const nodeAppear = smoothstep(delay, delay + 0.25, enterProgress);
  const scale = 0.92 + (1 - 0.92) * nodeAppear;
  const burstA = 0.9 + 0.45 * unlockBurstProgress;
  const burstB = 1 + 0.55 * unlockBurstProgress;
  const burstAOpacity = (1 - unlockBurstProgress) * 0.9;
  const burstBOpacity = (1 - unlockBurstProgress) * 0.7;

  // Locked nodes visually recede — smaller scale, dimmer, no glow halo
  const isLocked = node.status === "locked";
  const statusScale = isLocked ? 0.86 : node.status === "current" ? 1.04 : 1.0;
  const statusOpacity = isLocked ? 0.70 : 1.0;
  const glowAlphaA = isLocked ? 0 : 0.16 + nodeAppear * 0.16;
  const glowAlphaB = isLocked ? 0 : 0.05 + nodeAppear * 0.08;

  return (
    <div
      key={node.id}
      id={`map-node-${node.id}`}
      data-progression-node="true"
      className="absolute z-20"
      style={{
        left: point.x,
        top: point.y,
        transform: `translate(-50%, -50%) scale(${scale * statusScale})`,
        opacity: nodeAppear * statusOpacity,
        filter: `drop-shadow(0 0 ${4 + nodeAppear * 5}px rgba(56,189,248,${glowAlphaA})) drop-shadow(0 0 ${10 + nodeAppear * 8}px rgba(167,139,250,${glowAlphaB}))`,
        transition: "transform 160ms linear, opacity 160ms linear, filter 160ms linear",
      }}
    >
      <div className="relative flex flex-col items-center">
        {unlockBurstProgress > 0 ? (
          <>
            <span
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-1/2 h-[84px] w-[84px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#FFBE85]/70"
              style={{ transform: `translate(-50%, -50%) scale(${burstA})`, opacity: burstAOpacity }}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-1/2 h-[84px] w-[84px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#4F9D8A]/55"
              style={{ transform: `translate(-50%, -50%) scale(${burstB})`, opacity: burstBOpacity }}
            />
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
          onClick={() => onNodeClick?.(node)}
          quality={quality}
          reducedMotion={reducedMotion}
        />
      </div>
    </div>
  );
}

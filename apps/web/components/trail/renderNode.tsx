import type { CSSProperties } from "react";

import { Check, Lock, Star } from "lucide-react";

import { cn } from "@/lib/utils";

export type RenderNodeStatus = "done" | "current" | "locked";

export type RenderableMapNode = {
  id: string;
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
};

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - edge0) / Math.max(0.0001, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

const statusLabel: Record<RenderNodeStatus, string> = {
  done: "Concluída",
  current: "Atual",
  locked: "Bloqueada",
};
const TEXT_PRIMARY = "rgba(240,249,255,0.92)";
const TEXT_MUTED = "rgba(226,232,240,0.72)";

function getNodeVisuals(status: RenderNodeStatus) {
  if (status === "done") {
    return {
      shell: "border-2 border-emerald-50 bg-[linear-gradient(180deg,#86efac_0%,#34d399_42%,#16a34a_82%,#facc15_118%)] text-white shadow-[0_12px_28px_rgba(34,197,94,0.24),0_0_18px_rgba(250,204,21,0.18)]",
      shellHighlight: "linear-gradient(180deg, rgba(255,255,255,0.38), rgba(255,255,255,0.07))",
      starFill: "rgba(255,255,255,0.14)",
      starStroke: "rgba(254,252,232,0.98)",
      labelBg: "linear-gradient(180deg, rgba(13,33,24,0.95), rgba(9,24,17,0.95))",
      labelBorder: "rgba(253,224,71,0.26)",
      labelShadow: "0 10px 22px rgba(6,18,18,0.34), 0 0 16px rgba(250,204,21,0.18)",
      labelText: "rgba(247,254,231,0.96)",
      accentA: "rgba(253,224,71,0.92)",
      accentB: "rgba(187,247,208,0.92)",
    };
  }
  if (status === "current") {
    return {
      shell: "border-2 border-cyan-50 bg-[linear-gradient(180deg,#67e8f9_0%,#38bdf8_34%,#2563eb_74%,#8b5cf6_120%)] text-white shadow-[0_14px_30px_rgba(37,99,235,0.30),0_0_22px_rgba(103,232,249,0.22)]",
      shellHighlight: "linear-gradient(180deg, rgba(255,255,255,0.42), rgba(255,255,255,0.07))",
      starFill: "rgba(255,255,255,0.16)",
      starStroke: "rgba(239,246,255,0.99)",
      labelBg: "linear-gradient(180deg, rgba(8,24,52,0.96), rgba(13,22,49,0.96))",
      labelBorder: "rgba(192,132,252,0.24)",
      labelShadow: "0 12px 24px rgba(7,17,38,0.36), 0 0 18px rgba(56,189,248,0.24)",
      labelText: "rgba(240,249,255,0.96)",
      accentA: "rgba(255,255,255,0.96)",
      accentB: "rgba(192,132,252,0.86)",
    };
  }
  return {
    shell: "border border-slate-300/20 bg-[linear-gradient(180deg,rgba(100,116,139,0.62),rgba(51,65,85,0.72))] text-white shadow-[0_8px_18px_rgba(15,23,42,0.26)]",
    shellHighlight: "linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.02))",
    starFill: "rgba(255,255,255,0.05)",
    starStroke: "rgba(226,232,240,0.46)",
    labelBg: "linear-gradient(180deg, rgba(15,23,42,0.92), rgba(9,16,32,0.94))",
    labelBorder: "rgba(148,163,184,0.24)",
    labelShadow: "0 10px 18px rgba(8,15,30,0.28)",
    labelText: "rgba(226,232,240,0.9)",
    accentA: "rgba(203,213,225,0.7)",
    accentB: "rgba(148,163,184,0.72)",
  };
}

function MapNodeItem({ node, isActive, displayIndex, compactMobile, point, prevPoint, nextPoint, onClick, quality, reducedMotion }: {
  node: RenderableMapNode;
  isActive: boolean;
  displayIndex: number;
  compactMobile: boolean;
  point: { x: number; y: number };
  prevPoint?: { x: number; y: number };
  nextPoint?: { x: number; y: number };
  onClick?: () => void;
  quality: "low" | "high";
  reducedMotion?: boolean;
}) {
  const isCurrent = node.status === "current";
  const isLocked = node.status === "locked";
  const isDone = node.status === "done";
  const visuals = getNodeVisuals(node.status);
  const showOrbital = isActive;
  const ringPrimaryOpacityClass = isCurrent ? "opacity-[0.72] group-hover:opacity-[0.84]" : "opacity-[0.40] group-hover:opacity-[0.52]";
  const ringSecondaryOpacityClass = isCurrent ? "opacity-[0.54] group-hover:opacity-[0.66]" : "opacity-[0.28] group-hover:opacity-[0.40]";
  const hoverableClasses = reducedMotion
    ? "transition-opacity duration-200"
    : "transition-transform duration-200 active:scale-105 hover:-translate-y-[2px] hover:scale-[1.12] hover:shadow-[0_0_18px_rgba(56,189,248,0.55)]";
  const ring1Style = {
    width: 48,
    height: 48,
  } satisfies CSSProperties;
  const ring2Style = {
    width: 62,
    height: 62,
  } satisfies CSSProperties;

  const segmentStart = prevPoint ?? point;
  const segmentEnd = nextPoint ?? point;
  const tangentX = segmentEnd.x - segmentStart.x;
  const tangentY = segmentEnd.y - segmentStart.y;
  const tangentLength = Math.hypot(tangentX, tangentY) || 1;
  let normalX = -tangentY / tangentLength;
  let normalY = tangentX / tangentLength;
  if (normalX < 0) {
    normalX *= -1;
    normalY *= -1;
  }
  const sideX = displayIndex % 2 === 1 ? -1 : 1;
  const badgeAnchorClass = sideX > 0 ? "left-1/2" : "right-1/2";
  const badgeTranslateX = sideX > 0 ? "32px" : "-32px";
  const badgeOffsetY = Math.max(-6, Math.min(6, normalY * 8));

  return (
    <div className="group relative">
      <div className="pointer-events-none absolute -top-2 left-1/2 z-30 w-max max-w-[240px] -translate-x-1/2 -translate-y-full rounded-xl border border-white/12 bg-[rgba(6,16,34,0.88)] px-3 py-2 text-center text-[11px] text-white opacity-0 shadow-[0_4px_12px_rgba(0,0,0,0.18)] transition-opacity duration-150 group-hover:opacity-100">
        <p className="truncate text-xs font-semibold" style={{ color: TEXT_PRIMARY }}>{node.title}</p>
        <p className="mt-0.5 font-medium" style={{ color: TEXT_MUTED }}>
          {typeof node.xp === "number" ? `+${node.xp} XP · ` : ""}
          {statusLabel[node.status]}
        </p>
      </div>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "relative z-20 flex h-12 w-12 items-center justify-center rounded-full",
          visuals.shell,
          isActive && !isCurrent ? "ring-2 ring-white/25 ring-offset-2 ring-offset-transparent" : "",
          isActive && !reducedMotion ? "animate-[pulse_2.8s_ease-in-out_infinite]" : "",
          hoverableClasses,
        )}
        style={{ transition: "transform 220ms ease, filter 220ms ease, opacity 200ms ease" }}
        aria-current={isActive ? "step" : undefined}
        aria-label={node.title}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-[3px] rounded-full"
          style={{
            background: visuals.shellHighlight,
          }}
        />
        {isDone ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-[-6px] rounded-full"
            style={{
              background: "radial-gradient(circle, rgba(110,231,183,0.18), rgba(16,185,129,0.02) 64%, transparent 72%)",
            }}
          />
        ) : null}
        {isCurrent ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-[-8px] rounded-full"
            style={{
              background: "radial-gradient(circle, rgba(125,211,252,0.24), rgba(56,189,248,0.04) 62%, transparent 72%)",
            }}
          />
        ) : null}
        {isDone ? (
          <>
            <span
              aria-hidden
              className="pointer-events-none absolute left-[-6px] top-[4px] h-[6px] w-[6px] rounded-full"
              style={{ background: visuals.accentA, boxShadow: "0 0 8px rgba(250,204,21,0.55)" }}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute right-[-7px] top-[10px] h-[5px] w-[5px] rounded-full"
              style={{ background: visuals.accentB, boxShadow: "0 0 8px rgba(187,247,208,0.48)" }}
            />
          </>
        ) : null}
        {isCurrent ? (
          <>
            <span
              aria-hidden
              className={cn("pointer-events-none absolute left-[-8px] top-[7px] h-[7px] w-[7px] rounded-full", !reducedMotion ? "animate-[pulse_2.1s_ease-in-out_infinite]" : "")}
              style={{ background: visuals.accentA, boxShadow: "0 0 10px rgba(186,230,253,0.6)" }}
            />
            <span
              aria-hidden
              className={cn("pointer-events-none absolute right-[-8px] top-[5px] h-[6px] w-[6px] rounded-full", !reducedMotion ? "animate-[pulse_2.8s_ease-in-out_infinite]" : "")}
              style={{ background: visuals.accentB, boxShadow: "0 0 10px rgba(192,132,252,0.5)" }}
            />
            <span
              aria-hidden
              className={cn("pointer-events-none absolute left-1/2 top-[-8px] h-[5px] w-[5px] -translate-x-1/2 rounded-full bg-white/95", !reducedMotion ? "animate-[pulse_1.8s_ease-in-out_infinite]" : "")}
              style={{ boxShadow: "0 0 12px rgba(255,255,255,0.62)" }}
            />
          </>
        ) : null}
        <svg
          aria-hidden
          viewBox="0 0 48 48"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          <path
            d="M24 4.5l5.4 11 12.1 1.8-8.8 8.6 2.1 12.1L24 32.3 13.2 38l2.1-12.1-8.8-8.6 12.1-1.8L24 4.5z"
            fill={visuals.starFill}
            stroke={visuals.starStroke}
            strokeWidth="1.2"
          />
        </svg>
        {showOrbital ? (
          <>
            {!reducedMotion ? <span aria-hidden className="active-halo" /> : null}
            <span
              aria-hidden
              className={cn("orbital-ring", "orbital-ring-1", "orbital-ring-dot-lg", ringPrimaryOpacityClass)}
              style={ring1Style}
            />
            <span
              aria-hidden
              className={cn("orbital-ring", "orbital-ring-2", "orbital-ring-dot-sm", ringSecondaryOpacityClass)}
              style={ring2Style}
            />
          </>
        ) : null}
        {isCurrent ? (
          <span
            aria-hidden
            className={cn("pointer-events-none absolute inset-[-16px]", !reducedMotion ? "animate-[spin_16s_linear_infinite]" : "")}
            style={{
              background:
                "conic-gradient(from 90deg, rgba(255,255,255,0) 0deg, rgba(186,230,253,0.24) 38deg, rgba(255,255,255,0) 72deg, rgba(255,255,255,0) 360deg)",
              maskImage: "radial-gradient(circle, transparent 54%, black 64%, transparent 74%)",
              WebkitMaskImage: "radial-gradient(circle, transparent 54%, black 64%, transparent 74%)",
            }}
          />
        ) : null}
        {isCurrent ? <span aria-hidden className={cn("pointer-events-none absolute inset-[-10px] rounded-full border border-sky-300/24", !reducedMotion ? "animate-[pulse_2.6s_ease-out_infinite]" : "")} /> : null}
        {isDone ? <span aria-hidden className="pointer-events-none absolute inset-[-3px] rounded-full shadow-[0_0_18px_rgba(16,185,129,0.22)]" /> : null}
        {isCurrent ? <span aria-hidden className="pointer-events-none absolute inset-[-4px] rounded-full shadow-[0_0_20px_rgba(56,189,248,0.24)]" /> : null}
        {isCurrent ? <div className="pointer-events-none absolute inset-0 rounded-full border border-sky-100/26" /> : null}
        {isDone ? <Check className="h-6 w-6" strokeWidth={2.6} aria-hidden /> : null}
        {isLocked ? <Lock className="h-5 w-5" strokeWidth={2.2} aria-hidden /> : null}
        {!isDone && !isLocked ? <span className="text-base font-bold leading-none">{displayIndex}</span> : null}
        {node.isCheckpoint ? (
          <span className="absolute -right-1 -top-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/25 bg-[#0F172A]/75 text-[#D9E2EF]">
            <Star className="h-2.5 w-2.5" strokeWidth={2} aria-hidden />
          </span>
        ) : null}
      </button>
      <div
        className={cn(
          "pointer-events-none absolute top-1/2 z-20 rounded-[16px] text-center opacity-95 transition-opacity duration-[180ms] group-hover:opacity-100",
          badgeAnchorClass,
          compactMobile ? "px-2.5 py-1 text-[10px] leading-snug" : "px-3.5 py-1.5 text-[11px] leading-tight",
        )}
        style={{
          transform: `translate(${badgeTranslateX}, calc(-50% + ${badgeOffsetY.toFixed(1)}px))`,
          background: `linear-gradient(180deg, rgba(8,16,34,0.96), rgba(8,16,34,0.9)), ${visuals.labelBg}`,
          border: `1px solid ${visuals.labelBorder}`,
          boxShadow: `${visuals.labelShadow}, inset 0 1px 0 rgba(255,255,255,0.06)`,
          transition: "transform 0.4s ease, opacity 180ms ease",
          whiteSpace: "nowrap",
        }}
      >
        <span className="font-semibold tracking-[-0.01em]" style={{ color: visuals.labelText, textShadow: "0 1px 8px rgba(2,6,23,0.38)" }}>{node.title}</span>
      </div>
    </div>
  );
}

export function renderNode({ node, point, prevPoint, nextPoint, nodeIndex, compactMobile, highlightedNodeId, onNodeClick, quality, reducedMotion, enterProgress = 1, unlockBurstProgress = 0 }: RenderNodeOptions) {
  const isActive = highlightedNodeId === node.id;
  const delay = nodeIndex * 0.03;
  const nodeAppear = smoothstep(delay, delay + 0.25, enterProgress);
  const scale = 0.92 + (1 - 0.92) * nodeAppear;
  const burstA = 0.9 + 0.45 * unlockBurstProgress;
  const burstB = 1 + 0.55 * unlockBurstProgress;
  const burstAOpacity = (1 - unlockBurstProgress) * 0.9;
  const burstBOpacity = (1 - unlockBurstProgress) * 0.7;

  return (
    <div
      key={node.id}
      id={`map-node-${node.id}`}
      data-progression-node="true"
      className="absolute z-20"
      style={{
        left: point.x,
        top: point.y,
        transform: `translate(-50%, -50%) scale(${scale})`,
        opacity: nodeAppear,
        filter: `drop-shadow(0 0 ${6 + nodeAppear * 8}px rgba(56,189,248,${0.18 + nodeAppear * 0.25}))`,
        transition: "transform 160ms linear, opacity 160ms linear, filter 160ms linear",
      }}
    >
      <div className="relative flex flex-col items-center">
        {unlockBurstProgress > 0 ? (
          <>
            <span
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-1/2 h-[84px] w-[84px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-sky-300/70"
              style={{ transform: `translate(-50%, -50%) scale(${burstA})`, opacity: burstAOpacity }}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-1/2 h-[84px] w-[84px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-300/55"
              style={{ transform: `translate(-50%, -50%) scale(${burstB})`, opacity: burstBOpacity }}
            />
          </>
        ) : null}
        <MapNodeItem
          node={node}
          isActive={isActive}
          displayIndex={nodeIndex + 1}
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

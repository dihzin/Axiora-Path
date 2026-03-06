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

function MapNodeItem({ node, isActive, displayIndex, compactMobile, pointY, onClick, quality, reducedMotion }: {
  node: RenderableMapNode;
  isActive: boolean;
  displayIndex: number;
  compactMobile: boolean;
  pointY: number;
  onClick?: () => void;
  quality: "low" | "high";
  reducedMotion?: boolean;
}) {
  const isCurrent = node.status === "current";
  const isLocked = node.status === "locked";
  const isDone = node.status === "done";
  const badgeWidth = Math.max(140, node.title.length * 7);
  const badgeOffsetY = pointY < 120 ? 36 : -42;
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

  return (
    <div className="group relative">
      <div className="pointer-events-none absolute -top-2 left-1/2 z-30 w-max max-w-[240px] -translate-x-1/2 -translate-y-full rounded-xl border border-white/16 bg-black/40 px-3 py-2 text-center text-[11px] text-white opacity-0 shadow-[0_6px_18px_rgba(0,0,0,0.2)] backdrop-blur-md transition-opacity duration-150 group-hover:opacity-100">
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
          isDone ? `${reducedMotion ? "" : "animate-[softGlow_4s_ease-in-out_infinite] "}border-2 border-emerald-300 bg-emerald-500 text-white shadow-[0_0_18px_rgba(16,185,129,0.45)]` : "",
          isCurrent ? `${reducedMotion ? "" : "animate-[beacon_3s_ease-in-out_infinite] "}border-2 border-sky-300 bg-sky-500 text-white shadow-[0_0_14px_rgba(56,189,248,0.32)]` : "",
          isLocked ? "border border-white/20 bg-slate-700/60 text-white backdrop-blur" : "",
          isActive && !isCurrent ? "ring-2 ring-white/25 ring-offset-2 ring-offset-transparent" : "",
          isActive && !reducedMotion ? "animate-[pulse_2.8s_ease-in-out_infinite]" : "",
          hoverableClasses,
        )}
        style={{ transition: "transform 220ms ease, filter 220ms ease, opacity 200ms ease" }}
        aria-current={isActive ? "step" : undefined}
        aria-label={node.title}
      >
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
        {isCurrent ? <span aria-hidden className={cn("pointer-events-none absolute inset-[-12px] rounded-full border-2 border-sky-400/40", !reducedMotion ? "animate-[pulse_2.6s_ease-out_infinite]" : "")} /> : null}
        {isDone ? <span aria-hidden className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_26px_rgba(16,185,129,0.55)]" /> : null}
        {isCurrent ? <span aria-hidden className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_30px_rgba(56,189,248,0.58)]" /> : null}
        {isCurrent ? <div className="pointer-events-none absolute inset-0 rounded-full border-2 border-sky-300/30" /> : null}
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
          "pointer-events-none absolute left-1/2 z-20 -translate-x-1/2 rounded-[14px] border border-sky-300/50 bg-slate-900/65 text-center text-slate-200 shadow-[0_0_22px_rgba(56,189,248,0.45)]",
          compactMobile ? "px-2 py-1 text-[10px] leading-snug" : "px-3 py-1.5 text-[11px] leading-tight",
        )}
        style={{
          width: `${badgeWidth}px`,
          top: `${badgeOffsetY}px`,
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          boxShadow: "0 0 14px rgba(56,189,248,0.45)",
          transition: "all 0.4s ease",
        }}
      >
        <span className="font-medium" style={{ color: TEXT_PRIMARY }}>{node.title}</span>
      </div>
    </div>
  );
}

export function renderNode({ node, point, nodeIndex, compactMobile, highlightedNodeId, onNodeClick, quality, reducedMotion, enterProgress = 1, unlockBurstProgress = 0 }: RenderNodeOptions) {
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
          pointY={point.y}
          onClick={() => onNodeClick?.(node)}
          quality={quality}
          reducedMotion={reducedMotion}
        />
      </div>
    </div>
  );
}

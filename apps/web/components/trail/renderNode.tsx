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
};

const statusLabel: Record<RenderNodeStatus, string> = {
  done: "Concluída",
  current: "Atual",
  locked: "Bloqueada",
};

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
  const showOrbital = isCurrent || isActive;

  return (
    <div className="group relative">
      <div className="pointer-events-none absolute -top-2 left-1/2 z-30 w-max max-w-[240px] -translate-x-1/2 -translate-y-full rounded-xl border border-white/16 bg-black/40 px-3 py-2 text-center text-[11px] text-white opacity-0 shadow-[0_6px_18px_rgba(0,0,0,0.2)] backdrop-blur-md transition-opacity duration-150 group-hover:opacity-100">
        <p className="truncate text-xs font-semibold text-white">{node.title}</p>
        <p className="mt-0.5 font-medium text-white">
          {typeof node.xp === "number" ? `+${node.xp} XP · ` : ""}
          {statusLabel[node.status]}
        </p>
      </div>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "relative z-20 flex h-12 w-12 items-center justify-center rounded-full transition-all duration-300 transition-transform active:scale-105",
          isDone ? "animate-[softGlow_4s_ease-in-out_infinite] border-2 border-emerald-300 bg-emerald-500 text-white shadow-[0_0_18px_rgba(16,185,129,0.45)]" : "",
          isCurrent ? "animate-[beacon_3s_ease-in-out_infinite] border-2 border-sky-300 bg-sky-500 text-white shadow-[0_0_14px_rgba(56,189,248,0.32)]" : "",
          isLocked ? "border border-white/20 bg-slate-700/60 text-white backdrop-blur" : "",
          isActive && !isCurrent ? "ring-2 ring-white/25 ring-offset-2 ring-offset-transparent" : "",
          isCurrent ? "animate-[pulse_3s_ease-in-out_infinite]" : "",
          "hover:scale-110 hover:shadow-[0_0_12px_rgba(56,189,248,0.4)]",
        )}
        style={{ transition: "all 0.4s ease" }}
        aria-current={isActive ? "step" : undefined}
        aria-label={node.title}
      >
        {showOrbital && !reducedMotion ? (
          <>
            <span aria-hidden className="active-halo" />
            <span aria-hidden className={cn("orbital-ring", "orbital-ring-1")} style={{ width: 48, height: 48 }} />
            <span aria-hidden className={cn("orbital-ring", "orbital-ring-2")} style={{ width: 62, height: 62 }} />
            {quality === "high" ? <span aria-hidden className={cn("orbital-ring", "orbital-ring-3")} style={{ width: 76, height: 76 }} /> : null}
          </>
        ) : null}
        {isCurrent ? <span aria-hidden className="pointer-events-none absolute inset-[-12px] rounded-full border-2 border-sky-400/40 animate-[pulse_2.6s_ease-out_infinite]" /> : null}
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
        <span className="font-medium text-[#e2e8f0]">{node.title}</span>
      </div>
    </div>
  );
}

export function renderNode({ node, point, nodeIndex, compactMobile, highlightedNodeId, onNodeClick, quality, reducedMotion }: RenderNodeOptions) {
  const isActive = highlightedNodeId === node.id;

  return (
    <div
      key={node.id}
      id={`map-node-${node.id}`}
      data-progression-node="true"
      className="absolute z-20"
      style={{
        left: point.x,
        top: point.y,
        transform: "translate(-50%, -50%)",
      }}
    >
      <div className="relative flex flex-col items-center">
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

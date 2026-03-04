"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Lock, Star } from "lucide-react";

import { useParallax } from "@/hooks/useParallax";
import { cn } from "@/lib/utils";
import TrailConstellation from "./TrailConstellation";

export type NodeStatus = "done" | "current" | "locked";

export type MapNode = {
  id: string;
  title: string;
  subtitle?: string;
  xp?: number;
  status: NodeStatus;
  isCheckpoint?: boolean;
};

export type MapSection = {
  id: string;
  title: string;
  nodes: MapNode[];
};

type ProgressionMapProps = {
  nodes: MapNode[];
  activeNodeId?: string;
  selectedNodeId?: string;
  onNodeClick?: (node: MapNode) => void;
  debug?: boolean;
  className?: string;
};

const NODE_GAP = 120;
const START_Y = 160;
const NODE_SIZE = 48;
const NODE_RADIUS = NODE_SIZE / 2;
const SAFE_TOP = 70;
const SAFE_BOTTOM = 120;
const SAFE_MARGIN = 90;

type CurvedPathPoint = {
  x: number;
  y: number;
};

function buildCurvedPathPoints(_offsets: number[]): CurvedPathPoint[] {
  // TODO: V2: trocar connectors verticais por SVG path curvo.
  // Placeholder intencional para evolucao sem impacto no V1.
  // FUTURE V3
  // nodes podem virar estrelas
  // conexão vira constelação
  return [];
}

type MapNodeItemProps = {
  node: MapNode;
  isActive: boolean;
  displayIndex: number;
  compactMobile: boolean;
  pointY: number;
  onClick?: () => void;
};

const statusLabel: Record<NodeStatus, string> = {
  done: "Concluída",
  current: "Atual",
  locked: "Bloqueada",
};

function MapNodeItem({ node, isActive, displayIndex, compactMobile, pointY, onClick }: MapNodeItemProps) {
  const isCurrent = node.status === "current";
  const isLocked = node.status === "locked";
  const isDone = node.status === "done";
  const badgeWidth = Math.max(140, node.title.length * 7);
  const badgeOffsetY = pointY < 120 ? 36 : -42;

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
          "relative flex h-12 w-12 items-center justify-center rounded-full transition-all duration-300 transition-transform active:scale-105",
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
        {isCurrent ? <span aria-hidden className="pointer-events-none absolute inset-[-12px] rounded-full border-2 border-sky-400/40 animate-[pulse_2.6s_ease-out_infinite]" /> : null}
        {isDone ? <span aria-hidden className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_26px_rgba(16,185,129,0.55)]" /> : null}
        {isCurrent ? <span aria-hidden className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_30px_rgba(56,189,248,0.58)]" /> : null}
        {isCurrent && (
          <div className="pointer-events-none absolute inset-[-18px]">
            <div className="orbit-ring absolute inset-0 rounded-full border border-sky-400/30" />
            <div className="orbit-dot absolute h-[6px] w-[6px] rounded-full bg-sky-300" />
          </div>
        )}
        {isCurrent ? <div className="pointer-events-none absolute inset-0 rounded-full border-2 border-sky-300/30" /> : null}
        {isDone && (
          <div className="pointer-events-none absolute inset-[-12px]">
            <div className="orbit-dot-small" />
          </div>
        )}
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
          compactMobile ? "px-2 py-1 text-[10px] leading-snug" : "px-3 py-1.5 text-[12px] leading-tight",
        )}
        style={{
          width: `${badgeWidth}px`,
          top: `${badgeOffsetY}px`,
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          filter: "url(#badgeGlow)",
          transition: "all 0.4s ease",
        }}
      >
        <span className="font-medium text-[#e2e8f0]">{node.title}</span>
      </div>
    </div>
  );
}

function buildPath(points: { x: number; y: number }[]) {
  if (points.length < 2) return "";
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i += 1) {
    const p0 = points[i - 1];
    const p1 = points[i];
    const midY = (p0.y + p1.y) / 2;
    d += ` C ${p0.x} ${midY} ${p1.x} ${midY} ${p1.x} ${p1.y}`;
  }
  return d;
}

function buildProgressPath(points: { x: number; y: number }[], currentIndex: number) {
  if (currentIndex <= 0) return "";
  return buildPath(points.slice(0, currentIndex + 1));
}

function renderNode(
  node: MapNode,
  point: { x: number; y: number },
  nodeIndex: number,
  trackCenter: number,
  compactMobile: boolean,
  highlightedNodeId?: string,
  onNodeClick?: (node: MapNode) => void,
) {
  const isActive = highlightedNodeId === node.id;
  const nodeX = point.x - trackCenter;

  return (
    <div
      key={node.id}
      id={`map-node-${node.id}`}
      className="absolute left-1/2 z-20"
      style={{
        top: point.y,
        transform: `translateX(${nodeX}px)`,
      }}
    >
      <div className="relative flex -translate-x-1/2 -translate-y-1/2 flex-col items-center">
        <MapNodeItem
          node={node}
          isActive={isActive}
          displayIndex={nodeIndex + 1}
          compactMobile={compactMobile}
          pointY={point.y}
          onClick={() => onNodeClick?.(node)}
        />
      </div>
    </div>
  );
}

export default function ProgressionMap({
  nodes,
  activeNodeId,
  selectedNodeId,
  onNodeClick,
  debug = false,
  className,
}: ProgressionMapProps) {
  useParallax();

  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const totalNodes = nodes.length;

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setWidth(containerRef.current.clientWidth);
      }
    };

    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  const trackWidth = Math.max(320, width);
  const trackCenter = trackWidth / 2;
  const isMobile = trackWidth < 768;
  const compactMobile = trackWidth < 480;
  const amplitude = Math.min(160, trackWidth * 0.28);
  const pattern = [-1, 1, -0.6, 0.8, -0.4, 0.6];
  const mapHeight = Math.max(520, START_Y + Math.max(totalNodes - 1, 0) * NODE_GAP + SAFE_BOTTOM + NODE_RADIUS);

  const points = nodes.map((_, gi) => {
    let x = trackCenter + pattern[gi % pattern.length] * amplitude;
    x = Math.max(SAFE_MARGIN, x);
    x = Math.min(trackWidth - SAFE_MARGIN, x);

    let y = START_Y + gi * NODE_GAP;
    y = Math.max(SAFE_TOP, y);
    y = Math.min(mapHeight - SAFE_BOTTOM, y);

    return { x, y };
  });
  const activeIndex = (() => {
    if (!nodes.length) return -1;
    if (activeNodeId) {
      const byId = nodes.findIndex((node) => node.id === activeNodeId);
      if (byId >= 0) return byId;
    }
    const byStatus = nodes.findIndex((node) => node.status === "current");
    return byStatus >= 0 ? byStatus : 0;
  })();
  const curvedPath = buildPath(points);
  const progressPath = buildProgressPath(points, activeIndex);
  const particles = points.slice(0, Math.max(activeIndex + 1, 0)).map((point, index) => ({
    x: point.x,
    y: point.y,
    delay: index * 0.4,
  }));
  const stars = useMemo(
    () =>
      Array.from({ length: 30 }).map((_, index) => ({
        id: `star-${index}`,
        x: Math.random() * trackWidth,
        y: Math.random() * mapHeight,
        opacity: 0.1 + Math.random() * 0.2,
      })),
    [trackWidth, mapHeight],
  );

  const showDebugOverlay = debug && process.env.NODE_ENV !== "production";
  // TODO: V2: trocar connectors verticais por SVG path curvo.
  void buildCurvedPathPoints([]);

  useEffect(() => {
    if (!activeNodeId) return;
    document.getElementById(`map-node-${activeNodeId}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeNodeId]);

  return (
    <div ref={containerRef} className={cn("axiora-parallax relative w-full overflow-hidden pb-2 pt-10", className)} style={{ maxHeight: "none" }}>
      <div className="parallax-layer layer-bg" data-depth="0.2" />
      <div className="parallax-layer layer-stars" data-depth="0.5" />

      <div className="relative z-10">
        <div className="relative w-full overflow-visible" style={{ height: `${mapHeight}px`, maxHeight: "none" }}>
          <div className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-b from-transparent via-sky-900/10 to-transparent" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-[900px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-500/10 blur-[160px]" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-[1100px] w-[1100px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500/10 blur-[220px]" />
          <TrailConstellation isCurrent={activeIndex >= 0} />
          <svg
            className="pointer-events-none absolute left-1/2 z-10 -translate-x-1/2"
            width={trackWidth}
            height={mapHeight}
            viewBox={`0 0 ${trackWidth} ${mapHeight}`}
            preserveAspectRatio="xMidYMin meet"
            style={{ overflow: "visible" }}
            aria-hidden
          >
            <defs>
              <radialGradient id="nebulaGradient" cx="50%" cy="40%" r="70%">
                <stop offset="0%" stopColor="#1d4ed8" stopOpacity="0.35" />
                <stop offset="60%" stopColor="#0ea5e9" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#020617" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="trailEnergy" x1="0%" y1="0%" x2="100%" y2="0%" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#60a5fa" />
                <stop offset="50%" stopColor="#38bdf8" />
                <stop offset="100%" stopColor="#6366f1" />
              </linearGradient>
              <filter id="routeGlow">
                <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#38bdf8" floodOpacity="0.8" />
              </filter>
              <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#38bdf8" />
                <stop offset="100%" stopColor="#6366f1" />
              </linearGradient>
              <filter id="badgeGlow">
                <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#38bdf8" floodOpacity="0.7" />
              </filter>
            </defs>
            <rect x={0} y={0} width={trackWidth} height={mapHeight} fill="url(#nebulaGradient)" />
            {stars.map((star) => (
              <circle key={star.id} cx={star.x} cy={star.y} r={1} fill="white" opacity={star.opacity} />
            ))}
            <path
              d={curvedPath}
              stroke={isMobile ? "rgba(255,255,255,0.26)" : "rgba(255,255,255,0.16)"}
              strokeWidth={isMobile ? 6 : 3}
              fill="none"
              strokeLinecap="round"
              filter="url(#routeGlow)"
              style={{ transition: "all 0.4s ease" }}
            />
            {progressPath ? (
              <path
                d={progressPath}
                stroke="url(#trailEnergy)"
                strokeWidth={isMobile ? 7 : 4}
                fill="none"
                strokeLinecap="round"
                filter="url(#routeGlow)"
                style={{ filter: "drop-shadow(0 0 22px rgba(56,189,248,0.8))", transition: "all 0.4s ease" }}
              />
            ) : null}
          </svg>
          <div
            className="pointer-events-none absolute left-1/2 z-[11] -translate-x-1/2"
            style={{ width: `${trackWidth}px`, height: `${mapHeight}px` }}
            aria-hidden
          >
            {particles.map((particle, index) => (
              <div
                key={`energy-particle-${index}`}
                className="path-energy -translate-x-1/2 -translate-y-1/2"
                style={{
                  left: `${particle.x}px`,
                  top: `${particle.y}px`,
                  animationDelay: `${particle.delay}s`,
                }}
              />
            ))}
          </div>
        {nodes.map((node, index) => {
          const point = points[index];
          if (!point) return null;
          return renderNode(node, point, index, trackCenter, compactMobile, selectedNodeId ?? activeNodeId, onNodeClick);
        })}
      </div>
      </div>
      {showDebugOverlay ? (
        <div className="pointer-events-none absolute right-2 top-2 z-40 rounded-lg border border-amber-300/35 bg-amber-50/90 px-3 py-2 text-[11px] leading-tight text-amber-900 shadow-sm">
          <p>mapHeight: {mapHeight}</p>
          <p>NODE_GAP: {NODE_GAP}</p>
          <p>width: {trackWidth.toFixed(0)}</p>
          <p>amplitude: {amplitude.toFixed(1)}</p>
        </div>
      ) : null}
    </div>
  );
}

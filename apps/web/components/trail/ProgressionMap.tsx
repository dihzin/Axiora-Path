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

type PhysicsParticle = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
};

type CameraDebugData = {
  viewW: number;
  viewH: number;
  rectH: number;
  effectiveH: number;
  bottomSafeAreaPx: number;
  worldW: number;
  worldH: number;
  scale: number;
  tx: number;
  ty: number;
  targetX: number;
  targetY: number;
  allowClampX: boolean;
  allowClampY: boolean;
  currentNodeX: number;
  currentNodeY: number;
  currentScreenX: number;
  currentScreenY: number;
};

type PersistedMapData = {
  nodes: MapNode[];
  points: Array<{ x: number; y: number }>;
  worldWidth: number;
  worldHeight: number;
  activeIndex: number;
  curvedPath: string;
  progressPath: string;
  routeParticles: Array<{ x: number; y: number; delay: number }>;
};

const EMPTY_MAP_DATA: PersistedMapData = {
  nodes: [],
  points: [],
  worldWidth: 1,
  worldHeight: 1,
  activeIndex: -1,
  curvedPath: "",
  progressPath: "",
  routeParticles: [],
};

const MAX_PARTICLES = 50;
const SAFE_PAD = { top: 90, right: 110, bottom: 130, left: 110 };
const BADGE_ALLOW = 52;
const WORLD_PADDING_BOTTOM = 120;
const MIN_SCALE = 0.82;
const MAX_SCALE = 1.22;
const COMPOSE_Y = 0.46;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getNodeRadiusByStatus(status: NodeStatus) {
  if (status === "current") return NODE_RADIUS + 4;
  if (status === "done") return NODE_RADIUS + 2;
  return NODE_RADIUS;
}

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
  compactMobile: boolean,
  highlightedNodeId?: string,
  onNodeClick?: (node: MapNode) => void,
) {
  const isActive = highlightedNodeId === node.id;

  return (
    <div
      key={node.id}
      id={`map-node-${node.id}`}
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
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const cameraRootRef = useRef<HTMLDivElement>(null);
  const cameraStateRef = useRef({ x: 0, y: 0, s: 1 });
  const cameraTargetRef = useRef({ x: 0, y: 0, s: 1 });
  const mouseRef = useRef({ x: 0, y: 0 });
  const [view, setView] = useState({ w: 0, h: 0 });
  const [width, setWidth] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [physicsParticles, setPhysicsParticles] = useState<PhysicsParticle[]>([]);
  const [cameraDebug, setCameraDebug] = useState<CameraDebugData | null>(null);
  const [bottomSafeAreaPx, setBottomSafeAreaPx] = useState(180);
  const [viewportRectH, setViewportRectH] = useState(0);
  const [lastMeasuredRect, setLastMeasuredRect] = useState({ width: 0, height: 0 });
  const [lastComputedEffective, setLastComputedEffective] = useState({ w: 0, h: 0 });
  const pointsRef = useRef<PersistedMapData | null>(null);
  const totalNodes = nodes.length;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    let raf = 0;
    let retryCount = 0;

    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      setLastMeasuredRect({ width: rect.width, height: rect.height });
      const missionsCard = document.getElementById("daily-missions-content");
      const measuredSafeArea =
        missionsCard && Number.isFinite(missionsCard.getBoundingClientRect().height) && missionsCard.getBoundingClientRect().height > 0
          ? Math.round(missionsCard.getBoundingClientRect().height + 24)
          : 180;
      const fallbackW = Math.max(1, window.innerWidth);
      const fallbackH = Math.max(1, window.innerHeight);
      const rawW = rect.width === 0 ? fallbackW : rect.width || element.offsetWidth || fallbackW;
      const rawH = rect.height === 0 ? fallbackH : rect.height || element.offsetHeight || fallbackH;
      const effectiveH = Math.max(320, rawH - measuredSafeArea);

      setBottomSafeAreaPx(measuredSafeArea);
      setViewportRectH(rawH);
      setWidth(rawW);
      setLastComputedEffective({ w: rawW, h: effectiveH });
      setView({ w: rawW, h: effectiveH });

      if ((rect.width === 0 || rect.height === 0) && retryCount < 8) {
        retryCount += 1;
        raf = window.requestAnimationFrame(updateSize);
      }
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

  const trackWidth = Math.max(320, width);
  const trackCenter = trackWidth / 2;
  const isMobile = trackWidth < 768;
  const compactMobile = trackWidth < 480;
  const amplitude = Math.min(160, trackWidth * 0.28);
  const pattern = [-1, 1, -0.6, 0.8, -0.4, 0.6];
  const computedPoints = useMemo<PersistedMapData>(() => {
    if (!nodes || nodes.length === 0) return EMPTY_MAP_DATA;

    const estimatedWorldHeight = Math.max(START_Y + Math.max(nodes.length - 1, 0) * NODE_GAP + SAFE_BOTTOM + NODE_RADIUS, 780);
    const rawPoints = nodes.map((_, gi) => {
      let x = trackCenter + pattern[gi % pattern.length] * amplitude;
      x = Math.max(SAFE_MARGIN, x);
      x = Math.min(trackWidth - SAFE_MARGIN, x);

      let y = START_Y + gi * NODE_GAP;
      y = Math.max(SAFE_TOP, y);
      y = Math.min(estimatedWorldHeight - SAFE_BOTTOM, y);

      return { x, y };
    });
    if (rawPoints.length === 0) return EMPTY_MAP_DATA;

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    rawPoints.forEach((point, index) => {
      const node = nodes[index];
      if (!node) return;
      const radius = getNodeRadiusByStatus(node.status);
      minX = Math.min(minX, point.x - radius);
      maxX = Math.max(maxX, point.x + radius);
      minY = Math.min(minY, point.y - radius);
      maxY = Math.max(maxY, point.y + radius);
    });

    minX -= SAFE_PAD.left;
    maxX += SAFE_PAD.right;
    minY -= SAFE_PAD.top + BADGE_ALLOW;
    maxY += SAFE_PAD.bottom + 18;

    const offsetX = -minX;
    const offsetY = -minY;
    const worldWidth = Math.max(1, maxX - minX);
    const trailMinX = Math.min(...rawPoints.map((point) => point.x));
    const trailMaxX = Math.max(...rawPoints.map((point) => point.x));
    const trailWidth = trailMaxX - trailMinX;
    const worldCenterOffsetX = (worldWidth - trailWidth) / 2 - trailMinX;
    const points = rawPoints.map((point) => ({ x: point.x + offsetX + worldCenterOffsetX, y: point.y + offsetY }));
    const worldHeight = Math.max(1, maxY - minY + WORLD_PADDING_BOTTOM);
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
    const routeParticles = points.slice(0, Math.max(activeIndex + 1, 0)).map((point, index) => ({
      x: point.x,
      y: point.y,
      delay: index * 0.4,
    }));

    return {
      nodes,
      points,
      worldWidth,
      worldHeight,
      activeIndex,
      curvedPath,
      progressPath,
      routeParticles,
    };
  }, [activeNodeId, amplitude, nodes, pattern, trackCenter, trackWidth]);

  useEffect(() => {
    if (computedPoints && computedPoints.points.length > 0) {
      pointsRef.current = computedPoints;
    }
  }, [computedPoints]);

  const mapData = computedPoints ?? pointsRef.current;
  const renderNodes = mapData?.nodes ?? [];
  const points = mapData?.points ?? [];
  const worldWidth = mapData?.worldWidth ?? 1;
  const worldHeight = mapData?.worldHeight ?? 1;
  const activeIndex = mapData?.activeIndex ?? -1;
  const curvedPath = mapData?.curvedPath ?? "";
  const progressPath = mapData?.progressPath ?? "";
  const routeParticles = mapData?.routeParticles ?? [];

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (trackWidth <= 0 || worldHeight <= 0 || reducedMotion) {
      setPhysicsParticles([]);
      return;
    }

    const count = Math.min(MAX_PARTICLES, 40);
    const newParticles: PhysicsParticle[] = Array.from({ length: count }).map((_, i) => ({
      id: i,
      x: Math.random() * trackWidth,
      y: Math.random() * worldHeight,
      vx: (Math.random() - 0.5) * 0.2,
      vy: (Math.random() - 0.5) * 0.2,
      size: Math.random() * 1.8 + 0.5,
    }));

    setPhysicsParticles(newParticles);
  }, [trackWidth, worldHeight, reducedMotion]);

  useEffect(() => {
    if (!view || view.w === 0 || view.h === 0) return;
    if (!points.length || view.w <= 0 || view.h <= 0) return;
    if (!Number.isFinite(worldWidth) || !Number.isFinite(worldHeight) || worldWidth <= 0 || worldHeight <= 0) return;

    const targetIndex = renderNodes.findIndex((node) => node.status === "current");
    if (!points.length) return;

    const worldW = worldWidth;
    const worldH = worldHeight;
    let scaleFit = Math.min(view.w / worldW, view.h / worldH);
    scaleFit = clamp(scaleFit, MIN_SCALE, MAX_SCALE);
    if (targetIndex >= 0) scaleFit *= 1.03;
    if (renderNodes.every((node) => node.status === "locked")) scaleFit *= 0.98;
    const scale = clamp(scaleFit, MIN_SCALE, MAX_SCALE);

    const minX = Math.min(...points.map((point) => point.x));
    const maxX = Math.max(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxY = Math.max(...points.map((point) => point.y));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const offsetX = view.w / 2 - centerX;
    const offsetY = view.h / 2 - centerY;
    const tx = offsetX;
    const ty = offsetY;
    const allowClampX = false;
    const allowClampY = false;

    const currentPoint = points[Math.max(activeIndex, 0)] ?? points[0];
    if (showDebugOverlay && currentPoint) {
      const curr = cameraStateRef.current;
      const debugScale = reducedMotion ? scale : curr.s;
      const debugTx = reducedMotion ? tx : curr.x;
      const debugTy = reducedMotion ? ty : curr.y;
      setCameraDebug({
        viewW: view.w,
        viewH: view.h,
        rectH: viewportRectH,
        effectiveH: view.h,
        bottomSafeAreaPx,
        worldW: worldW,
        worldH: worldH,
        scale: debugScale,
        tx: debugTx,
        ty: debugTy,
        targetX: centerX,
        targetY: centerY,
        allowClampX,
        allowClampY,
        currentNodeX: currentPoint.x,
        currentNodeY: currentPoint.y,
        currentScreenX: currentPoint.x * debugScale + debugTx,
        currentScreenY: currentPoint.y * debugScale + debugTy,
      });
    }

    cameraTargetRef.current = { x: tx, y: ty, s: scale };

    const applyCamera = (x: number, y: number, s: number) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      if (cameraRootRef.current) {
        cameraRootRef.current.style.transformOrigin = "0 0";
        cameraRootRef.current.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
      }
    };

    if (reducedMotion) {
      cameraStateRef.current = { x: tx, y: ty, s: scale };
      applyCamera(tx, ty, scale);
      return;
    }

    let raf = 0;
    const tick = () => {
      const current = cameraStateRef.current;
      const target = cameraTargetRef.current;
      current.x += (target.x - current.x) * 0.1;
      current.y += (target.y - current.y) * 0.1;
      current.s += (target.s - current.s) * 0.08;
      applyCamera(current.x, current.y, current.s);
      const currentPoint = points[Math.max(activeIndex, 0)] ?? points[0];
      if (showDebugOverlay && currentPoint) {
        setCameraDebug({
          viewW: view.w,
          viewH: view.h,
          rectH: viewportRectH,
          effectiveH: view.h,
          bottomSafeAreaPx,
          worldW: worldW,
          worldH: worldH,
          scale: current.s,
          tx: current.x,
          ty: current.y,
          targetX: centerX,
          targetY: centerY,
          allowClampX,
          allowClampY,
          currentNodeX: currentPoint.x,
          currentNodeY: currentPoint.y,
          currentScreenX: currentPoint.x * current.s + current.x,
          currentScreenY: currentPoint.y * current.s + current.y,
        });
      }
      raf = window.requestAnimationFrame(tick);
    };

    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [activeIndex, bottomSafeAreaPx, points, reducedMotion, renderNodes, view.h, view.w, viewportRectH, worldHeight, worldWidth]);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      mouseRef.current.x = event.clientX - rect.left;
      mouseRef.current.y = event.clientY - rect.top;
    };

    window.addEventListener("mousemove", onMouseMove);
    return () => window.removeEventListener("mousemove", onMouseMove);
  }, []);
  const stars = useMemo(
    () =>
      Array.from({ length: 30 }).map((_, index) => ({
        id: `star-${index}`,
        x: Math.random() * trackWidth,
        y: Math.random() * worldHeight,
        opacity: 0.1 + Math.random() * 0.2,
      })),
    [trackWidth, worldHeight],
  );

  const showDebugOverlay = debug && process.env.NODE_ENV !== "production";
  const showDevDebugOverlay = process.env.NODE_ENV !== "production";
  // TODO: V2: trocar connectors verticais por SVG path curvo.
  void buildCurvedPathPoints([]);

  useEffect(() => {
    if (!activeNodeId || renderNodes.length === 0) return;
    document.getElementById(`map-node-${activeNodeId}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeNodeId, renderNodes.length]);

  const mapReady = mounted && view.w > 0 && view.h > 0 && points.length > 0;
  if (!mounted || points.length === 0) {
    return (
      <>
        <div className="progression-map-loading">Loading trail...</div>
        {showDevDebugOverlay ? (
          <div
            className="pointer-events-none z-[9999] whitespace-pre rounded-md border border-white/20 bg-black/75 px-3 py-2 font-mono text-[11px] leading-tight text-white"
            style={{ position: "fixed", top: 8, left: 8 }}
          >
            <p>mounted: {String(mounted)}</p>
            <p>nodes.length: {nodes.length}</p>
            <p>points.length: {points.length}</p>
            <p>view.w, view.h: {view.w}, {view.h}</p>
            <p>raw rect.width, rect.height: {lastMeasuredRect.width}, {lastMeasuredRect.height}</p>
            <p>bottomSafeAreaPx: {bottomSafeAreaPx}</p>
            <p>effectiveW, effectiveH: {lastComputedEffective.w}, {lastComputedEffective.h}</p>
            <p>mapReady: {String(mapReady)}</p>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <div ref={containerRef} className={cn("axiora-parallax relative w-full overflow-visible pb-2 pt-10 min-h-[520px] h-[620px]", className)} style={{ maxHeight: "none" }}>
      <div className="parallax-layer layer-bg" data-depth="0.2" />
      <div className="parallax-layer layer-stars" data-depth="0.5" />

      <div className="relative z-10 w-full min-h-[520px]">
        <div
          ref={viewportRef}
          className="progression-map-viewport"
          style={{
            position: "relative",
            width: "100%",
            height: "640px",
            maxHeight: "70vh",
            overflow: "hidden",
          }}
        >
          <div className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-b from-transparent via-sky-900/10 to-transparent" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-[900px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-500/10 blur-[160px]" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-[1100px] w-[1100px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500/10 blur-[220px]" />
          <div className="progression-map-world" style={{ position: "absolute", inset: 0 }}>
            <TrailConstellation isCurrent={activeIndex >= 0} />
            <div
              ref={cameraRootRef}
              className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2"
              style={{ width: `${trackWidth}px`, height: `${worldHeight}px` }}
            >
            <svg
              className="absolute left-0 top-0"
              width={trackWidth}
              height={worldHeight}
              viewBox={`0 0 ${trackWidth} ${worldHeight}`}
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
              <linearGradient id="energyGradient" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0" />
                <stop offset="40%" stopColor="#60a5fa" />
                <stop offset="60%" stopColor="#22d3ee" />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="trailEnergy" x1="0%" y1="0%" x2="100%" y2="0%" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#60a5fa" />
                <stop offset="50%" stopColor="#38bdf8" />
                <stop offset="100%" stopColor="#6366f1" />
              </linearGradient>
              <filter id="energyGlow">
                <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#38bdf8" floodOpacity="0.9" />
              </filter>
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
              <g className="camera">
              <rect x={0} y={0} width={trackWidth} height={worldHeight} fill="url(#nebulaGradient)" />
              {stars.map((star) => (
                <circle key={star.id} cx={star.x} cy={star.y} r={1} fill="white" opacity={star.opacity} />
              ))}
              {!reducedMotion
                ? physicsParticles.map((particle) => (
                    <circle
                      key={`physics-${particle.id}`}
                      cx={particle.x}
                      cy={particle.y}
                      r={particle.size}
                      fill="#e0f2fe"
                      opacity={0.25}
                    />
                  ))
                : null}
              <path
                d={curvedPath}
                stroke={isMobile ? "rgba(255,255,255,0.26)" : "rgba(255,255,255,0.16)"}
                strokeWidth={isMobile ? 6 : 3}
                fill="none"
                strokeLinecap="round"
                filter="url(#routeGlow)"
                style={{ transition: "all 0.4s ease" }}
              />
              <path
                d={curvedPath}
                fill="none"
                stroke="url(#energyGradient)"
                strokeWidth={4}
                strokeLinecap="round"
                strokeDasharray="12 18"
                className="energy-flow"
                filter="url(#energyGlow)"
                opacity={0.35}
                style={{ transition: "all 0.4s ease" }}
              />
              {progressPath ? (
                <>
                  <path
                    d={progressPath}
                    stroke="url(#trailEnergy)"
                    strokeWidth={isMobile ? 7 : 4}
                    fill="none"
                    strokeLinecap="round"
                    filter="url(#routeGlow)"
                    style={{ filter: "drop-shadow(0 0 22px rgba(56,189,248,0.8))", transition: "all 0.4s ease" }}
                  />
                  <path
                    d={progressPath}
                    fill="none"
                    stroke="url(#energyGradient)"
                    strokeWidth={5}
                    strokeLinecap="round"
                    strokeDasharray="12 18"
                    className="energy-flow"
                    filter="url(#energyGlow)"
                    style={{ transition: "all 0.4s ease" }}
                  />
                  <circle r={2} fill="#7dd3fc" opacity={0.8} className="energy-particle">
                    <animateMotion dur="4s" repeatCount="indefinite" path={progressPath} />
                  </circle>
                </>
              ) : null}
              {!reducedMotion
                ? points.map((point, index) => {
                    const node = nodes[index];
                    if (!node || node.status !== "current") return null;
                    return (
                      <g key={`current-aura-${node.id}`}>
                        <circle
                          cx={point.x}
                          cy={point.y}
                          r={NODE_RADIUS + 18}
                          fill="none"
                          stroke="#22d3ee"
                          strokeWidth={2}
                          opacity={0.35}
                        />
                        <circle cx={point.x} cy={point.y} r={NODE_RADIUS + 6} fill="none" stroke="#38bdf8">
                          <animate attributeName="r" values={`${NODE_RADIUS + 6};${NODE_RADIUS + 20}`} dur="2.2s" repeatCount="indefinite" />
                          <animate attributeName="opacity" values="0.7;0" dur="2.2s" repeatCount="indefinite" />
                        </circle>
                      </g>
                    );
                  })
                : null}
              </g>
            </svg>
            <div className="pointer-events-none absolute left-0 top-0 z-[11]" style={{ width: `${trackWidth}px`, height: `${worldHeight}px` }} aria-hidden>
              {routeParticles.map((particle, index) => (
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
            {renderNodes.map((node, index) => {
              const point = points[index];
              if (!point) return null;
              return renderNode(node, point, index, compactMobile, selectedNodeId ?? activeNodeId, onNodeClick);
            })}
            </div>
            </div>
          </div>
        </div>
      </div>
      {showDebugOverlay && cameraDebug ? (
        <div className="pointer-events-none absolute left-2 top-2 z-40 rounded-lg border border-amber-300/35 bg-amber-50/90 px-3 py-2 text-[11px] leading-tight text-amber-900 shadow-sm">
          <p>view: {cameraDebug.viewW.toFixed(1)} x {cameraDebug.viewH.toFixed(1)}</p>
          <p>rectH/effectiveH: {cameraDebug.rectH.toFixed(1)} / {cameraDebug.effectiveH.toFixed(1)}</p>
          <p>bottomSafeAreaPx: {cameraDebug.bottomSafeAreaPx.toFixed(1)}</p>
          <p>world: {cameraDebug.worldW.toFixed(1)} x {cameraDebug.worldH.toFixed(1)}</p>
          <p>scale: {cameraDebug.scale.toFixed(4)}</p>
          <p>tx/ty: {cameraDebug.tx.toFixed(2)}, {cameraDebug.ty.toFixed(2)}</p>
          <p>target: {cameraDebug.targetX.toFixed(2)}, {cameraDebug.targetY.toFixed(2)}</p>
          <p>allowClampX/Y: {String(cameraDebug.allowClampX)} / {String(cameraDebug.allowClampY)}</p>
          <p>current node: {cameraDebug.currentNodeX.toFixed(2)}, {cameraDebug.currentNodeY.toFixed(2)}</p>
          <p>current screen: {cameraDebug.currentScreenX.toFixed(2)}, {cameraDebug.currentScreenY.toFixed(2)}</p>
        </div>
      ) : null}
      {showDevDebugOverlay ? (
        <div
          className="pointer-events-none z-[9999] whitespace-pre rounded-md border border-white/20 bg-black/75 px-3 py-2 font-mono text-[11px] leading-tight text-white"
          style={{ position: "fixed", top: 8, left: 8 }}
        >
          <p>mounted: {String(mounted)}</p>
          <p>nodes.length: {nodes.length}</p>
          <p>points.length: {points.length}</p>
          <p>view.w, view.h: {view.w}, {view.h}</p>
          <p>raw rect.width, rect.height: {lastMeasuredRect.width}, {lastMeasuredRect.height}</p>
          <p>bottomSafeAreaPx: {bottomSafeAreaPx}</p>
          <p>effectiveW, effectiveH: {lastComputedEffective.w}, {lastComputedEffective.h}</p>
          <p>mapReady: {String(mapReady)}</p>
        </div>
      ) : null}
      <style jsx>{`
        .progression-map-viewport {
          position: relative;
          width: 100%;
          height: 100%;
          overflow: hidden;
        }

        .progression-map-loading {
          position: relative;
          width: 100%;
          min-height: 520px;
        }

        .energy-flow {
          animation: energyMove 3s linear infinite;
        }

        @keyframes energyMove {
          from {
            stroke-dashoffset: 0;
          }
          to {
            stroke-dashoffset: -120;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .energy-flow {
            animation: none;
          }

          .energy-particle {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}

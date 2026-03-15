"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useParallax } from "@/hooks/useParallax";
import { cn } from "@/lib/utils";
import AxioraCosmicDust, { type AxioraCosmicDustHandle } from "./AxioraCosmicDust";
import AxioraStarField, { type AxioraStarFieldHandle } from "./AxioraStarField";
import { renderNode } from "./renderNode";
import "./styles/constellation.css";

export type NodeStatus = "done" | "current" | "available" | "locked";

export type MapNode = {
  id: string;
  lessonId: number;
  skill: string;
  difficulty: string;
  completed: boolean;
  stars: number;
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
  viewportHeight?: number;
  className?: string;
};

const NODE_GAP = 156;
const START_Y = 230;
const NODE_SIZE = 56;
const NODE_RADIUS = NODE_SIZE / 2;
const SAFE_TOP = 96;
const SAFE_BOTTOM = 156;
const SAFE_MARGIN = 116;

const SAFE_PAD = { top: 118, right: 132, bottom: 168, left: 132 };
const BADGE_ALLOW = 68;
const WORLD_END_PADDING = 300;
const VIEWPORT_HEIGHT = 780;
const MAX_ENERGY_PARTICLES = 12;
const LOW_TIER_PARTICLES = 8;
const MAX_UNLOCK_COMETS = 10;
const MAX_SPARKS = 3;
const PATH_PATTERN = [-1, 1, -0.6, 0.8, -0.4, 0.6];
const DEBUG_PERF = false;
const TEXT_PRIMARY = "rgba(240,249,255,0.92)";
const TEXT_MUTED = "rgba(226,232,240,0.72)";
const DESKTOP_TARGET_FRAME_MS = 18.5;
const MOBILE_DEGRADE_FRAME_MS = 36;
const DESKTOP_GRAPHICS_PRESET: "ultra" | "balanced" | "safe" = "balanced";

type PersistedMapData = {
  nodes: MapNode[];
  points: Array<{ x: number; y: number }>;
  worldWidth: number;
  worldHeight: number;
  activeIndex: number;
  curvedPath: string;
  progressPath: string;
};

type SampledPathPoint = {
  x: number;
  y: number;
};

type EnergyParticle = {
  t: number;
  speed: number;
  size: number;
  jitter: number;
  alive: boolean;
};

type UnlockComet = {
  t: number;
  speed: number;
  size: number;
  startIdx: number;
  endIdx: number;
  alive: boolean;
};

type Spark = {
  alive: boolean;
  x: number;
  y: number;
  dx: number;
  dy: number;
  angle: number;
  elapsedMs: number;
  ttlMs: number;
};

type UnlockFx = {
  nodeId: string;
  startTime: number;
  ttlMs: number;
};

const EMPTY_MAP_DATA: PersistedMapData = {
  nodes: [],
  points: [],
  worldWidth: 1,
  worldHeight: 1,
  activeIndex: -1,
  curvedPath: "",
  progressPath: "",
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function lerp(start: number, end: number, alpha: number) {
  return start + (end - start) * alpha;
}

function easeOutCubic(t: number) {
  const x = clamp(t, 0, 1);
  return 1 - Math.pow(1 - x, 3);
}

function getNodeRadiusByStatus(status: NodeStatus) {
  if (status === "current") return NODE_RADIUS + 4;
  if (status === "available") return NODE_RADIUS + 2;
  if (status === "done") return NODE_RADIUS + 2;
  return NODE_RADIUS;
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

function randomSpawnDelay() {
  return 300 + Math.random() * 200;
}

function randomParticle(quality: "low" | "high"): EnergyParticle {
  return {
    t: 0,
    speed: quality === "high" ? 0.00019 + Math.random() * 0.00017 : 0.00011 + Math.random() * 0.00012,
    size: quality === "high" ? 5 + Math.random() * 2 : 4 + Math.random() * 1.8,
    jitter: (Math.random() - 0.5) * (quality === "high" ? 3.5 : 2.6),
    alive: true,
  };
}

function nearestPointIndex(samplePoints: SampledPathPoint[], x: number, y: number) {
  let bestIdx = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < samplePoints.length; i += 1) {
    const p = samplePoints[i];
    const dx = p.x - x;
    const dy = p.y - y;
    const d = dx * dx + dy * dy;
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

export default function ProgressionMap({
  nodes,
  activeNodeId,
  selectedNodeId,
  onNodeClick,
  debug = false,
  viewportHeight = VIEWPORT_HEIGHT,
  className,
}: ProgressionMapProps) {
  useParallax();

  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const nebulaRef = useRef<HTMLDivElement>(null);
  const starsLayerRef = useRef<HTMLDivElement>(null);
  const dustLayerRef = useRef<HTMLDivElement>(null);
  const lensRef = useRef<HTMLDivElement>(null);
  const trailLayerRef = useRef<HTMLDivElement>(null);
  const starFieldRef = useRef<AxioraStarFieldHandle | null>(null);
  const cosmicDustRef = useRef<AxioraCosmicDustHandle | null>(null);
  const pathRef = useRef<SVGPathElement | null>(null);
  const energyParticleElsRef = useRef<Array<HTMLDivElement | null>>([]);
  const cometElsRef = useRef<Array<HTMLDivElement | null>>([]);
  const sparkElsRef = useRef<Array<HTMLDivElement | null>>([]);
  const sampledPathRef = useRef<SampledPathPoint[]>([]);
  const energyParticlesRef = useRef<EnergyParticle[]>(Array.from({ length: MAX_ENERGY_PARTICLES }, () => ({ t: 0, speed: 0, size: 0, jitter: 0, alive: false })));
  const unlockCometsRef = useRef<UnlockComet[]>(Array.from({ length: MAX_UNLOCK_COMETS }, () => ({ t: 0, speed: 0, size: 0, startIdx: 0, endIdx: 1, alive: false })));
  const sparksRef = useRef<Spark[]>(Array.from({ length: MAX_SPARKS }, () => ({ alive: false, x: 0, y: 0, dx: 0, dy: 0, angle: 0, elapsedMs: 0, ttlMs: 260 })));
  const spawnAccumulatorRef = useRef(0);
  const nextSpawnDelayRef = useRef(320);
  const lowTickAccumulatorRef = useRef(0);
  const visualUpdateAccumulatorRef = useRef(0);

  const cameraYRef = useRef(0);
  const focusImpulseRef = useRef(0);
  const focusVelocityRef = useRef(0);
  const focusTimeRef = useRef(0);
  const hasHydratedCameraRef = useRef(false);
  const lastFocusNodeKeyRef = useRef<string | null>(null);
  const targetCameraRef = useRef(0);
  const minCameraRef = useRef(0);
  const maxCameraRef = useRef(0);
  const worldOffsetXRef = useRef(0);
  const verticalOpticalOffsetRef = useRef(0);
  const enterStartRef = useRef<number | null>(null);
  const enterProgressRef = useRef(0);
  const warpStartRef = useRef<number | null>(null);
  const unlockFxRef = useRef<UnlockFx | null>(null);
  const prevNodeStatesRef = useRef<Record<string, NodeStatus>>({});
  const perfWindowMsRef = useRef(0);
  const perfFrameCountRef = useRef(0);
  const perfDtSumRef = useRef(0);
  const perfLogWindowMsRef = useRef(0);
  const perfLogFrameCountRef = useRef(0);
  const perfLogDtSumRef = useRef(0);
  const degradeTriggeredRef = useRef(false);
  const lastVisualSyncRef = useRef<{ enter: number; unlockNodeId: string | null; unlockProgress: number }>({
    enter: -1,
    unlockNodeId: null,
    unlockProgress: -1,
  });

  const [viewportW, setViewportW] = useState(1024);
  const [viewportHeightPx, setViewportHeightPx] = useState(viewportHeight);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [enterProgressVisual, setEnterProgressVisual] = useState(0);
  const [unlockVisual, setUnlockVisual] = useState<{ nodeId: string | null; progress: number }>({ nodeId: null, progress: 0 });
  const [degradedFx, setDegradedFx] = useState(false);
  const pointsRef = useRef<PersistedMapData | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const readViewportSize = () => {
      const measuredW = viewportRef.current?.getBoundingClientRect().width ?? 0;
      const measuredH = viewportRef.current?.getBoundingClientRect().height ?? 0;
      const fallbackW = Math.floor(window.innerWidth * 0.92);
      const fallbackH = viewportHeight;
      return {
        width: measuredW > 0 ? measuredW : fallbackW,
        height: measuredH > 0 ? measuredH : fallbackH,
      };
    };

    const updateViewportSize = () => {
      const { width: nextW, height: nextH } = readViewportSize();
      setViewportW(Math.max(320, nextW));
      setViewportHeightPx(Math.max(1, nextH));
    };

    updateViewportSize();

    const observer = new ResizeObserver(() => {
      updateViewportSize();
    });
    if (viewportRef.current) {
      observer.observe(viewportRef.current);
    }
    window.addEventListener("resize", updateViewportSize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateViewportSize);
    };
  }, [viewportHeight]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    enterStartRef.current = null;
    enterProgressRef.current = 0;
    setEnterProgressVisual(0);
  }, [nodes.length]);

  const view = { w: viewportW, h: viewportHeightPx };
  const trackWidth = Math.max(320, viewportW);
  const trackCenter = trackWidth / 2;
  const isMobile = trackWidth < 768;
  const compactMobile = trackWidth < 480;
  const quality: "low" | "high" = isMobile ? "low" : "high";
  const nodeGap = useMemo(() => {
    if (nodes.length <= 1) return NODE_GAP;
    if (!isMobile) {
      const verticalAvailable = Math.max(440, view.h - 220);
      return Math.max(96, Math.min(NODE_GAP, Math.floor(verticalAvailable / (nodes.length - 1))));
    }
    return NODE_GAP;
  }, [isMobile, nodes.length, view.h]);
  const desktopHD = quality === "high";
  const desktopPresetConfig = desktopHD
    ? DESKTOP_GRAPHICS_PRESET === "ultra"
      ? { stars: 1.42, dust: 1.22, sampleCount: 760 }
      : DESKTOP_GRAPHICS_PRESET === "safe"
        ? { stars: 1.04, dust: 1.0, sampleCount: 420 }
        : { stars: 1.22, dust: 1.12, sampleCount: 520 }
    : { stars: 1.02, dust: 0.96, sampleCount: 280 };
  const energyParticleLimit = quality === "high" ? MAX_ENERGY_PARTICLES : LOW_TIER_PARTICLES;
  const starsDensityScale = degradedFx ? (desktopHD ? 0.94 : 0.84) : desktopPresetConfig.stars;
  const dustDensityScale = degradedFx ? (desktopHD ? 0.88 : 0.78) : desktopPresetConfig.dust;
  const sparksEnabled = !degradedFx;

  const amplitude = Math.min(160, trackWidth * 0.28);
  const computedPoints = useMemo<PersistedMapData>(() => {
    if (!nodes || nodes.length === 0) return EMPTY_MAP_DATA;

    const estimatedWorldHeight = Math.max(START_Y + Math.max(nodes.length - 1, 0) * nodeGap + SAFE_BOTTOM + NODE_RADIUS, 780);
    const rawPoints = nodes.map((_, gi) => {
      let x = trackCenter + PATH_PATTERN[gi % PATH_PATTERN.length] * amplitude;
      x = Math.max(SAFE_MARGIN, x);
      x = Math.min(trackWidth - SAFE_MARGIN, x);

      let y = START_Y + gi * nodeGap;
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
    const desktopTopInset = isMobile ? 0 : 56;
    minY -= SAFE_PAD.top + BADGE_ALLOW + desktopTopInset;
    maxY += SAFE_PAD.bottom + 18;

    const offsetX = -minX;
    const offsetY = -minY;
    const worldWidth = Math.max(1, maxX - minX);
    const trailMinX = Math.min(...rawPoints.map((point) => point.x));
    const trailMaxX = Math.max(...rawPoints.map((point) => point.x));
    const trailWidth = trailMaxX - trailMinX;
    const worldCenterOffsetX = (worldWidth - trailWidth) / 2 - trailMinX;
    const points = rawPoints.map((point) => ({ x: point.x + offsetX + worldCenterOffsetX, y: point.y + offsetY }));
    const minPointX = Math.min(...points.map((point) => point.x));
    const minPointY = Math.min(...points.map((point) => point.y));
    const normalizedPoints = points.map((point) => ({
      x: point.x - minPointX,
      y: point.y - minPointY,
    }));
    const worldEndPadding = isMobile ? WORLD_END_PADDING : 120;
    const worldHeight = Math.max(1, maxY - minY + worldEndPadding);

    const activeIndex = (() => {
      if (!nodes.length) return -1;
      if (activeNodeId) {
        const byId = nodes.findIndex((node) => node.id === activeNodeId);
        if (byId >= 0) return byId;
      }
      const byStatus = nodes.findIndex((node) => node.status === "current");
      return byStatus >= 0 ? byStatus : 0;
    })();

    const curvedPath = buildPath(normalizedPoints);
    const progressPath = buildProgressPath(normalizedPoints, activeIndex);

    return {
      nodes,
      points: normalizedPoints,
      worldWidth,
      worldHeight,
      activeIndex,
      curvedPath,
      progressPath,
    };
  }, [activeNodeId, amplitude, isMobile, nodeGap, nodes, trackCenter, trackWidth]);

  useEffect(() => {
    if (computedPoints.points.length > 0) {
      pointsRef.current = computedPoints;
    }
  }, [computedPoints]);

  const mapData = computedPoints ?? pointsRef.current;
  const renderNodes = mapData?.nodes ?? EMPTY_MAP_DATA.nodes;
  const points = mapData?.points ?? EMPTY_MAP_DATA.points;
  const worldWidth = mapData?.worldWidth ?? 1;
  const worldHeight = mapData?.worldHeight ?? 1;
  const activeIndex = mapData?.activeIndex ?? -1;
  const curvedPath = mapData?.curvedPath ?? "";
  const progressPath = mapData?.progressPath ?? "";

  const cameraRange = useMemo(() => {
    if (!points.length || view.h <= 0 || worldHeight <= 0) {
      return { clampedCamera: 0, minCamera: 0, maxCamera: 0 };
    }
    const minCamera = 0;
    const maxCamera = Math.max(0, worldHeight - view.h);
    if (!isMobile && points.length <= 6) {
      return { clampedCamera: 0, minCamera, maxCamera };
    }
    const safeIndex = clamp(activeIndex, 0, points.length - 1);
    const activeNodeY = points[safeIndex]?.y ?? points[0]?.y ?? 0;
    const targetY = activeNodeY - view.h / 2;
    return {
      clampedCamera: Math.max(minCamera, Math.min(maxCamera, targetY)),
      minCamera,
      maxCamera,
    };
  }, [activeIndex, isMobile, points, view.h, worldHeight]);

  const minNodeX = points.length ? Math.min(...points.map((point) => point.x)) : 0;
  const maxNodeX = points.length ? Math.max(...points.map((point) => point.x)) : 0;
  const nodesCenterX = (minNodeX + maxNodeX) / 2;
  const viewportCenterX = view.w / 2;
  const worldOffsetX = viewportCenterX - nodesCenterX;
  const opticalOffset = -view.w * 0.01;
  const finalOffsetX = worldOffsetX + opticalOffset;
  const verticalOpticalOffset = isMobile ? view.h * 0.12 : 36;

  useEffect(() => {
    targetCameraRef.current = cameraRange.clampedCamera;
    minCameraRef.current = cameraRange.minCamera;
    maxCameraRef.current = cameraRange.maxCamera;

    // Avoid bad first paint on refresh: snap camera to first valid target before RAF smoothing.
    if (!hasHydratedCameraRef.current) {
      hasHydratedCameraRef.current = true;
      cameraYRef.current = cameraRange.clampedCamera;
      if (worldRef.current) {
        const snappedOffsetX = Math.round(finalOffsetX);
        const snappedOffsetY = Math.round(-cameraYRef.current + verticalOpticalOffset);
        worldRef.current.style.transform = `translate3d(${snappedOffsetX}px, ${snappedOffsetY}px, 0)`;
      }
    }
  }, [cameraRange.clampedCamera, cameraRange.maxCamera, cameraRange.minCamera, finalOffsetX, verticalOpticalOffset]);

  useEffect(() => {
    worldOffsetXRef.current = finalOffsetX;
    verticalOpticalOffsetRef.current = verticalOpticalOffset;
  }, [finalOffsetX, verticalOpticalOffset]);

  const focusNodeKey = selectedNodeId ?? activeNodeId ?? (activeIndex >= 0 ? `${activeIndex}` : "none");
  useEffect(() => {
    if (lastFocusNodeKeyRef.current === null) {
      lastFocusNodeKeyRef.current = focusNodeKey;
      return;
    }
    if (lastFocusNodeKeyRef.current === focusNodeKey) return;
    lastFocusNodeKeyRef.current = focusNodeKey;
    focusImpulseRef.current = 1;
    focusVelocityRef.current = 0;
    focusTimeRef.current = 0;
    warpStartRef.current = performance.now();
  }, [focusNodeKey]);

  useEffect(() => {
    if (!pathRef.current || !curvedPath) {
      sampledPathRef.current = [];
      return;
    }

    const path = pathRef.current;
    const total = path.getTotalLength();
    const sampleCount = desktopPresetConfig.sampleCount;

    if (!Number.isFinite(total) || total <= 0 || sampleCount < 2) {
      sampledPathRef.current = [];
      return;
    }

    const sampled: SampledPathPoint[] = [];
    for (let i = 0; i < sampleCount; i += 1) {
      const lengthAt = total * (i / (sampleCount - 1));
      const point = path.getPointAtLength(lengthAt);
      sampled.push({ x: point.x, y: point.y });
    }

    sampledPathRef.current = sampled;
  }, [curvedPath, desktopPresetConfig.sampleCount]);

  useEffect(() => {
    if (!points.length || sampledPathRef.current.length < 2) return;

    const currentStates: Record<string, NodeStatus> = {};
    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i];
      if (!node) continue;
      currentStates[node.id] = node.status;
    }

    const prev = prevNodeStatesRef.current;
    let newlyUnlockedNodeId: string | null = null;
    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i];
      if (!node) continue;
      if (prev[node.id] === "locked" && node.status !== "locked") {
        newlyUnlockedNodeId = node.id;
        break;
      }
    }
    prevNodeStatesRef.current = currentStates;
    if (!newlyUnlockedNodeId) return;

    const nodeIndex = nodes.findIndex((node) => node.id === newlyUnlockedNodeId);
    const nodePoint = nodeIndex >= 0 ? points[nodeIndex] : null;
    if (!nodePoint) return;

    const endIdx = nearestPointIndex(sampledPathRef.current, nodePoint.x, nodePoint.y);
    const startIdx = Math.max(0, endIdx - 80);

    unlockFxRef.current = {
      nodeId: newlyUnlockedNodeId,
      startTime: performance.now(),
      ttlMs: 900,
    };

    const cometsToSpawn = 6 + Math.floor(Math.random() * 5);
    for (let i = 0; i < unlockCometsRef.current.length; i += 1) {
      if (i >= cometsToSpawn) {
        unlockCometsRef.current[i].alive = false;
        continue;
      }
      unlockCometsRef.current[i] = {
        t: 0,
        speed: 1 / (600 + Math.random() * 120),
        size: 4 + Math.random() * 2,
        startIdx,
        endIdx,
        alive: true,
      };
    }
  }, [nodes, points]);

  useEffect(() => {
    if (reducedMotion || sampledPathRef.current.length < 2) {
      energyParticlesRef.current = Array.from({ length: MAX_ENERGY_PARTICLES }, () => ({ t: 0, speed: 0, size: 0, jitter: 0, alive: false }));
      energyParticleElsRef.current.forEach((el) => {
        if (el) {
          el.style.opacity = "0";
        }
      });
      return;
    }

    energyParticlesRef.current = Array.from({ length: MAX_ENERGY_PARTICLES }, () => ({ t: 0, speed: 0, size: 0, jitter: 0, alive: false }));
    spawnAccumulatorRef.current = 0;
    nextSpawnDelayRef.current = randomSpawnDelay();
  }, [quality, reducedMotion, curvedPath]);

  useEffect(() => {
    if (!worldRef.current) return;
    const initialY = Math.round(-cameraYRef.current + verticalOpticalOffsetRef.current);
    worldRef.current.style.transform = `translate3d(${Math.round(worldOffsetXRef.current)}px, ${initialY}px, 0)`;
  }, [worldWidth, worldHeight]);

  useEffect(() => {
    let rafId = 0;
    let lastTs = 0;

    const tick = (ts: number) => {
      if (!lastTs) {
        lastTs = ts;
      }
      let dt = Math.min(60, ts - lastTs || 16.67);
      lastTs = ts;

      if (quality === "low") {
        lowTickAccumulatorRef.current += dt;
        if (lowTickAccumulatorRef.current < 33) {
          rafId = window.requestAnimationFrame(tick);
          return;
        }
        dt = lowTickAccumulatorRef.current;
        lowTickAccumulatorRef.current = 0;
      }

      if (!enterStartRef.current) {
        enterStartRef.current = ts;
      }
      const enterElapsed = ts - enterStartRef.current;
      enterProgressRef.current = easeOutCubic(clamp(enterElapsed / 900, 0, 1));

      const cameraDamping = reducedMotion ? 1 : 0.08;
      const alpha = reducedMotion ? 1 : 1 - Math.pow(1 - cameraDamping, dt / 16.67);
      const overshootAmplitude = isMobile ? 7 : 12;
      focusVelocityRef.current += -focusImpulseRef.current * 0.06;
      focusVelocityRef.current *= Math.pow(0.86, dt / 16.67);
      focusTimeRef.current = Math.min(1, focusTimeRef.current + dt / 480);
      focusImpulseRef.current *= Math.pow(0.9, dt / 16.67);
      const overshootBase = Math.sin(focusTimeRef.current * Math.PI) * overshootAmplitude * focusImpulseRef.current;
      const overshoot = reducedMotion ? 0 : overshootBase + focusVelocityRef.current * 10;
      const targetWithOvershoot = targetCameraRef.current + overshoot;
      cameraYRef.current = lerp(cameraYRef.current, targetWithOvershoot, alpha);

      const enterYOffset = (1 - enterProgressRef.current) * 18;
      const snappedOffsetX = Math.round(worldOffsetXRef.current);
      const snappedOffsetY = Math.round(-cameraYRef.current + verticalOpticalOffsetRef.current + enterYOffset);
      if (worldRef.current) {
        worldRef.current.style.transform = `translate3d(${snappedOffsetX}px, ${snappedOffsetY}px, 0)`;
      }

      const warpRaw = warpStartRef.current ? clamp((ts - warpStartRef.current) / 420, 0, 1) : 0;
      const warpPulse = warpStartRef.current ? easeOutCubic(warpRaw) : 0;
      const nebulaBaseOpacity = isMobile ? 0.4 : 0.55;
      if (nebulaRef.current) {
        nebulaRef.current.style.transform = `translate3d(0, ${Math.round(cameraYRef.current * 0.15 + warpPulse * 14)}px, 0)`;
        nebulaRef.current.style.opacity = `${Math.min(1, nebulaBaseOpacity + warpPulse * 0.05)}`;
      }
      if (starsLayerRef.current) {
        starsLayerRef.current.style.transform = `translate3d(0,0,0) scale(${(1 + warpPulse * 0.02).toFixed(4)})`;
        starsLayerRef.current.style.opacity = `${Math.max(0.65, 1 - warpPulse * 0.08)}`;
      }
      if (dustLayerRef.current) {
        dustLayerRef.current.style.transform = `translate3d(0, ${Math.round(warpPulse * 10)}px, 0)`;
      }
      if (lensRef.current) {
        const lensY = cameraYRef.current * 0.08 + Math.sin(ts * 0.0009) * 6;
        const lensX = Math.sin(ts * 0.0007) * 8;
        lensRef.current.style.transform = `translate3d(${Math.round(lensX)}px, ${Math.round(lensY)}px, 0)`;
      }
      if (trailLayerRef.current) {
        trailLayerRef.current.style.opacity = `${clamp(enterProgressRef.current * 1.1, 0, 1)}`;
      }

      if (!reducedMotion) {
        starFieldRef.current?.renderFrame(ts, cameraYRef.current);
        cosmicDustRef.current?.renderFrame(ts, cameraYRef.current);
      }

      const sampled = sampledPathRef.current;
      if (!reducedMotion && sampled.length > 1) {
        spawnAccumulatorRef.current += dt;
        if (spawnAccumulatorRef.current >= nextSpawnDelayRef.current) {
          spawnAccumulatorRef.current = 0;
          nextSpawnDelayRef.current = randomSpawnDelay();
          const aliveCount = energyParticlesRef.current.slice(0, energyParticleLimit).filter((particle) => particle.alive).length;
          if (aliveCount < energyParticleLimit) {
            const availableSlot = energyParticlesRef.current.slice(0, energyParticleLimit).findIndex((particle) => !particle.alive);
            if (availableSlot >= 0) {
              energyParticlesRef.current[availableSlot] = randomParticle(quality);
            }
          }
        }

        for (let i = 0; i < energyParticlesRef.current.length; i += 1) {
          const particle = energyParticlesRef.current[i];
          const el = energyParticleElsRef.current[i];
          if (!particle || !el) continue;

          if (i >= energyParticleLimit) {
            particle.alive = false;
            el.style.opacity = "0";
            continue;
          }
          if (!particle.alive) {
            el.style.opacity = "0";
            continue;
          }

          particle.t += particle.speed * dt;
          if (particle.t > 1) {
            energyParticlesRef.current[i] = randomParticle(quality);
            continue;
          }

          const idxFloat = particle.t * (sampled.length - 1);
          const idxA = Math.floor(idxFloat);
          const idxB = Math.min(sampled.length - 1, idxA + 1);
          const frac = idxFloat - idxA;

          const pointA = sampled[idxA];
          const pointB = sampled[idxB];
          if (!pointA || !pointB) {
            el.style.opacity = "0";
            continue;
          }

          const x = pointA.x + (pointB.x - pointA.x) * frac;
          const y = pointA.y + (pointB.y - pointA.y) * frac + Math.sin((ts / 1000 + i) * 3.2) * particle.jitter;
          const phase = Math.sin(particle.t * Math.PI);
          const localOpacity = 0.35 + phase * 0.65;
          const scale = (0.75 + phase * 0.45) * (particle.size / 6);

          el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale.toFixed(3)})`;
          el.style.opacity = localOpacity.toFixed(3);
        }

        for (let i = 0; i < unlockCometsRef.current.length; i += 1) {
          const comet = unlockCometsRef.current[i];
          const el = cometElsRef.current[i];
          if (!comet || !el) continue;
          if (!comet.alive) {
            el.style.opacity = "0";
            continue;
          }

          comet.t += comet.speed * dt;
          if (comet.t >= 1) {
            comet.alive = false;
            el.style.opacity = "0";
            continue;
          }

          const idx = Math.floor(lerp(comet.startIdx, comet.endIdx, comet.t));
          const nextIdx = Math.min(sampled.length - 1, idx + 1);
          const pA = sampled[idx];
          const pB = sampled[nextIdx];
          if (!pA || !pB) {
            el.style.opacity = "0";
            continue;
          }

          const cx = lerp(pA.x, pB.x, comet.t % 1);
          const cy = lerp(pA.y, pB.y, comet.t % 1);
          el.style.width = `${comet.size * 2}px`;
          el.style.height = `${Math.max(2, comet.size * 0.6)}px`;
          el.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
          el.style.opacity = `${1 - comet.t}`;
        }

        if (sparksEnabled && Math.random() < (0.015 * dt) / 1000) {
          const aliveSparks = sparksRef.current.filter((spark) => spark.alive).length;
          if (aliveSparks < MAX_SPARKS) {
            const freeIdx = sparksRef.current.findIndex((spark) => !spark.alive);
            const point = sampled[Math.floor(Math.random() * sampled.length)];
            if (freeIdx >= 0 && point) {
              sparksRef.current[freeIdx] = {
                alive: true,
                x: point.x,
                y: point.y,
                dx: 2 + Math.random() * 4,
                dy: (Math.random() - 0.5) * 3,
                angle: (Math.random() - 0.5) * 24,
                elapsedMs: 0,
                ttlMs: 260,
              };
            }
          }
        }

        for (let i = 0; i < sparksRef.current.length; i += 1) {
          const spark = sparksRef.current[i];
          const el = sparkElsRef.current[i];
          if (!spark || !el || !spark.alive || !sparksEnabled) {
            if (el) {
              el.style.opacity = "0";
            }
            continue;
          }

          spark.elapsedMs += dt;
          const p = clamp(spark.elapsedMs / spark.ttlMs, 0, 1);
          if (p >= 1) {
            spark.alive = false;
            el.style.opacity = "0";
            continue;
          }
          const glow = p < 0.5 ? p * 2 : (1 - p) * 2;
          const sx = spark.x + spark.dx * p;
          const sy = spark.y + spark.dy * p;
          el.style.transform = `translate3d(${sx}px, ${sy}px, 0) rotate(${spark.angle}deg)`;
          el.style.opacity = `${glow}`;
        }
      } else {
        for (let i = 0; i < energyParticleElsRef.current.length; i += 1) {
          const el = energyParticleElsRef.current[i];
          if (el) {
            el.style.opacity = "0";
          }
        }
      }

      let unlockNodeId: string | null = null;
      let unlockProgress = 0;
      const unlock = unlockFxRef.current;
      if (unlock) {
        unlockProgress = clamp((ts - unlock.startTime) / unlock.ttlMs, 0, 1);
        unlockNodeId = unlock.nodeId;
        if (unlockProgress >= 1) {
          unlockFxRef.current = null;
          unlockNodeId = null;
          unlockProgress = 0;
        }
      }

      visualUpdateAccumulatorRef.current += dt;
      if (visualUpdateAccumulatorRef.current >= 33) {
        visualUpdateAccumulatorRef.current = 0;
        const lastVisual = lastVisualSyncRef.current;
        const nextEnter = enterProgressRef.current;
        const enterDelta = Math.abs(nextEnter - lastVisual.enter);
        if (enterDelta > 0.012) {
          setEnterProgressVisual(nextEnter);
          lastVisual.enter = nextEnter;
        }

        const unlockNodeChanged = unlockNodeId !== lastVisual.unlockNodeId;
        const unlockDelta = Math.abs(unlockProgress - lastVisual.unlockProgress);
        if (unlockNodeChanged || unlockDelta > 0.02) {
          setUnlockVisual({ nodeId: unlockNodeId, progress: unlockProgress });
          lastVisual.unlockNodeId = unlockNodeId;
          lastVisual.unlockProgress = unlockProgress;
        }
      }

      perfWindowMsRef.current += dt;
      perfFrameCountRef.current += 1;
      perfDtSumRef.current += dt;
      if (perfWindowMsRef.current >= 2000) {
        const avgDt = perfDtSumRef.current / Math.max(1, perfFrameCountRef.current);
        const degradeThreshold = desktopHD ? DESKTOP_TARGET_FRAME_MS : MOBILE_DEGRADE_FRAME_MS;
        if (avgDt > degradeThreshold && !degradedFx) {
          degradeTriggeredRef.current = true;
          setDegradedFx(true);
        }
        perfWindowMsRef.current = 0;
        perfFrameCountRef.current = 0;
        perfDtSumRef.current = 0;
      }

      if (DEBUG_PERF) {
        perfLogWindowMsRef.current += dt;
        perfLogFrameCountRef.current += 1;
        perfLogDtSumRef.current += dt;
        if (perfLogWindowMsRef.current >= 1000) {
          const avgDt = perfLogDtSumRef.current / Math.max(1, perfLogFrameCountRef.current);
          const fps = avgDt > 0 ? 1000 / avgDt : 0;
          console.log(
            `[ProgressionMap][perf] avg dt=${avgDt.toFixed(2)}ms fps~${fps.toFixed(1)} quality=${quality} preset=${desktopHD ? DESKTOP_GRAPHICS_PRESET : "mobile"} degraded=${degradedFx} degradeTriggered=${degradeTriggeredRef.current}`,
          );
          perfLogWindowMsRef.current = 0;
          perfLogFrameCountRef.current = 0;
          perfLogDtSumRef.current = 0;
        }
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [degradedFx, desktopHD, energyParticleLimit, isMobile, quality, reducedMotion, sparksEnabled]);

  void debug;

  if (!points || points.length === 0) {
    return (
      <div
        style={{
          height: `${viewportHeight}px`,
          position: "relative",
        }}
      />
    );
  }

  if (nodes.length === 0) {
    return <div className="progression-map-loading">Loading trail...</div>;
  }

  return (
    <div
      ref={containerRef}
      className={cn("relative w-full", className)}
      style={{
        position: "relative",
        width: "100%",
        height: `${viewportHeight}px`,
        overflow: "hidden",
      }}
    >
      <div className="relative z-10 h-full w-full">
        <div
          ref={viewportRef}
          className="progression-map-viewport"
          style={{
            position: "relative",
            width: "100%",
            height: `${viewportHeight}px`,
            overflow: "hidden",
          }}
        >
          <div ref={nebulaRef} className="hidden" />

          <div className="hidden" aria-hidden />

          <div className="hidden" aria-hidden />

          <div className="hidden" aria-hidden />

          <div className="hidden" aria-hidden />

          <div className="hidden" aria-hidden />

          <div ref={starsLayerRef} className="hidden" aria-hidden>
            <AxioraStarField ref={starFieldRef} width={view.w} height={view.h} cameraY={cameraYRef.current} quality={quality} densityScale={starsDensityScale} />
          </div>

          <div ref={dustLayerRef} className="hidden" aria-hidden>
            <AxioraCosmicDust ref={cosmicDustRef} width={view.w} height={view.h} cameraY={cameraYRef.current} quality={quality} densityScale={dustDensityScale} />
          </div>

          <div ref={lensRef} className="hidden" aria-hidden />

          <div
            ref={worldRef}
            className="progression-map-world"
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: `${trackWidth}px`,
              height: `${worldHeight}px`,
              willChange: "transform",
              transform: `translate3d(${Math.round(finalOffsetX)}px, ${Math.round(-cameraYRef.current + verticalOpticalOffset)}px, 0)`,
            }}
          >
            {null}

            <div className="hidden" style={{ width: `${trackWidth}px`, height: `${worldHeight}px` }} aria-hidden>
              {renderNodes.map((node, index) => {
                const point = points[index];
                if (!point) return null;

                const auraSize = node.status === "current" ? 280 : node.status === "done" ? 220 : 150;
                const auraBackground =
                  node.status === "current"
                    ? "radial-gradient(circle, rgba(56,189,248,0.24) 0%, rgba(59,130,246,0.14) 28%, rgba(167,139,250,0.08) 44%, rgba(2,6,23,0) 72%)"
                    : node.status === "done"
                      ? "radial-gradient(circle, rgba(52,211,153,0.18) 0%, rgba(16,185,129,0.10) 28%, rgba(250,204,21,0.06) 42%, rgba(2,6,23,0) 70%)"
                      : "radial-gradient(circle, rgba(148,163,184,0.10) 0%, rgba(51,65,85,0.06) 30%, rgba(2,6,23,0) 66%)";

                return (
                  <div
                    key={`node-aura-${node.id}`}
                    className={cn("absolute rounded-full", node.status === "current" ? "node-aura-current" : node.status === "done" ? "node-aura-done" : "node-aura-locked")}
                    style={{
                      left: point.x,
                      top: point.y,
                      width: `${auraSize}px`,
                      height: `${auraSize}px`,
                      transform: "translate(-50%, -50%)",
                      background: auraBackground,
                    }}
                  />
                );
              })}
            </div>

            <div
              ref={trailLayerRef}
              className="pointer-events-none absolute left-1/2 top-0 z-[5] -translate-x-1/2"
              style={{ width: `${trackWidth}px`, height: `${worldHeight}px` }}
            >
              <svg
                className="absolute left-0 top-0"
                width={trackWidth}
                height={worldHeight}
                viewBox={`0 0 ${trackWidth} ${worldHeight}`}
                preserveAspectRatio="xMidYMin meet"
                shapeRendering="geometricPrecision"
                style={{ overflow: "visible" }}
                aria-hidden
              >
                <defs />

                <path
                  ref={pathRef}
                  d={curvedPath}
                  stroke={isMobile ? "rgba(255,255,255,0.62)" : "rgba(255,255,255,0.5)"}
                  strokeWidth={isMobile ? 5 : 3}
                  fill="none"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
                {progressPath ? (
                  <path
                    d={progressPath}
                    stroke="#ffffff"
                    strokeWidth={isMobile ? 6 : 4}
                    opacity={0.82}
                    fill="none"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null}
              </svg>
            </div>

            <div className="hidden" style={{ width: `${trackWidth}px`, height: `${worldHeight}px` }} aria-hidden>
              {Array.from({ length: MAX_ENERGY_PARTICLES }).map((_, index) => (
                <div
                  key={`energy-slot-${index}`}
                  ref={(el) => {
                    energyParticleElsRef.current[index] = el;
                  }}
                  className="path-energy"
                  style={{ transform: "translate3d(-9999px,-9999px,0)", opacity: 0 }}
                />
              ))}
            </div>

            <div className="hidden" style={{ width: `${trackWidth}px`, height: `${worldHeight}px` }} aria-hidden>
              {Array.from({ length: MAX_UNLOCK_COMETS }).map((_, index) => (
                <div
                  key={`comet-${index}`}
                  ref={(el) => {
                    cometElsRef.current[index] = el;
                  }}
                  className="path-comet"
                  style={{ transform: "translate3d(-9999px,-9999px,0)", opacity: 0 }}
                />
              ))}
              {Array.from({ length: MAX_SPARKS }).map((_, index) => (
                <div
                  key={`spark-${index}`}
                  ref={(el) => {
                    sparkElsRef.current[index] = el;
                  }}
                  className="path-spark"
                  style={{ transform: "translate3d(-9999px,-9999px,0)", opacity: 0 }}
                />
              ))}
            </div>

            <div className="absolute left-1/2 top-0 z-[11] -translate-x-1/2" style={{ width: `${trackWidth}px`, height: `${worldHeight}px` }}>
              {renderNodes.map((node, index) => {
                const point = points[index];
                if (!point) return null;
                return renderNode({
                  node,
                  point,
                  prevPoint: points[index - 1],
                  nextPoint: points[index + 1],
                  nodeIndex: index,
                  compactMobile,
                  highlightedNodeId: selectedNodeId ?? activeNodeId,
                  onNodeClick,
                  quality,
                  reducedMotion,
                  enterProgress: enterProgressVisual,
                  unlockBurstProgress: unlockVisual.nodeId === node.id ? unlockVisual.progress : 0,
                });
              })}
            </div>
          </div>

          {debug ? (
            <div className="legend-chips pointer-events-none absolute right-6 top-6 z-[30] flex gap-2">
              <div className="inline-flex items-center gap-1.5 rounded-full px-2 py-[2px] text-[12px]" style={{ background: "rgba(10,18,34,0.76)", color: TEXT_MUTED, border: "1px solid rgba(255,255,255,0.06)" }}>
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
                Concluído
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full px-2 py-[2px] text-[12px]" style={{ background: "rgba(10,18,34,0.76)", color: TEXT_PRIMARY, border: "1px solid rgba(255,255,255,0.06)" }}>
                <span className="inline-block h-2 w-2 rounded-full bg-[#FF9A48]" />
                Atual
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full px-2 py-[2px] text-[12px]" style={{ background: "rgba(10,18,34,0.76)", color: TEXT_MUTED, border: "1px solid rgba(255,255,255,0.06)" }}>
                <span className="inline-block h-2 w-2 rounded-full bg-slate-500" />
                Bloqueado
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <style jsx global>{`
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

        .nebula-layer {
          opacity: 0.46;
          background:
            radial-gradient(circle at 14% 18%, rgba(56, 189, 248, 0.2), transparent 30%),
            radial-gradient(circle at 82% 26%, rgba(14, 165, 233, 0.15), transparent 32%),
            radial-gradient(circle at 48% 76%, rgba(59, 130, 246, 0.13), transparent 38%),
            radial-gradient(circle at 64% 52%, rgba(125, 211, 252, 0.08), transparent 26%),
            radial-gradient(circle at 70% 18%, rgba(250, 204, 21, 0.06), transparent 18%),
            radial-gradient(circle at 32% 62%, rgba(167, 139, 250, 0.08), transparent 24%);
          will-change: transform;
        }

        .nebula-low {
          opacity: 0.28;
        }

        .energy-flow {
          animation: energyMove 3s linear infinite;
        }

        .cosmic-breathe {
          animation: cosmicBreathe 12s ease-in-out infinite;
          transform-origin: center center;
        }

        .node-aura-current,
        .node-aura-done,
        .node-aura-locked {
          will-change: transform, opacity;
          mix-blend-mode: screen;
        }

        .node-aura-current {
          animation: auraFloat 9s ease-in-out infinite;
        }

        .node-aura-done {
          animation: auraFloat 12s ease-in-out infinite;
          opacity: 0.92;
        }

        .node-aura-locked {
          opacity: 0.72;
        }

        .path-energy {
          position: absolute;
          left: 0;
          top: 0;
          width: 6px;
          height: 6px;
          border-radius: 9999px;
          background: radial-gradient(circle, #e0f2fe 0%, #7dd3fc 38%, #38bdf8 65%, #8b5cf6 100%);
          box-shadow: 0 0 10px rgba(56, 189, 248, 0.95), 0 0 20px rgba(139, 92, 246, 0.5);
          will-change: transform, opacity;
          pointer-events: none;
        }

        .path-comet {
          position: absolute;
          left: 0;
          top: 0;
          border-radius: 9999px;
          background: linear-gradient(90deg, rgba(125, 211, 252, 0), rgba(255, 255, 255, 0.92), rgba(125, 211, 252, 0.88), rgba(125, 211, 252, 0));
          box-shadow: 0 0 12px rgba(56, 189, 248, 0.95), 0 0 22px rgba(167, 139, 250, 0.28);
          pointer-events: none;
          will-change: transform, opacity;
        }

        .path-spark {
          position: absolute;
          left: 0;
          top: 0;
          width: 14px;
          height: 2px;
          background: linear-gradient(90deg, rgba(125, 211, 252, 0), rgba(125, 211, 252, 0.9), rgba(125, 211, 252, 0));
          pointer-events: none;
          will-change: transform, opacity;
        }

        @keyframes energyMove {
          from {
            stroke-dashoffset: 0;
          }
          to {
            stroke-dashoffset: -120;
          }
        }

        @keyframes cosmicBreathe {
          0%,
          100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.01);
          }
        }

        @keyframes auraFloat {
          0%,
          100% {
            transform: translate(-50%, -50%) scale(1);
          }
          50% {
            transform: translate(-50%, -50%) scale(1.05);
          }
        }

        @keyframes orbit {
          from {
            transform: translate(-50%, -50%) rotate(0deg);
          }
          to {
            transform: translate(-50%, -50%) rotate(360deg);
          }
        }

        @keyframes orbitReverse {
          from {
            transform: translate(-50%, -50%) rotate(360deg);
          }
          to {
            transform: translate(-50%, -50%) rotate(0deg);
          }
        }

        @keyframes pulseHalo {
          0%,
          100% {
            transform: translate(-50%, -50%) scale(0.98);
            opacity: 0.55;
          }
          50% {
            transform: translate(-50%, -50%) scale(1.05);
            opacity: 0.85;
          }
        }

        .active-halo {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 74px;
          height: 74px;
          border-radius: 9999px;
          background: radial-gradient(circle, rgba(56, 189, 248, 0.16), transparent 62%);
          animation: pulseHalo 2.4s ease-in-out infinite;
          will-change: transform, opacity;
          pointer-events: none;
        }

        .orbital-ring {
          position: absolute;
          left: 50%;
          top: 50%;
          border: 1px solid rgba(56, 189, 248, 0.38);
          border-radius: 9999px;
          will-change: transform, opacity;
          pointer-events: none;
        }

        .orbital-ring::after {
          content: "";
          position: absolute;
          left: 50%;
          top: -2px;
          width: 5px;
          height: 5px;
          transform: translateX(-50%);
          border-radius: 9999px;
          background: rgba(125, 211, 252, 0.95);
          box-shadow: 0 0 10px rgba(56, 189, 248, 0.85);
        }

        .orbital-ring-dot-lg::after {
          top: -3px;
          width: 6px;
          height: 6px;
        }

        .orbital-ring-dot-sm::after {
          top: -2px;
          width: 4px;
          height: 4px;
          opacity: 0.92;
        }

        .orbital-ring-1 {
          animation: orbit 7.5s linear infinite;
        }

        .orbital-ring-2 {
          animation: orbitReverse 11s linear infinite;
        }

        @media (prefers-reduced-motion: reduce) {
          .cosmic-breathe,
          .energy-flow,
          .active-halo,
          .orbital-ring,
          .orbital-ring-1,
          .orbital-ring-2,
          .orbital-ring-3 {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}

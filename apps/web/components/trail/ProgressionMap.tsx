"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useParallax } from "@/hooks/useParallax";
import { cn } from "@/lib/utils";
import AxioraCosmicDust, { type AxioraCosmicDustHandle } from "./AxioraCosmicDust";
import AxioraStarField, { type AxioraStarFieldHandle } from "./AxioraStarField";
import { renderNode } from "./renderNode";
import "./styles/constellation.css";
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
  viewportHeight?: number;
  className?: string;
};

const NODE_GAP = 120;
const START_Y = 160;
const NODE_SIZE = 48;
const NODE_RADIUS = NODE_SIZE / 2;
const SAFE_TOP = 70;
const SAFE_BOTTOM = 120;
const SAFE_MARGIN = 90;

const SAFE_PAD = { top: 90, right: 110, bottom: 130, left: 110 };
const BADGE_ALLOW = 52;
const WORLD_END_PADDING = 220;
const VIEWPORT_HEIGHT = 640;
const MAX_ENERGY_PARTICLES = 12;
const LOW_TIER_PARTICLES = 8;
const MAX_UNLOCK_COMETS = 10;
const MAX_SPARKS = 3;
const PATH_PATTERN = [-1, 1, -0.6, 0.8, -0.4, 0.6];

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
  const energyParticleLimit = quality === "high" ? MAX_ENERGY_PARTICLES : LOW_TIER_PARTICLES;
  const starsDensityScale = degradedFx ? 0.8 : 1;
  const dustDensityScale = degradedFx ? 0.7 : 1;
  const sparksEnabled = !degradedFx;

  const amplitude = Math.min(160, trackWidth * 0.28);
  const computedPoints = useMemo<PersistedMapData>(() => {
    if (!nodes || nodes.length === 0) return EMPTY_MAP_DATA;

    const estimatedWorldHeight = Math.max(START_Y + Math.max(nodes.length - 1, 0) * NODE_GAP + SAFE_BOTTOM + NODE_RADIUS, 780);
    const rawPoints = nodes.map((_, gi) => {
      let x = trackCenter + PATH_PATTERN[gi % PATH_PATTERN.length] * amplitude;
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
    const minPointX = Math.min(...points.map((point) => point.x));
    const minPointY = Math.min(...points.map((point) => point.y));
    const normalizedPoints = points.map((point) => ({
      x: point.x - minPointX,
      y: point.y - minPointY,
    }));
    const worldHeight = Math.max(1, maxY - minY + WORLD_END_PADDING);

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
  }, [activeNodeId, amplitude, nodes, trackCenter, trackWidth]);

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
    const safeIndex = clamp(activeIndex, 0, points.length - 1);
    const activeNodeY = points[safeIndex]?.y ?? points[0]?.y ?? 0;
    const targetY = activeNodeY - view.h / 2;
    const minCamera = 0;
    const maxCamera = Math.max(0, worldHeight - view.h);
    return {
      clampedCamera: Math.max(minCamera, Math.min(maxCamera, targetY)),
      minCamera,
      maxCamera,
    };
  }, [activeIndex, points, view.h, worldHeight]);

  const minNodeX = points.length ? Math.min(...points.map((point) => point.x)) : 0;
  const maxNodeX = points.length ? Math.max(...points.map((point) => point.x)) : 0;
  const nodesCenterX = (minNodeX + maxNodeX) / 2;
  const viewportCenterX = view.w / 2;
  const worldOffsetX = viewportCenterX - nodesCenterX;
  const opticalOffset = -view.w * 0.01;
  const finalOffsetX = worldOffsetX + opticalOffset;
  const verticalOpticalOffset = view.h * 0.12;

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
    const sampleCount = quality === "high" ? 300 : 180;

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
  }, [curvedPath, quality]);

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
          const localOpacity = 0.35 + (1 - particle.t) * 0.65;

          el.style.width = `${particle.size}px`;
          el.style.height = `${particle.size}px`;
          el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
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
        setEnterProgressVisual(enterProgressRef.current);
        setUnlockVisual({ nodeId: unlockNodeId, progress: unlockProgress });
      }

      perfWindowMsRef.current += dt;
      perfFrameCountRef.current += 1;
      perfDtSumRef.current += dt;
      if (perfWindowMsRef.current >= 2000) {
        const avgDt = perfDtSumRef.current / Math.max(1, perfFrameCountRef.current);
        if (avgDt > 40 && !degradedFx) {
          setDegradedFx(true);
        }
        perfWindowMsRef.current = 0;
        perfFrameCountRef.current = 0;
        perfDtSumRef.current = 0;
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [degradedFx, energyParticleLimit, isMobile, quality, reducedMotion, sparksEnabled]);

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
      className={cn("axiora-parallax relative w-full", className)}
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
          <div ref={nebulaRef} className={cn("nebula-layer pointer-events-none absolute inset-0 z-[0]", quality === "high" ? "nebula-high" : "nebula-low")} />

          <div ref={starsLayerRef} className="pointer-events-none absolute inset-0 z-[1] will-change-transform" aria-hidden>
            <AxioraStarField ref={starFieldRef} width={view.w} height={view.h} cameraY={cameraYRef.current} quality={quality} densityScale={starsDensityScale} />
          </div>

          <div ref={dustLayerRef} className="pointer-events-none absolute inset-0 z-[2] will-change-transform" aria-hidden>
            <AxioraCosmicDust ref={cosmicDustRef} width={view.w} height={view.h} cameraY={cameraYRef.current} quality={quality} densityScale={dustDensityScale} />
          </div>

          <div
            ref={lensRef}
            className={cn("pointer-events-none absolute inset-0 z-[3] will-change-transform", quality === "high" ? "opacity-[0.35]" : "opacity-[0.22]")}
            style={{ mixBlendMode: "screen", background: "radial-gradient(closest-side, rgba(125,211,252,0.10), transparent 60%)" }}
            aria-hidden
          />

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
            <TrailConstellation isCurrent={activeIndex >= 0} />

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
                style={{ overflow: "visible" }}
                aria-hidden
              >
                <defs>
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
                  <filter id="routeGlow">
                    <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#38bdf8" floodOpacity="0.8" />
                  </filter>
                </defs>

                <path
                  ref={pathRef}
                  d={curvedPath}
                  stroke={isMobile ? "rgba(255,255,255,0.26)" : "rgba(255,255,255,0.16)"}
                  strokeWidth={isMobile ? 6 : 3}
                  fill="none"
                  strokeLinecap="round"
                  filter="url(#routeGlow)"
                />
                <path
                  d={curvedPath}
                  fill="none"
                  stroke="url(#energyGradient)"
                  strokeWidth={4}
                  strokeLinecap="round"
                  strokeDasharray="12 18"
                  className="energy-flow"
                  opacity={0.35}
                />
                {progressPath ? (
                  <path
                    d={progressPath}
                    stroke="url(#trailEnergy)"
                    strokeWidth={isMobile ? 7 : 4}
                    fill="none"
                    strokeLinecap="round"
                    filter="url(#routeGlow)"
                    style={{ filter: "drop-shadow(0 0 22px rgba(56,189,248,0.8))" }}
                  />
                ) : null}
              </svg>
            </div>

            <div className="pointer-events-none absolute left-1/2 top-0 z-[6] -translate-x-1/2" style={{ width: `${trackWidth}px`, height: `${worldHeight}px` }} aria-hidden>
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

            <div className="pointer-events-none absolute left-1/2 top-0 z-[7] -translate-x-1/2" style={{ width: `${trackWidth}px`, height: `${worldHeight}px` }} aria-hidden>
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

          <div className="pointer-events-none absolute right-3 top-3 z-[30] rounded-xl border border-white/15 bg-slate-900/35 px-3 py-2 text-[11px] text-slate-100/90 backdrop-blur-md">
            <div className="mb-1 font-semibold tracking-wide text-slate-200/95">Legenda</div>
            <div className="flex items-center gap-2"><span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />Concluído</div>
            <div className="flex items-center gap-2"><span className="inline-block h-2 w-2 rounded-full bg-sky-400" />Atual</div>
            <div className="flex items-center gap-2"><span className="inline-block h-2 w-2 rounded-full bg-slate-500" />Bloqueado</div>
          </div>
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
          opacity: 0.55;
          background:
            radial-gradient(circle at 14% 18%, rgba(56, 189, 248, 0.24), transparent 44%),
            radial-gradient(circle at 82% 26%, rgba(14, 165, 233, 0.2), transparent 48%),
            radial-gradient(circle at 48% 76%, rgba(59, 130, 246, 0.17), transparent 58%);
          will-change: transform;
        }

        .nebula-low {
          opacity: 0.4;
        }

        .energy-flow {
          animation: energyMove 3s linear infinite;
        }

        .path-energy {
          position: absolute;
          left: 0;
          top: 0;
          width: 6px;
          height: 6px;
          border-radius: 9999px;
          background: radial-gradient(circle, #7dd3fc, #0284c7);
          box-shadow: 0 0 8px rgba(56, 189, 248, 0.9), 0 0 16px rgba(2, 132, 199, 0.85);
          will-change: transform, opacity;
          pointer-events: none;
        }

        .path-comet {
          position: absolute;
          left: 0;
          top: 0;
          border-radius: 9999px;
          background: linear-gradient(90deg, rgba(125, 211, 252, 0), rgba(125, 211, 252, 0.95), rgba(125, 211, 252, 0));
          box-shadow: 0 0 12px rgba(56, 189, 248, 0.95);
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
          width: 84px;
          height: 84px;
          border-radius: 9999px;
          background: radial-gradient(circle, rgba(56, 189, 248, 0.25), transparent 65%);
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

        .orbital-ring-1 {
          animation: orbit 6s linear infinite;
        }

        .orbital-ring-2 {
          animation: orbitReverse 9s linear infinite;
          opacity: 0.9;
        }

        .orbital-ring-3 {
          animation: orbit 14s linear infinite;
          opacity: 0.52;
        }

        @media (max-width: 767px) {
          .orbital-ring-1 {
            animation-duration: 8s;
          }

          .orbital-ring-2 {
            animation-duration: 12s;
          }
        }

        @media (prefers-reduced-motion: reduce) {
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

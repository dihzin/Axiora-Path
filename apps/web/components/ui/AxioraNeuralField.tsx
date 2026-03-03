"use client";

import { useEffect, useRef } from "react";

type NeuralNode = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  depth: number;
  midLinkChance: number;
};

type NeuralPulse = {
  path: number[];
  segmentIndex: number;
  segmentProgress: number;
  speedPxPerSec: number;
  radius: number;
  alpha: number;
};

type NeuralConnection = {
  fromIndex: number;
  toIndex: number;
  curveOffset: number;
  phase: number;
  visibilitySeed: number;
  angleBias: number;
  noiseSeed: number;
};

type ActiveConnection = {
  from: number;
  to: number;
  cpx: number;
  cpy: number;
};

type RenderConnectionSegment = {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  controlX: number;
  controlY: number;
  branchFromX: number;
  branchFromY: number;
  branchToX: number;
  branchToY: number;
  branchControlX: number;
  branchControlY: number;
  depthFactor: number;
  alpha: number;
  lineWidth: number;
  fade: number;
};

type NeuralParticle = {
  x: number;
  y: number;
  r: number;
  alpha: number;
  depth: number;
  vx: number;
  vy: number;
  phase: number;
};

type PerfMode = "HIGH" | "MED" | "LOW";
type FpsLogEntry = { t: number; fps: number; mode: PerfMode };
type FpsStats = { avg: number; min: number; max: number };

declare global {
  interface Window {
    __AXIORA_NEURALFIELD_DUMP_FPS?: () => string;
  }
}

export default function AxioraNeuralField({ debug = false }: { debug?: boolean }) {
  // Debug validation (60s):
  // 1) Enable <AxioraNeuralField debug={true} /> in apps/web/app/layout.tsx.
  // 2) Open browser console on the target screen.
  // 3) Wait ~60s while interacting normally.
  // 4) Run window.__AXIORA_NEURALFIELD_DUMP_FPS() and copy the output.
  // 5) Optional: capture a screenshot with the on-canvas debug overlay visible.
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fpsRef = useRef({
    frames: 0,
    last: typeof performance !== "undefined" ? performance.now() : 0,
    fps: 0,
  });
  const showFpsRef = useRef(false);
  const perfModeRef = useRef<PerfMode>("HIGH");
  const lowFpsStreakRef = useRef(0);
  const fpsLogRef = useRef<Array<FpsLogEntry | null>>(Array.from({ length: 180 }, () => null));
  const fpsLogHeadRef = useRef(0);
  const fpsStatsRef = useRef<FpsStats>({ avg: 0, min: 0, max: 0 });
  const lastFrameRef = useRef(0);
  const lastTickRef = useRef(0);

  useEffect(() => {
    showFpsRef.current = debug;
    if (debug) {
      fpsLogRef.current = Array.from({ length: 180 }, () => null);
      fpsLogHeadRef.current = 0;
      fpsStatsRef.current = { avg: 0, min: 0, max: 0 };
      window.__AXIORA_NEURALFIELD_DUMP_FPS = () => {
        const size = fpsLogRef.current.length;
        const head = fpsLogHeadRef.current;
        const ordered: FpsLogEntry[] = [];
        for (let i = 0; i < size; i += 1) {
          const index = (head + i) % size;
          const entry = fpsLogRef.current[index];
          if (entry) ordered.push(entry);
        }
        return ordered
          .map((entry) => `${new Date(entry.t).toISOString()} | FPS=${entry.fps.toFixed(1)} | MODE=${entry.mode}`)
          .join("\n");
      };
    } else {
      delete window.__AXIORA_NEURALFIELD_DUMP_FPS;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const setSize = () => {
      const rawDpr = window.devicePixelRatio || 1;
      const dpr = Math.min(rawDpr, 1.5);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    setSize();

    const width = window.innerWidth;
    const height = window.innerHeight;
    const leftZoneWidth = width * 0.35;
    const rightZoneStart = width * 0.65;
    const nodes: NeuralNode[] = [];
    const particles: NeuralParticle[] = [];
    const edgeKey = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`;
    const smoothstep = (t: number) => t * t * (3 - 2 * t);
    const hash2d = (x: number, y: number) => {
      const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
      return s - Math.floor(s);
    };
    const valueNoise2d = (x: number, y: number) => {
      const xi = Math.floor(x);
      const yi = Math.floor(y);
      const xf = x - xi;
      const yf = y - yi;
      const u = smoothstep(xf);
      const v = smoothstep(yf);
      const n00 = hash2d(xi, yi);
      const n10 = hash2d(xi + 1, yi);
      const n01 = hash2d(xi, yi + 1);
      const n11 = hash2d(xi + 1, yi + 1);
      const nx0 = n00 + (n10 - n00) * u;
      const nx1 = n01 + (n11 - n01) * u;
      return nx0 + (nx1 - nx0) * v;
    };
    const fbm2d = (x: number, y: number) => {
      const n1 = valueNoise2d(x, y);
      const n2 = valueNoise2d(x * 2.03 + 13.1, y * 2.03 + 7.9);
      const n3 = valueNoise2d(x * 4.09 + 29.7, y * 4.09 + 3.4);
      return (n1 * 0.6 + n2 * 0.3 + n3 * 0.1) * 2 - 1;
    };
    const pickNodePosition = (isLeft: boolean) => {
      const minY = height * 0.035;
      const maxY = height * 0.965;
      const candidateCount = 16;
      let fallbackX = isLeft ? Math.random() * leftZoneWidth : rightZoneStart + Math.random() * (width * 0.35);
      let fallbackY = Math.random() * (maxY - minY) + minY;
      for (let attempt = 0; attempt < candidateCount; attempt += 1) {
        const spreadPower = 0.7 + Math.random() * 0.8;
        const lane = Math.pow(Math.random(), spreadPower);
        const x = isLeft
          ? lane * leftZoneWidth
          : rightZoneStart + (1 - lane) * (width - rightZoneStart);
        const y = Math.random() * (maxY - minY) + minY;
        fallbackX = x;
        fallbackY = y;
        const preferredSpacing = 30 + Math.random() * 44;
        const ok = nodes.every((node) => Math.hypot(node.x - x, node.y - y) >= preferredSpacing);
        if (ok) return { x, y };
      }
      return { x: fallbackX, y: fallbackY };
    };

    for (let i = 0; i < 32; i += 1) {
      const isLeft = i < 16;
      const position = pickNodePosition(isLeft);
      nodes.push({
        x: position.x,
        y: position.y,
        vx: (Math.random() - 0.5) * 0.2,
        vy: (Math.random() - 0.5) * 0.2,
        phase: Math.random() * Math.PI * 2,
        depth: Math.random(),
        midLinkChance: Math.random(),
      });
    }

    for (let i = 0; i < 28; i += 1) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        r: 0.6 + Math.random() * 1.0,
        alpha: 0.04 + Math.random() * 0.1,
        depth: Math.random(),
        vx: (Math.random() - 0.5) * 0.06,
        vy: (Math.random() - 0.5) * 0.06,
        phase: Math.random() * Math.PI * 2,
      });
    }

    const neuralConnections: NeuralConnection[] = [];
    const seenConnectionSeeds = new Set<string>();
    nodes.forEach((nodeA, i) => {
      const distances = nodes
        .map((nodeB, j) => ({
          index: j,
          dist: Math.hypot(nodeA.x - nodeB.x, nodeA.y - nodeB.y),
        }))
        .filter((d) => d.index !== i)
        .sort((a, b) => a.dist - b.dist);

      distances.slice(0, 2).forEach(({ index }) => {
        const fromIndex = Math.min(i, index);
        const toIndex = Math.max(i, index);
        const key = edgeKey(fromIndex, toIndex);
        if (seenConnectionSeeds.has(key)) return;
        seenConnectionSeeds.add(key);
        neuralConnections.push({
          fromIndex,
          toIndex,
          curveOffset: (Math.random() - 0.5) * 36,
          phase: Math.random() * Math.PI * 2,
          visibilitySeed: Math.random(),
          angleBias: (Math.random() - 0.5) * 0.8,
          noiseSeed: Math.random() * 1000,
        });
      });

      if (nodeA.midLinkChance < 0.25) {
        const mid = distances[3];
        if (mid) {
          const fromIndex = Math.min(i, mid.index);
          const toIndex = Math.max(i, mid.index);
          const key = edgeKey(fromIndex, toIndex);
          if (!seenConnectionSeeds.has(key)) {
            seenConnectionSeeds.add(key);
            neuralConnections.push({
              fromIndex,
              toIndex,
              curveOffset: (Math.random() - 0.5) * 30,
              phase: Math.random() * Math.PI * 2,
              visibilitySeed: Math.random(),
              angleBias: (Math.random() - 0.5) * 0.6,
              noiseSeed: Math.random() * 1000,
            });
          }
        }
      }
    });

    // Reduce closed triangles to bias topology toward branching trees over dense meshes.
    {
      const edgeSet = new Set<string>(neuralConnections.map((c) => edgeKey(c.fromIndex, c.toIndex)));
      const edgeLength = (a: number, b: number) => Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y);
      const edgesToDrop = new Set<string>();

      for (let a = 0; a < nodes.length; a += 1) {
        for (let b = a + 1; b < nodes.length; b += 1) {
          const ab = edgeKey(a, b);
          if (!edgeSet.has(ab)) continue;
          for (let c = b + 1; c < nodes.length; c += 1) {
            const ac = edgeKey(a, c);
            const bc = edgeKey(b, c);
            if (!(edgeSet.has(ac) && edgeSet.has(bc))) continue;
            if (Math.random() > 0.65) continue;

            const candidates = [
              { key: ab, len: edgeLength(a, b) },
              { key: ac, len: edgeLength(a, c) },
              { key: bc, len: edgeLength(b, c) },
            ].sort((x, y) => y.len - x.len);
            const selected = candidates[Math.floor(Math.random() * 2)];
            edgesToDrop.add(selected.key);
            edgeSet.delete(selected.key);
          }
        }
      }

      if (edgesToDrop.size > 0) {
        for (let i = neuralConnections.length - 1; i >= 0; i -= 1) {
          const key = edgeKey(neuralConnections[i].fromIndex, neuralConnections[i].toIndex);
          if (edgesToDrop.has(key)) neuralConnections.splice(i, 1);
        }
      }
    }

    const nodeDegree = new Array<number>(nodes.length).fill(0);
    for (const connection of neuralConnections) {
      nodeDegree[connection.fromIndex] += 1;
      nodeDegree[connection.toIndex] += 1;
    }
    const maxDegree = Math.max(...nodeDegree, 1);

    const pulses: NeuralPulse[] = [];
    let activeConnections: ActiveConnection[] = [];
    let frameId = 0;
    let flowPulseTimerId = 0;
    let energy = 0;
    const mouseRef = { x: 0, y: 0 };
    const smoothedMouseRef = { x: 0, y: 0 };
    const TARGET_FPS = 30;
    const FRAME_MS = 1000 / TARGET_FPS;
    const FPS_LOW_THRESHOLD = Math.max(16, Math.floor(TARGET_FPS * 0.76));
    const FPS_RECOVER_THRESHOLD = Math.max(FPS_LOW_THRESHOLD + 2, Math.floor(TARGET_FPS * 0.9));
    const MODE_TO_MED_STREAK = 3;
    const MODE_TO_LOW_STREAK = 6;

    const depthToBucket = (depth: number) => Math.max(0, Math.min(9, Math.floor(depth * 10)));
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const depthColorBuckets = Array.from({ length: 10 }, (_, bucket) => {
      const depth = bucket / 9;
      const saturation = 60 + depth * 25;
      const lightness = 55 - depth * 10;
      return `hsl(18, ${saturation}%, ${lightness}%)`;
    });
    const depthParticleColorBuckets = Array.from({ length: 10 }, (_, bucket) => {
      const depth = bucket / 9;
      const saturation = 34 + depth * 14;
      const lightness = 64 - depth * 8;
      return `hsl(18, ${saturation}%, ${lightness}%)`;
    });

    const getParallaxStrength = (mode: PerfMode) => {
      if (mode === "LOW") return 4;
      if (mode === "MED") return 10;
      return 14;
    };

    const getParallaxX = (baseX: number, depth: number, strength: number, viewportWidth: number) => {
      const rawOffset = smoothedMouseRef.x * strength * depth;
      if (baseX < viewportWidth * 0.5) return Math.min(rawOffset, 0);
      return Math.max(rawOffset, 0);
    };

    const setSourceOver = () => {
      ctx.globalCompositeOperation = "source-over";
    };

    const setLighter = () => {
      ctx.globalCompositeOperation = "lighter";
    };

    const sampleQuadraticPoint = (
      t: number,
      fromX: number,
      fromY: number,
      cpx: number,
      cpy: number,
      toX: number,
      toY: number,
    ) => {
      const omt = 1 - t;
      return {
        x: omt * omt * fromX + 2 * omt * t * cpx + t * t * toX,
        y: omt * omt * fromY + 2 * omt * t * cpy + t * t * toY,
      };
    };

    const estimateQuadraticLength = (
      fromX: number,
      fromY: number,
      cpx: number,
      cpy: number,
      toX: number,
      toY: number,
    ) => {
      let length = 0;
      let prev = sampleQuadraticPoint(0, fromX, fromY, cpx, cpy, toX, toY);
      const samples = 10;
      for (let i = 1; i <= samples; i += 1) {
        const t = i / samples;
        const next = sampleQuadraticPoint(t, fromX, fromY, cpx, cpy, toX, toY);
        length += Math.hypot(next.x - prev.x, next.y - prev.y);
        prev = next;
      }
      return Math.max(1, length);
    };

    const pickPulsePath = (connections: ActiveConnection[]) => {
      if (connections.length < 3) return null;
      const adjacency = new Map<number, number[]>();
      for (const connection of connections) {
        const fromList = adjacency.get(connection.from) ?? [];
        fromList.push(connection.to);
        adjacency.set(connection.from, fromList);
        const toList = adjacency.get(connection.to) ?? [];
        toList.push(connection.from);
        adjacency.set(connection.to, toList);
      }
      const candidates = Array.from(adjacency.entries())
        .filter(([, neighbors]) => neighbors.length > 0)
        .map(([node]) => node);
      if (!candidates.length) return null;

      for (let attempt = 0; attempt < 8; attempt += 1) {
        const targetEdges = 3 + Math.floor(Math.random() * 3);
        const start = candidates[Math.floor(Math.random() * candidates.length)];
        const path = [start];
        const usedEdges = new Set<string>();
        let current = start;

        while (path.length - 1 < targetEdges) {
          const neighbors = adjacency.get(current) ?? [];
          if (!neighbors.length) break;
          const fresh = neighbors.filter((next) => !usedEdges.has(edgeKey(current, next)));
          const pool = fresh.length ? fresh : neighbors;
          const next = pool[Math.floor(Math.random() * pool.length)];
          usedEdges.add(edgeKey(current, next));
          path.push(next);
          current = next;
        }

        if (path.length - 1 >= 3) return path;
      }
      return null;
    };

    const applyCenterCutout = (renderCtx: CanvasRenderingContext2D, w: number, h: number) => {
      const minDim = Math.min(w, h);
      const innerRadius = Math.max(220, Math.min(280, minDim * 0.26));
      const outerRadius = Math.max(360, Math.min(460, minDim * 0.44));
      const cx = w / 2;
      const cy = h * 0.35;

      renderCtx.save();
      renderCtx.globalCompositeOperation = "destination-out";

      // Elliptical falloff to keep center clear while preserving lateral activity.
      renderCtx.translate(cx, cy);
      renderCtx.scale(1.16, 0.92);
      const gradient = renderCtx.createRadialGradient(0, 0, innerRadius * 0.35, 0, 0, outerRadius);
      gradient.addColorStop(0, "rgba(0,0,0,1)");
      gradient.addColorStop(0.5, "rgba(0,0,0,1)");
      gradient.addColorStop(0.82, "rgba(0,0,0,0.32)");
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      renderCtx.fillStyle = gradient;
      renderCtx.fillRect(-w, -h, w * 2, h * 2);

      renderCtx.restore();
    };

    const renderConnectionsBatched = (segments: RenderConnectionSegment[], mode: PerfMode, breath: number, nowMs: number) => {
      if (!segments.length) return;
      const previousGlobalAlpha = ctx.globalAlpha;
      const glowModeScale = mode === "LOW" ? 0.7 : mode === "MED" ? 0.88 : 1;
      const layerStyles = [
        {
          // near: low depth factor
          color: "hsl(18, 86%, 56%)",
          alphaMul: 1.18,
          widthMul: 1.12,
          glowMul: 1.12,
        },
        {
          // mid: baseline
          color: "hsl(18, 72%, 54%)",
          alphaMul: 1,
          widthMul: 1,
          glowMul: 1,
        },
        {
          // far: high depth factor
          color: "hsl(18, 50%, 52%)",
          alphaMul: 0.7,
          widthMul: 0.78,
          glowMul: 0.72,
        },
      ] as const;
      const grouped: [RenderConnectionSegment[], RenderConnectionSegment[], RenderConnectionSegment[]] = [[], [], []];
      const appendQuadraticWindow = (
        fromX: number,
        fromY: number,
        cpx: number,
        cpy: number,
        toX: number,
        toY: number,
        tStart: number,
        tEnd: number,
      ) => {
        const samples = 6;
        const start = sampleQuadraticPoint(tStart, fromX, fromY, cpx, cpy, toX, toY);
        ctx.moveTo(start.x, start.y);
        for (let i = 1; i <= samples; i += 1) {
          const t = tStart + (tEnd - tStart) * (i / samples);
          const point = sampleQuadraticPoint(t, fromX, fromY, cpx, cpy, toX, toY);
          ctx.lineTo(point.x, point.y);
        }
      };

      for (const segment of segments) {
        const bucketIndex = segment.depthFactor < 0.34 ? 0 : segment.depthFactor < 0.67 ? 1 : 2;
        grouped[bucketIndex].push(segment);
      }

      for (let bucketIndex = 0; bucketIndex < grouped.length; bucketIndex += 1) {
        const bucket = grouped[bucketIndex];
        if (!bucket.length) continue;

        let avgBaseAlpha = 0;
        let avgBaseWidth = 0;
        let avgGlow1Alpha = 0;
        let avgGlow2Alpha = 0;
        for (const segment of bucket) {
          const fadeNorm = Math.max(0, Math.min(1, (segment.fade - 0.4) / 0.6));
          const depthAlpha = 0.5 + segment.depthFactor * 0.5;
          const depthWidth = 0.65 + segment.depthFactor * 0.55;
          const jitterWidth =
            (segment.depthFactor > 0.4 ? segment.lineWidth * (0.98 + fadeNorm * 0.04) : segment.lineWidth) * depthWidth;
          avgBaseWidth += jitterWidth;
          avgBaseAlpha += segment.fade * segment.alpha * depthAlpha;
          avgGlow1Alpha += segment.fade * breath * 0.075 * segment.depthFactor * glowModeScale;
          avgGlow2Alpha += segment.fade * breath * 0.038 * segment.depthFactor * glowModeScale;
        }

        const invCount = 1 / bucket.length;
        const layerStyle = layerStyles[bucketIndex];
        const baseWidth = avgBaseWidth * invCount * layerStyle.widthMul;
        const baseAlpha = avgBaseAlpha * invCount * layerStyle.alphaMul;
        const glow1Alpha = Math.min(0.08, avgGlow1Alpha * invCount * layerStyle.alphaMul * layerStyle.glowMul);
        const glow2Alpha = Math.min(0.04, avgGlow2Alpha * invCount * layerStyle.alphaMul * layerStyle.glowMul);
        const strokeColor = layerStyle.color;
        const glowWindows = [
          { start: 0.02, end: 0.44, mul: 0.92 },
          { start: 0.28, end: 0.76, mul: 1.0 },
          { start: 0.62, end: 0.98, mul: 0.86 },
        ] as const;

        // BASE
        ctx.save();
        setSourceOver();
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.globalAlpha = previousGlobalAlpha * baseAlpha;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = baseWidth;
        ctx.beginPath();
        for (const segment of bucket) {
          ctx.moveTo(segment.fromX, segment.fromY);
          ctx.quadraticCurveTo(segment.controlX, segment.controlY, segment.toX, segment.toY);
          ctx.moveTo(segment.branchFromX, segment.branchFromY);
          ctx.quadraticCurveTo(segment.branchControlX, segment.branchControlY, segment.branchToX, segment.branchToY);
        }
        ctx.stroke();
        ctx.restore();

        // GLOW1 / GLOW2 with subtle alpha gradients along length (non-uniform windows).
        for (let windowIndex = 0; windowIndex < glowWindows.length; windowIndex += 1) {
          const window = glowWindows[windowIndex];
          const pulseWave = 0.9 + 0.1 * Math.sin(nowMs * 0.001 + bucketIndex * 1.17 + windowIndex * 1.43);

          ctx.save();
          setLighter();
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.globalAlpha = previousGlobalAlpha * Math.min(0.08, glow1Alpha * window.mul * pulseWave);
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = baseWidth * 1.8;
          ctx.beginPath();
          for (const segment of bucket) {
            appendQuadraticWindow(
              segment.fromX,
              segment.fromY,
              segment.controlX,
              segment.controlY,
              segment.toX,
              segment.toY,
              window.start,
              window.end,
            );
            appendQuadraticWindow(
              segment.branchFromX,
              segment.branchFromY,
              segment.branchControlX,
              segment.branchControlY,
              segment.branchToX,
              segment.branchToY,
              window.start,
              window.end,
            );
          }
          ctx.stroke();
          ctx.restore();

          ctx.save();
          setLighter();
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.globalAlpha = previousGlobalAlpha * Math.min(0.04, glow2Alpha * window.mul * pulseWave);
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = baseWidth * 2.6;
          ctx.beginPath();
          for (const segment of bucket) {
            appendQuadraticWindow(
              segment.fromX,
              segment.fromY,
              segment.controlX,
              segment.controlY,
              segment.toX,
              segment.toY,
              window.start,
              window.end,
            );
            appendQuadraticWindow(
              segment.branchFromX,
              segment.branchFromY,
              segment.branchControlX,
              segment.branchControlY,
              segment.branchToX,
              segment.branchToY,
              window.start,
              window.end,
            );
          }
          ctx.stroke();
          ctx.restore();
        }
      }

      setSourceOver();
      ctx.globalAlpha = previousGlobalAlpha;
    };

    const animate = () => {
      const nowMs = performance.now();
      frameId = window.requestAnimationFrame(animate);
      if (lastFrameRef.current === 0) {
        lastFrameRef.current = nowMs;
        lastTickRef.current = nowMs;
      }
      if (nowMs - lastFrameRef.current < FRAME_MS) return;

      const dt = Math.max(0.6, Math.min(2.5, (nowMs - lastTickRef.current) / 16.666));
      lastTickRef.current = nowMs;
      lastFrameRef.current = nowMs;

      const currentWidth = window.innerWidth;
      const currentHeight = window.innerHeight;

      fpsRef.current.frames += 1;
      if (nowMs - fpsRef.current.last >= 1000) {
        fpsRef.current.fps = fpsRef.current.frames;
        fpsRef.current.frames = 0;
        fpsRef.current.last = nowMs;

        if (fpsRef.current.fps < FPS_LOW_THRESHOLD) {
          lowFpsStreakRef.current += 1;
        } else if (fpsRef.current.fps >= FPS_RECOVER_THRESHOLD) {
          lowFpsStreakRef.current = Math.max(lowFpsStreakRef.current - 1, 0);
        }

        let decisionAvg: number;
        if (debug) {
          const decisionSamples: number[] = [fpsRef.current.fps];
          for (let i = 0; i < 9; i += 1) {
            const idx = (fpsLogHeadRef.current - 1 - i + fpsLogRef.current.length) % fpsLogRef.current.length;
            const entry = fpsLogRef.current[idx];
            if (!entry) break;
            decisionSamples.push(entry.fps);
          }
          decisionAvg = decisionSamples.reduce((sum, value) => sum + value, 0) / Math.max(decisionSamples.length, 1);
        } else {
          decisionAvg = fpsRef.current.fps;
        }

        let nextMode = perfModeRef.current;
        if (lowFpsStreakRef.current >= MODE_TO_LOW_STREAK) {
          nextMode = "LOW";
        } else if (lowFpsStreakRef.current >= MODE_TO_MED_STREAK) {
          nextMode = "MED";
        } else if (lowFpsStreakRef.current === 0) {
          nextMode = "HIGH";
        }
        if (nextMode !== perfModeRef.current) {
          if (debug) {
            const prevMode = perfModeRef.current;
            const reason = nextMode === "HIGH" ? "fps_recovered" : "fps_low";
            const timestamp = new Date().toISOString();
            console.log(
              `[NeuralField PERF] MODE_CHANGE ts=${timestamp} prev=${prevMode} next=${nextMode} reason=${reason} avg=${decisionAvg.toFixed(1)} thresholds=low<${FPS_LOW_THRESHOLD}|recover>=${FPS_RECOVER_THRESHOLD}|med_streak>=${MODE_TO_MED_STREAK}|low_streak>=${MODE_TO_LOW_STREAK}`,
            );
          }
          perfModeRef.current = nextMode;
        }

        if (debug) {
          fpsLogRef.current[fpsLogHeadRef.current] = {
            t: Date.now(),
            fps: fpsRef.current.fps,
            mode: perfModeRef.current,
          };
          fpsLogHeadRef.current = (fpsLogHeadRef.current + 1) % fpsLogRef.current.length;

          const lastTen: number[] = [];
          for (let i = 0; i < 10; i += 1) {
            const idx = (fpsLogHeadRef.current - 1 - i + fpsLogRef.current.length) % fpsLogRef.current.length;
            const entry = fpsLogRef.current[idx];
            if (!entry) break;
            lastTen.push(entry.fps);
          }
          if (lastTen.length) {
            const total = lastTen.reduce((sum, value) => sum + value, 0);
            fpsStatsRef.current = {
              avg: total / lastTen.length,
              min: Math.min(...lastTen),
              max: Math.max(...lastTen),
            };
          }
        }

        if (debug) {
          console.log("[NeuralField FPS]", fpsRef.current.fps, "mode=", perfModeRef.current);
        }
      }

      const mode = perfModeRef.current;
      const time = nowMs * 0.001;
      const breath = 0.96 + Math.sin(nowMs * 0.00025) * 0.04;
      const smoothFactor = Math.min(1, 0.06 * dt);
      smoothedMouseRef.x += (mouseRef.x - smoothedMouseRef.x) * smoothFactor;
      smoothedMouseRef.y += (mouseRef.y - smoothedMouseRef.y) * smoothFactor;
      const parallaxStrength = getParallaxStrength(mode);

      ctx.clearRect(0, 0, currentWidth, currentHeight);
      energy += 0.01 * dt;
      const energyFactor = 0.018 * Math.sin(energy);
      ctx.fillStyle = `rgba(255,107,61,${0.028 + energyFactor})`;
      ctx.fillRect(0, 0, currentWidth, currentHeight);

      const particleLimit = mode === "HIGH" ? 28 : mode === "MED" ? 14 : 8;
      for (let i = 0; i < particleLimit; i += 1) {
        const particle = particles[i];
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;

        if (particle.x < 0) particle.x += currentWidth;
        if (particle.x > currentWidth) particle.x -= currentWidth;
        if (particle.y < 0) particle.y += currentHeight;
        if (particle.y > currentHeight) particle.y -= currentHeight;

        const twinkle = 0.85 + Math.sin(nowMs * 0.0006 + particle.phase) * 0.15;
        const depthAlpha = 0.45 + particle.depth * 0.55;
        const particleAlpha = particle.alpha * twinkle * depthAlpha;
        const particleColor = depthParticleColorBuckets[depthToBucket(particle.depth)];
        const renderX = particle.x + getParallaxX(particle.x, particle.depth, parallaxStrength, currentWidth);
        const renderY = particle.y + smoothedMouseRef.y * parallaxStrength * particle.depth;

        const previousGlobalAlpha = ctx.globalAlpha;
        setSourceOver();
        ctx.globalAlpha = previousGlobalAlpha * particleAlpha;
        ctx.fillStyle = particleColor;
        ctx.beginPath();
        ctx.arc(renderX, renderY, particle.r, 0, Math.PI * 2);
        ctx.fill();

        // Optional soft additive bloom without blur.
        setLighter();
        ctx.globalAlpha = previousGlobalAlpha * particleAlpha * 0.12;
        ctx.beginPath();
        ctx.arc(renderX, renderY, particle.r * 1.7, 0, Math.PI * 2);
        ctx.fill();

        setSourceOver();
        ctx.globalAlpha = previousGlobalAlpha;
      }

      const renderedNodePositions = new Array<{ x: number; y: number }>(nodes.length);
      for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) {
        const node = nodes[nodeIndex];
        node.x += node.vx * dt;
        node.y += node.vy * dt;
        node.x += Math.cos(time * 0.4 + node.phase) * 0.06 * dt;
        node.y += Math.sin(time * 0.35 + node.phase * 1.1) * 0.06 * dt;

        if (node.x < 0 || node.x > currentWidth) node.vx *= -1;
        if (node.y < 0 || node.y > currentHeight) node.vy *= -1;

        const depthFactor = node.depth;
        let nodeRadius = 1.2 + depthFactor * 2.2;
        nodeRadius = lerp(nodeRadius, nodeRadius * 1.4, depthFactor);
        const degree = nodeDegree[nodeIndex] ?? 0;
        nodeRadius += degree * 0.5;
        const degreeRatio = Math.min(1, degree / maxDegree);
        const degreeOpacity = lerp(0.6, 1.0, degreeRatio);
        const nodeAlpha = (0.2 + depthFactor * 0.7) * breath * degreeOpacity;
        const nodeBucket = depthToBucket(node.depth);
        const nodeColor = depthColorBuckets[nodeBucket];
        const renderX = node.x + getParallaxX(node.x, node.depth, parallaxStrength, currentWidth);
        const renderY = node.y + smoothedMouseRef.y * parallaxStrength * node.depth;
        renderedNodePositions[nodeIndex] = { x: renderX, y: renderY };

        const previousGlobalAlpha = ctx.globalAlpha;
        setSourceOver();
        ctx.globalAlpha = previousGlobalAlpha * nodeAlpha;
        ctx.fillStyle = nodeColor;
        ctx.beginPath();
        ctx.arc(renderX, renderY, nodeRadius, 0, Math.PI * 2);
        ctx.fill();

        // Soma-like additive glow to emphasize nodes over lines.
        setLighter();
        ctx.globalAlpha = previousGlobalAlpha * nodeAlpha * 0.32;
        ctx.beginPath();
        ctx.arc(renderX, renderY, nodeRadius * 2.05, 0, Math.PI * 2);
        ctx.fill();

        setLighter();
        ctx.globalAlpha = previousGlobalAlpha * nodeAlpha * 0.18;
        ctx.beginPath();
        ctx.arc(renderX, renderY, nodeRadius * 2.9, 0, Math.PI * 2);
        ctx.fill();

        setSourceOver();
        ctx.globalAlpha = previousGlobalAlpha;

        const synapseAlpha = 0.07 + (Math.sin(time * 1.8 + node.phase) + 1) * 0.06;
        ctx.beginPath();
        ctx.arc(renderX, renderY, nodeRadius + 1.6, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,140,100,${synapseAlpha})`;
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }

      activeConnections = [];
      const renderConnectionSegments: RenderConnectionSegment[] = [];
      for (const connection of neuralConnections) {
        if (mode === "LOW" && connection.visibilitySeed < 0.3) continue;

        const from = nodes[connection.fromIndex];
        const to = nodes[connection.toIndex];
        const fromRender = renderedNodePositions[connection.fromIndex] ?? { x: from.x, y: from.y };
        const toRender = renderedNodePositions[connection.toIndex] ?? { x: to.x, y: to.y };
        const fromX = fromRender.x;
        const fromY = fromRender.y;
        const toX = toRender.x;
        const toY = toRender.y;
        const midX = (fromX + toX) / 2;
        const midY = (fromY + toY) / 2;

        const depthFactor = (from.depth + to.depth) / 2;
        const segX = toX - fromX;
        const segY = toY - fromY;
        const segLen = Math.max(1, Math.hypot(segX, segY));
        const tangentX = segX / segLen;
        const tangentY = segY / segLen;
        const perpX = -tangentY;
        const perpY = tangentX;
        const angle = connection.angleBias * (0.65 + depthFactor * 0.35);
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        const rotatedPerpX = perpX * cosA - perpY * sinA;
        const rotatedPerpY = perpX * sinA + perpY * cosA;
        const curveBase = connection.curveOffset * (1 - depthFactor);
        const noise =
          fbm2d((midX + connection.noiseSeed * 0.07) * 0.006, (midY + connection.noiseSeed * 0.11 + nowMs * 0.0009) * 0.006) *
          (4 + (1 - depthFactor) * 4);
        const tangentNoise =
          fbm2d((midX + connection.noiseSeed * 0.23) * 0.0045, (midY + connection.noiseSeed * 0.29 + nowMs * 0.0006) * 0.0045) *
          1.8;
        const controlX = midX + rotatedPerpX * (curveBase + noise) + tangentX * tangentNoise;
        const controlY = midY + rotatedPerpY * (curveBase + noise) + tangentY * tangentNoise;
        const branchInsetStart = 0.16 + (1 - depthFactor) * 0.06;
        const branchInsetEnd = 0.86 + depthFactor * 0.08;
        const branchFromX = fromX + segX * branchInsetStart + rotatedPerpX * (1.2 + (1 - depthFactor) * 1.0);
        const branchFromY = fromY + segY * branchInsetStart + rotatedPerpY * (1.2 + (1 - depthFactor) * 1.0);
        const branchToX = fromX + segX * branchInsetEnd + rotatedPerpX * (-0.8 + depthFactor * 0.7);
        const branchToY = fromY + segY * branchInsetEnd + rotatedPerpY * (-0.8 + depthFactor * 0.7);
        const branchControlX =
          midX +
          rotatedPerpX * (curveBase * 0.62 + noise * 0.7 + 3.2 * (1 - depthFactor)) +
          tangentX * (tangentNoise * 0.45 + 0.9);
        const branchControlY =
          midY +
          rotatedPerpY * (curveBase * 0.62 + noise * 0.7 + 3.2 * (1 - depthFactor)) +
          tangentY * (tangentNoise * 0.45 + 0.9);
        const fade = 0.7 + Math.sin(nowMs * 0.0004 + connection.phase) * 0.3;
        const alpha = (0.08 + depthFactor * 0.45) * breath;
        const lineWidth = 0.5 + depthFactor * 1.8;

        renderConnectionSegments.push({
          fromX,
          fromY,
          toX,
          toY,
          controlX,
          controlY,
          branchFromX,
          branchFromY,
          branchToX,
          branchToY,
          branchControlX,
          branchControlY,
          depthFactor,
          alpha,
          lineWidth,
          fade,
        });

        activeConnections.push({
          from: connection.fromIndex,
          to: connection.toIndex,
          cpx: controlX,
          cpy: controlY,
        });
      }
      renderConnectionsBatched(renderConnectionSegments, mode, breath, nowMs);

      const connectionControlMap = new Map<string, { cpx: number; cpy: number }>();
      for (const connection of activeConnections) {
        connectionControlMap.set(edgeKey(connection.from, connection.to), { cpx: connection.cpx, cpy: connection.cpy });
      }

      for (let p = pulses.length - 1; p >= 0; p -= 1) {
        const pulse = pulses[p];
        const segmentCount = pulse.path.length - 1;
        if (segmentCount <= 0 || pulse.segmentIndex >= segmentCount) {
          pulses.splice(p, 1);
          continue;
        }

        const fromIndex = pulse.path[pulse.segmentIndex];
        const toIndex = pulse.path[pulse.segmentIndex + 1];
        const fromNode = renderedNodePositions[fromIndex] ?? nodes[fromIndex];
        const toNode = renderedNodePositions[toIndex] ?? nodes[toIndex];
        const control = connectionControlMap.get(edgeKey(fromIndex, toIndex));
        const cpx = control?.cpx ?? (fromNode.x + toNode.x) * 0.5;
        const cpy = control?.cpy ?? (fromNode.y + toNode.y) * 0.5;
        const segmentLength = estimateQuadraticLength(fromNode.x, fromNode.y, cpx, cpy, toNode.x, toNode.y);
        const elapsedMs = dt * 16.666;
        pulse.segmentProgress += (pulse.speedPxPerSec * elapsedMs) / (1000 * segmentLength);

        while (pulse.segmentProgress >= 1 && pulse.segmentIndex < segmentCount) {
          pulse.segmentProgress -= 1;
          pulse.segmentIndex += 1;
        }
        if (pulse.segmentIndex >= segmentCount) {
          pulses.splice(p, 1);
          continue;
        }

        const segFrom = pulse.path[pulse.segmentIndex];
        const segTo = pulse.path[pulse.segmentIndex + 1];
        const segFromNode = renderedNodePositions[segFrom] ?? nodes[segFrom];
        const segToNode = renderedNodePositions[segTo] ?? nodes[segTo];
        const segControl = connectionControlMap.get(edgeKey(segFrom, segTo));
        const segCpx = segControl?.cpx ?? (segFromNode.x + segToNode.x) * 0.5;
        const segCpy = segControl?.cpy ?? (segFromNode.y + segToNode.y) * 0.5;
        const point = sampleQuadraticPoint(
          pulse.segmentProgress,
          segFromNode.x,
          segFromNode.y,
          segCpx,
          segCpy,
          segToNode.x,
          segToNode.y,
        );

        const totalProgress = (pulse.segmentIndex + pulse.segmentProgress) / segmentCount;
        const envelope = Math.sin(Math.PI * Math.max(0, Math.min(1, totalProgress)));
        const pulseAlpha = pulse.alpha * envelope;

        setLighter();
        ctx.beginPath();
        ctx.arc(point.x, point.y, pulse.radius * 1.9, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,160,120,${pulseAlpha * 0.28})`;
        ctx.fill();

        setSourceOver();
        ctx.beginPath();
        ctx.arc(point.x, point.y, pulse.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,195,160,${pulseAlpha * 0.9})`;
        ctx.fill();
      }

      applyCenterCutout(ctx, currentWidth, currentHeight);

      if (showFpsRef.current) {
        setSourceOver();
        ctx.globalAlpha = 0.52;
        ctx.font = "11px var(--font-ui), ui-sans-serif, system-ui, sans-serif";
        ctx.textAlign = "right";
        ctx.textBaseline = "bottom";
        ctx.fillStyle = "rgba(43,47,66,0.7)";
        const avg = fpsStatsRef.current.avg;
        const min = fpsStatsRef.current.min;
        const max = fpsStatsRef.current.max;
        ctx.fillText(`MODE: ${perfModeRef.current}`, currentWidth - 12, currentHeight - 44);
        ctx.fillText(`FPS: ${fpsRef.current.fps}`, currentWidth - 12, currentHeight - 32);
        ctx.fillText(`AVG:${avg.toFixed(1)} MIN:${min.toFixed(1)} MAX:${max.toFixed(1)}`, currentWidth - 12, currentHeight - 20);
        ctx.globalAlpha = 1;
      }

      setSourceOver();
    };

    lastFrameRef.current = performance.now();
    lastTickRef.current = lastFrameRef.current;
    frameId = window.requestAnimationFrame(animate);

    const scheduleFlowPulse = () => {
      const delayMs = 3000 + Math.random() * 5000;
      flowPulseTimerId = window.setTimeout(() => {
        const path = pickPulsePath(activeConnections);
        if (path) {
          pulses.push({
            path,
            segmentIndex: 0,
            segmentProgress: 0,
            speedPxPerSec: 80 + Math.random() * 40,
            radius: 1.8 + Math.random() * 0.8,
            alpha: 0.24 + Math.random() * 0.16,
          });
        }
        scheduleFlowPulse();
      }, delayMs);
    };
    scheduleFlowPulse();

    const onMouseMove = (event: MouseEvent) => {
      const viewportWidth = window.innerWidth || 1;
      const viewportHeight = window.innerHeight || 1;
      mouseRef.x = event.clientX / viewportWidth - 0.5;
      mouseRef.y = event.clientY / viewportHeight - 0.5;
    };

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    window.addEventListener("resize", setSize);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(flowPulseTimerId);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", setSize);
      if (debug) delete window.__AXIORA_NEURALFIELD_DUMP_FPS;
    };
  }, [debug]);

  return (
    <canvas
      ref={canvasRef}
      data-axiora-neural-field
      className="fixed inset-0 pointer-events-none z-0 opacity-55"
      aria-hidden
    />
  );
}

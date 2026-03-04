"use client";

import { useEffect, useRef } from "react";

type CognitiveNode = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  maturity: number;
};

type NodeFamily = "micro" | "grain" | "anchor";

type NodeStyle = {
  family: NodeFamily;
  r: number;
  g: number;
  b: number;
  ellipseX: number;
  ellipseY: number;
  scalePhase: number;
  scaleSpeed: number;
  alphaPhase: number;
  alphaSpeed: number;
  pass2Alpha: number;
};

type CognitiveConnection = {
  from: number;
  to: number;
  ageMs: number;
  lifeMs: number;
  fadeInMs: number;
  fadeOutMs: number;
  alpha: number;
  lineWidth: number;
  bend: number;
  bendDrift: number;
  phase: number;
};

const TARGET_FPS = 30;
const FRAME_MS = 1000 / TARGET_FPS;
const DPR_MAX = 1.5;
const DT_NORMALIZER = 16.666;

const DEAD_ZONE_RATIO = 0.4;
const DEAD_ZONE_FEATHER_RATIO = 0.08;
const LATERAL_DENSITY_MIN = 0.75;
const LATERAL_DENSITY_MAX = 0.85;
const LEFT_DENSITY_BIAS = 0.12;

const NODE_MIN = 80;
const NODE_MAX = 140;

const DRIFT_MIN = 0.007;
const DRIFT_MAX = 0.018;
const DRIFT_SWAY_MIN = 0.008;
const DRIFT_SWAY_MAX = 0.018;
const SCALE_MIN = 0.98;
const SCALE_MAX = 1.02;

const CONNECTION_MAX = 2;
const CONNECTION_DIST_MAX = 120;
const CONNECTION_ALPHA_MIN = 0.06;
const CONNECTION_ALPHA_MAX = 0.12;
const CONNECTION_WIDTH_MIN = 0.4;
const CONNECTION_WIDTH_MAX = 0.65;
const CONNECTION_SPAWN_MIN_MS = 2800;
const CONNECTION_SPAWN_MAX_MS = 5600;
const CONNECTION_LIFE_MIN_MS = 3200;
const CONNECTION_LIFE_MAX_MS = 5200;
const CONNECTION_FADE_MS = 1700;
const ATMOSPHERIC_CYCLE_MIN_MS = 25000;
const ATMOSPHERIC_CYCLE_MAX_MS = 35000;
const ATMOSPHERIC_ALPHA_VARIATION = 0.0075;

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function smoothstep01(value: number): number {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function pairKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function calcNodeCount(width: number, height: number): number {
  const byViewport = Math.floor((width * height) / 16500);
  return clamp(byViewport, NODE_MIN, NODE_MAX);
}

function connectionVisibility(connection: CognitiveConnection): number {
  const fadeIn = Math.min(1, connection.ageMs / connection.fadeInMs);
  const remaining = Math.max(0, connection.lifeMs - connection.ageMs);
  const fadeOut = Math.min(1, remaining / connection.fadeOutMs);
  return clamp(fadeIn * fadeOut, 0, 1);
}

function centerWeight(x: number, width: number): number {
  const halfBand = (width * DEAD_ZONE_RATIO) * 0.5;
  const feather = width * DEAD_ZONE_FEATHER_RATIO;
  const dist = Math.abs(x - width * 0.5);

  if (dist <= halfBand) return 0;
  if (dist >= halfBand + feather) return 1;

  return smoothstep01((dist - halfBand) / feather);
}

function buildNodeStyle(): NodeStyle {
  const roll = Math.random();
  let family: NodeFamily = "micro";
  if (roll > 0.62 && roll <= 0.95) family = "grain";
  if (roll > 0.95) family = "anchor";

  const subtleEllipse = Math.random() < 0.24;
  const ellipseY = subtleEllipse ? rand(1.12, 1.4) : 1;
  const ellipseX = subtleEllipse ? rand(0.95, 1.05) : 1;

  return {
    family,
    r: Math.round(rand(190, 210)),
    g: Math.round(rand(215, 235)),
    b: Math.round(rand(236, 255)),
    ellipseX,
    ellipseY,
    scalePhase: rand(0, Math.PI * 2),
    scaleSpeed: rand(0.00012, 0.00028),
    alphaPhase: rand(0, Math.PI * 2),
    alphaSpeed: rand(0.00009, 0.00021),
    pass2Alpha: family === "grain" ? rand(0.25, 0.4) : 0,
  };
}

function createNodeAt(x: number, y: number): CognitiveNode {
  const baseSpeed = rand(DRIFT_MIN, DRIFT_MAX);
  const angle = rand(0, Math.PI * 2);
  const familyRoll = Math.random();

  if (familyRoll < 0.62) {
    return {
      x,
      y,
      vx: Math.cos(angle) * baseSpeed,
      vy: Math.sin(angle) * baseSpeed,
      radius: rand(1.0, 1.6),
      alpha: rand(0.16, 0.28),
      maturity: rand(0.3, 0.9),
    };
  }
  if (familyRoll < 0.95) {
    return {
      x,
      y,
      vx: Math.cos(angle) * baseSpeed,
      vy: Math.sin(angle) * baseSpeed,
      radius: rand(1.2, 2.0),
      alpha: rand(0.24, 0.38),
      maturity: rand(0.45, 1),
    };
  }
  return {
    x,
    y,
    vx: Math.cos(angle) * baseSpeed,
    vy: Math.sin(angle) * baseSpeed,
    radius: rand(2.0, 2.4),
    alpha: rand(0.26, 0.42),
    maturity: rand(0.65, 1),
  };
}

export default function AxioraCognitiveField() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let rafId = 0;
    let destroyed = false;
    let lastRenderTime = 0;
    let lastTickTime = 0;
    let nextConnectionSpawnInMs = rand(CONNECTION_SPAWN_MIN_MS, CONNECTION_SPAWN_MAX_MS);
    let lateralDensityRatio = rand(LATERAL_DENSITY_MIN, LATERAL_DENSITY_MAX);
    const atmosphericCycleMs = rand(ATMOSPHERIC_CYCLE_MIN_MS, ATMOSPHERIC_CYCLE_MAX_MS);
    const atmosphericPhase = rand(0, Math.PI * 2);

    const nodes: CognitiveNode[] = [];
    const styles: NodeStyle[] = [];
    const driftPhaseX: number[] = [];
    const driftPhaseY: number[] = [];
    const driftSpeedX: number[] = [];
    const driftSpeedY: number[] = [];
    const driftSwayX: number[] = [];
    const driftSwayY: number[] = [];
    const staticNoise: Array<{ x: number; y: number; alpha: number; size: number }> = [];

    const connections: CognitiveConnection[] = [];
    const connectionKeys = new Set<string>();

    const drawBackground = (atmosphericAlpha: number): void => {
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, "#0F172A");
      gradient.addColorStop(0.52, "#121C38");
      gradient.addColorStop(1, "#1A2145");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      const lateralDepth = ctx.createLinearGradient(0, 0, width, 0);
      lateralDepth.addColorStop(0, "rgba(4, 7, 16, 0.12)");
      lateralDepth.addColorStop(0.22, "rgba(7, 11, 22, 0.05)");
      lateralDepth.addColorStop(0.5, "rgba(0, 0, 0, 0)");
      lateralDepth.addColorStop(0.78, "rgba(7, 11, 22, 0.05)");
      lateralDepth.addColorStop(1, "rgba(4, 7, 16, 0.12)");
      ctx.fillStyle = lateralDepth;
      ctx.fillRect(0, 0, width, height);

      if (staticNoise.length > 0) {
        for (let i = 0; i < staticNoise.length; i += 1) {
          const grain = staticNoise[i];
          ctx.fillStyle = `rgba(200, 220, 255, ${grain.alpha * atmosphericAlpha})`;
          ctx.fillRect(grain.x, grain.y, grain.size, grain.size);
        }
      }
    };

    const resetCanvas = (): void => {
      width = window.innerWidth;
      height = window.innerHeight;
      const rawDpr = window.devicePixelRatio || 1;
      const dpr = Math.min(rawDpr, DPR_MAX);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const spawnXWithEdgeBias = (preferLateral: boolean, y: number): number => {
      const deadHalf = (width * DEAD_ZONE_RATIO) * 0.5;
      const deadLeft = width * 0.5 - deadHalf;

      if (preferLateral) {
        const verticalBlend = clamp(y / Math.max(height, 1), 0, 1);
        const leftChance = clamp(0.5 + (LEFT_DENSITY_BIAS * 0.5) + (verticalBlend - 0.5) * 0.04, 0.5, 0.62);
        const sideLeft = Math.random() < leftChance;
        const u = Math.random();
        const biased = Math.pow(u, 2.2);
        const distFromEdge = biased * deadLeft;
        let x = sideLeft ? distFromEdge : width - distFromEdge;

        if (Math.random() < 0.24) {
          const innerNudge = rand(0.72, 0.96);
          x = sideLeft ? deadLeft * innerNudge : width - deadLeft * innerNudge;
        }
        return x;
      }

      return rand(0, width);
    };

    const spawnNodes = (): void => {
      nodes.length = 0;
      styles.length = 0;
      driftPhaseX.length = 0;
      driftPhaseY.length = 0;
      driftSpeedX.length = 0;
      driftSpeedY.length = 0;
      driftSwayX.length = 0;
      driftSwayY.length = 0;
      staticNoise.length = 0;
      connections.length = 0;
      connectionKeys.clear();
      nextConnectionSpawnInMs = rand(CONNECTION_SPAWN_MIN_MS, CONNECTION_SPAWN_MAX_MS);
      lateralDensityRatio = rand(LATERAL_DENSITY_MIN, LATERAL_DENSITY_MAX);

      const count = calcNodeCount(width, height);
      const grainCount = Math.max(220, Math.min(520, Math.floor((width * height) / 6800)));
      for (let i = 0; i < grainCount; i += 1) {
        staticNoise.push({
          x: rand(0, width),
          y: rand(0, height),
          alpha: rand(0.02, 0.04),
          size: rand(0.7, 1.4),
        });
      }

      for (let i = 0; i < count; i += 1) {
        const y = rand(0, height);
        const x = spawnXWithEdgeBias(Math.random() < lateralDensityRatio, y);
        const node = createNodeAt(x, y);
        const weight = centerWeight(node.x, width);
        node.alpha *= weight;

        nodes.push(node);
        styles.push(buildNodeStyle());
        driftPhaseX.push(rand(0, Math.PI * 2));
        driftPhaseY.push(rand(0, Math.PI * 2));
        driftSpeedX.push(rand(0.00008, 0.00018));
        driftSpeedY.push(rand(0.00008, 0.00017));
        driftSwayX.push(rand(DRIFT_SWAY_MIN, DRIFT_SWAY_MAX));
        driftSwayY.push(rand(DRIFT_SWAY_MIN, DRIFT_SWAY_MAX));
      }
    };

    const spawnConnection = (): void => {
      if (connections.length >= CONNECTION_MAX) return;

      const usedNodes = new Set<number>();
      for (let i = 0; i < connections.length; i += 1) {
        usedNodes.add(connections[i].from);
        usedNodes.add(connections[i].to);
      }

      const candidates: Array<{ a: number; b: number; dist: number }> = [];
      for (let i = 0; i < nodes.length; i += 1) {
        if (usedNodes.has(i) || nodes[i].alpha <= 0.35) continue;
        for (let j = i + 1; j < nodes.length; j += 1) {
          if (usedNodes.has(j) || nodes[j].alpha <= 0.35) continue;
          const key = pairKey(i, j);
          if (connectionKeys.has(key)) continue;
          const dist = Math.hypot(nodes[j].x - nodes[i].x, nodes[j].y - nodes[i].y);
          if (dist > CONNECTION_DIST_MAX) continue;
          candidates.push({ a: i, b: j, dist });
        }
      }

      if (candidates.length === 0) return;
      candidates.sort((l, r) => l.dist - r.dist);
      const picked = candidates[Math.floor(rand(0, Math.min(6, candidates.length)))];
      connectionKeys.add(pairKey(picked.a, picked.b));
      connections.push({
        from: picked.a,
        to: picked.b,
        ageMs: 0,
        lifeMs: rand(CONNECTION_LIFE_MIN_MS, CONNECTION_LIFE_MAX_MS),
        fadeInMs: CONNECTION_FADE_MS,
        fadeOutMs: CONNECTION_FADE_MS,
        alpha: rand(CONNECTION_ALPHA_MIN, CONNECTION_ALPHA_MAX),
        lineWidth: rand(CONNECTION_WIDTH_MIN, CONNECTION_WIDTH_MAX),
        bend: rand(2, 10) * (Math.random() < 0.5 ? -1 : 1),
        bendDrift: rand(0.8, 2.8),
        phase: rand(0, Math.PI * 2),
      });
    };

    const drawConnections = (timeMs: number, atmosphericAlpha: number): void => {
      for (let i = 0; i < connections.length; i += 1) {
        const connection = connections[i];
        const from = nodes[connection.from];
        const to = nodes[connection.to];
        if (!from || !to) continue;

        const vis = connectionVisibility(connection);
        if (vis <= 0) continue;

        const centerMask = Math.min(centerWeight(from.x, width), centerWeight(to.x, width));
        const effectiveAlpha = connection.alpha * vis * centerMask * atmosphericAlpha;
        if (effectiveAlpha <= 0.004) continue;

        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dist = Math.hypot(dx, dy) || 1;
        const nx = -dy / dist;
        const ny = dx / dist;
        const midX = (from.x + to.x) * 0.5;
        const midY = (from.y + to.y) * 0.5;
        const offset = connection.bend + Math.sin(timeMs * 0.00023 + connection.phase) * connection.bendDrift;

        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.quadraticCurveTo(midX + nx * offset, midY + ny * offset, to.x, to.y);
        ctx.strokeStyle = `rgba(195, 220, 255, ${effectiveAlpha})`;
        ctx.lineWidth = connection.lineWidth;
        ctx.stroke();
      }
    };

    const drawNodes = (timeMs: number, atmosphericAlpha: number): void => {
      for (let i = 0; i < nodes.length; i += 1) {
        const node = nodes[i];
        const style = styles[i];

        const localScale = clamp(
          1 + Math.sin(timeMs * style.scaleSpeed + style.scalePhase) * 0.02,
          SCALE_MIN,
          SCALE_MAX,
        );
        const alphaNoise = 0.92 + Math.sin(timeMs * style.alphaSpeed + style.alphaPhase) * 0.08;
        const weight = centerWeight(node.x, width);
        const alpha = node.alpha * alphaNoise * weight * atmosphericAlpha;
        if (alpha <= 0.01) continue;

        const radius = node.radius * localScale;
        const rx = radius * style.ellipseX;
        const ry = radius * style.ellipseY;

        if (style.family === "grain") {
          ctx.beginPath();
          ctx.ellipse(node.x, node.y, rx * 1.35, ry * 1.35, 0, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${style.r}, ${style.g}, ${style.b}, ${alpha * style.pass2Alpha})`;
          ctx.fill();
        }

        ctx.beginPath();
        ctx.ellipse(node.x, node.y, rx, ry, 0, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${style.r}, ${style.g}, ${style.b}, ${alpha})`;
        ctx.fill();
      }
    };

    const update = (dt: number, now: number): void => {
      nextConnectionSpawnInMs -= dt * DT_NORMALIZER;
      if (nextConnectionSpawnInMs <= 0) {
        spawnConnection();
        nextConnectionSpawnInMs = rand(CONNECTION_SPAWN_MIN_MS, CONNECTION_SPAWN_MAX_MS);
      }

      const deadHalf = (width * DEAD_ZONE_RATIO) * 0.5;
      const deadLeft = width * 0.5 - deadHalf;
      const deadRight = width * 0.5 + deadHalf;

      for (let i = 0; i < nodes.length; i += 1) {
        const node = nodes[i];
        const driftX = Math.sin(now * driftSpeedX[i] + driftPhaseX[i]) * driftSwayX[i];
        const driftY = Math.cos(now * driftSpeedY[i] + driftPhaseY[i]) * driftSwayY[i];
        const edgeFactor = clamp(Math.abs(node.x - width * 0.5) / Math.max(width * 0.5, 1), 0, 1);
        const lateralParallaxFactor = 1 - edgeFactor * 0.05;

        node.x += (node.vx + driftX) * dt * lateralParallaxFactor;
        node.y += (node.vy + driftY) * dt * lateralParallaxFactor;

        if (node.x <= 0 || node.x >= width) node.vx *= -1;
        if (node.y <= 0 || node.y >= height) node.vy *= -1;

        node.x = clamp(node.x, 0, width);
        node.y = clamp(node.y, 0, height);

        if (node.x >= deadLeft && node.x <= deadRight) {
          const pushLeft = node.x < width * 0.5;
          node.vx += pushLeft ? -0.004 * dt : 0.004 * dt;
        }
      }

      for (let i = connections.length - 1; i >= 0; i -= 1) {
        connections[i].ageMs += dt * DT_NORMALIZER;
        if (connections[i].ageMs >= connections[i].lifeMs) {
          connectionKeys.delete(pairKey(connections[i].from, connections[i].to));
          connections.splice(i, 1);
        }
      }
    };

    const render = (timeMs: number): void => {
      const atmosphericAlpha =
        1 + Math.sin((timeMs / atmosphericCycleMs) * Math.PI * 2 + atmosphericPhase) * ATMOSPHERIC_ALPHA_VARIATION;
      drawBackground(atmosphericAlpha);
      // Keep the learning map as the only visible path line in APRENDER.
      drawNodes(timeMs, atmosphericAlpha);
    };

    const loop = (now: number): void => {
      if (destroyed) return;
      rafId = window.requestAnimationFrame(loop);

      if (!lastTickTime) lastTickTime = now;
      const dt = clamp((now - lastTickTime) / DT_NORMALIZER, 0, 3);
      lastTickTime = now;

      if (!lastRenderTime) lastRenderTime = now;
      if (now - lastRenderTime < FRAME_MS) return;
      lastRenderTime = now;

      update(dt, now);
      render(now);
    };

    const onResize = (): void => {
      resetCanvas();
      spawnNodes();
      render(performance.now());
    };

    resetCanvas();
    spawnNodes();
    render(performance.now());
    rafId = window.requestAnimationFrame(loop);
    window.addEventListener("resize", onResize);

    return () => {
      destroyed = true;
      window.removeEventListener("resize", onResize);
      window.cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0"
    />
  );
}

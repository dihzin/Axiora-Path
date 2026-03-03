"use client";

import { useEffect, useRef } from "react";

type Core = {
  id: number;
  x: number;
  y: number;
  baseRadius: number;
  radius: number;
  pulsePhase: number;
  pulseSpeed: number;
  energy: number;
};

type Orb = {
  id: number;
  x: number;
  y: number;
  baseRadius: number;
  radius: number;
  pulsePhase: number;
  pulseSpeed: number;
  energyLevel: number;
  energyDrift: number;
  orbitAngle: number;
  orbitSpeed: number;
  orbitRx: number;
  orbitRy: number;
  driftPhase: number;
  driftAmp: number;
  hue: number;
};

type Link = {
  id: number;
  fromId: number;
  toId: number;
  ageMs: number;
  lifeMs: number;
  fadeInMs: number;
  fadeOutMs: number;
  jitter: number;
  noiseSeed: number;
  flowBudget: number;
};

type Wave = {
  id: number;
  ageMs: number;
  lifeMs: number;
  startRadius: number;
  endRadius: number;
  alpha: number;
};

type LinkPulse = {
  id: number;
  linkId: number;
  progress: number;
  speed: number;
  ageMs: number;
  lifeMs: number;
};

type FlowParticle = {
  id: number;
  linkId: number;
  t: number;
  speed: number;
  size: number;
  alpha: number;
  ageMs: number;
  lifeMs: number;
};

type NodeLike = {
  id: number;
  x: number;
  y: number;
};

const TARGET_FPS = 30;
const FRAME_MS = 1000 / TARGET_FPS;
const DT_NORMALIZER = 16.666;
const DPR_MAX = 1.5;

const CORE_RADIUS = 28;
const CORE_PULSE_AMP = 0.06;
const CORE_BASE_ALPHA = 0.1;
const CORE_GLOW1_ALPHA = 0.07;
const CORE_GLOW2_ALPHA = 0.04;

const LINKS_ACTIVE_MAX = 3;
const LINK_SPAWN_MIN_MS = 1800;
const LINK_SPAWN_MAX_MS = 3600;
const LINK_LIFE_MIN_MS = 3500;
const LINK_LIFE_MAX_MS = 6500;

const CORE_WAVE_MIN_MS = 6000;
const CORE_WAVE_MAX_MS = 14000;
const LINK_PULSE_MIN_MS = 3000;
const LINK_PULSE_MAX_MS = 7000;

const CUTOUT_CY_RATIO = 0.36;
const CUTOUT_INNER_MIN = 220;
const CUTOUT_INNER_MAX = 280;
const CUTOUT_OUTER_MIN = 380;
const CUTOUT_OUTER_MAX = 480;

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function pairKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function quadraticPoint(
  p0x: number,
  p0y: number,
  cpx: number,
  cpy: number,
  p1x: number,
  p1y: number,
  t: number,
): { x: number; y: number } {
  const u = 1 - t;
  return {
    x: u * u * p0x + 2 * u * t * cpx + t * t * p1x,
    y: u * u * p0y + 2 * u * t * cpy + t * t * p1y,
  };
}

export default function AxioraField() {
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

    let lastFrameTime = 0;
    let lastTickTime = 0;

    let idCounter = 1;
    let nextLinkSpawnMs = rand(LINK_SPAWN_MIN_MS, LINK_SPAWN_MAX_MS);
    let nextCoreWaveMs = rand(CORE_WAVE_MIN_MS, CORE_WAVE_MAX_MS);
    let nextLinkPulseMs = rand(LINK_PULSE_MIN_MS, LINK_PULSE_MAX_MS);

    const staticSpecks: Array<{ x: number; y: number; a: number; s: number }> = [];

    const core: Core = {
      id: 0,
      x: 0,
      y: 0,
      baseRadius: CORE_RADIUS,
      radius: CORE_RADIUS,
      pulsePhase: rand(0, Math.PI * 2),
      pulseSpeed: 0.014,
      energy: 0.9,
    };

    const satellites: Orb[] = [];
    const links: Link[] = [];
    const waves: Wave[] = [];
    const linkPulses: LinkPulse[] = [];
    const flowParticles: FlowParticle[] = [];

    const nextId = (): number => {
      idCounter += 1;
      return idCounter;
    };

    const resolveSatelliteCount = (): number => {
      const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 8 : 8;
      if (cores <= 4) return 8;
      if (cores <= 8) return 10;
      return 14;
    };

    const setupCanvas = (): void => {
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

    const setupScene = (): void => {
      satellites.length = 0;
      links.length = 0;
      waves.length = 0;
      linkPulses.length = 0;
      flowParticles.length = 0;
      staticSpecks.length = 0;

      core.x = width * 0.52;
      core.y = height * 0.34;
      core.baseRadius = clamp(CORE_RADIUS, 22, 34);
      core.radius = core.baseRadius;
      core.pulsePhase = rand(0, Math.PI * 2);
      core.energy = 0.92;

      const satelliteCount = resolveSatelliteCount();
      for (let i = 0; i < satelliteCount; i += 1) {
        const baseRadius = rand(6, 14);
        satellites.push({
          id: nextId(),
          x: core.x,
          y: core.y,
          baseRadius,
          radius: baseRadius,
          pulsePhase: rand(0, Math.PI * 2),
          pulseSpeed: rand(0.011, 0.02),
          energyLevel: rand(0.45, 0.92),
          energyDrift: rand(0.0006, 0.002),
          orbitAngle: rand(0, Math.PI * 2),
          orbitSpeed: rand(0.0003, 0.0008),
          orbitRx: rand(180, 420),
          orbitRy: rand(120, 320),
          driftPhase: rand(0, Math.PI * 2),
          driftAmp: rand(2, 6),
          hue: rand(196, 218),
        });
      }

      const speckCount = Math.min(42, Math.max(18, Math.floor((width * height) / 120000)));
      for (let i = 0; i < speckCount; i += 1) {
        staticSpecks.push({ x: rand(0, width), y: rand(0, height), a: rand(0.03, 0.08), s: rand(0.7, 1.6) });
      }

      nextLinkSpawnMs = rand(LINK_SPAWN_MIN_MS, LINK_SPAWN_MAX_MS);
      nextCoreWaveMs = rand(CORE_WAVE_MIN_MS, CORE_WAVE_MAX_MS);
      nextLinkPulseMs = rand(LINK_PULSE_MIN_MS, LINK_PULSE_MAX_MS);
    };

    const nodes = (): NodeLike[] => [core, ...satellites];

    const findNodeById = (id: number): NodeLike | undefined => {
      if (id === core.id) return core;
      return satellites.find((s) => s.id === id);
    };

    const linkVisibility = (link: Link): number => {
      const fadeIn = Math.min(1, link.ageMs / link.fadeInMs);
      const remaining = Math.max(0, link.lifeMs - link.ageMs);
      const fadeOut = Math.min(1, remaining / link.fadeOutMs);
      return clamp(fadeIn * fadeOut, 0, 1);
    };

    const hasEdge = (a: number, b: number): boolean => links.some((l) => pairKey(l.fromId, l.toId) === pairKey(a, b));

    const formsTriangle = (a: number, b: number): boolean => {
      const n = nodes();
      for (let i = 0; i < n.length; i += 1) {
        const c = n[i].id;
        if (c === a || c === b) continue;
        if (hasEdge(a, c) && hasEdge(b, c)) return true;
      }
      return false;
    };

    const degree = (nodeId: number): number => {
      let d = 0;
      for (let i = 0; i < links.length; i += 1) {
        if (links[i].fromId === nodeId || links[i].toId === nodeId) d += 1;
      }
      return d;
    };

    const controlPoint = (from: NodeLike, to: NodeLike, jitter: number, noiseSeed: number, timeMs: number): { x: number; y: number } => {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dist = Math.hypot(dx, dy) || 1;
      const nx = -dy / dist;
      const ny = dx / dist;
      const midX = (from.x + to.x) * 0.5;
      const midY = (from.y + to.y) * 0.5;
      const asymmetry = Math.sin(timeMs * 0.0007 + noiseSeed * 1.37) * 0.6 + Math.cos(timeMs * 0.0011 + noiseSeed) * 0.4;
      const offset = asymmetry * jitter;
      return { x: midX + nx * offset, y: midY + ny * offset };
    };

    const spawnLink = (): void => {
      if (links.length >= LINKS_ACTIVE_MAX) return;
      const n = nodes();
      const candidates: Array<{ a: number; b: number; dist: number }> = [];
      const maxDist = Math.min(Math.max(width * 0.24, 150), 300);

      for (let i = 0; i < n.length; i += 1) {
        for (let j = i + 1; j < n.length; j += 1) {
          const a = n[i];
          const b = n[j];
          const key = pairKey(a.id, b.id);
          if (links.some((l) => pairKey(l.fromId, l.toId) === key)) continue;
          if (degree(a.id) >= 2 || degree(b.id) >= 2) continue;
          if (formsTriangle(a.id, b.id)) continue;

          const dist = Math.hypot(b.x - a.x, b.y - a.y);
          if (dist > maxDist) continue;
          candidates.push({ a: a.id, b: b.id, dist });
        }
      }

      if (candidates.length === 0) return;
      candidates.sort((x, y) => x.dist - y.dist);
      const pool = candidates.slice(0, Math.min(8, candidates.length));
      const selected = pool[Math.floor(rand(0, pool.length))];

      links.push({
        id: nextId(),
        fromId: selected.a,
        toId: selected.b,
        ageMs: 0,
        lifeMs: rand(LINK_LIFE_MIN_MS, LINK_LIFE_MAX_MS),
        fadeInMs: rand(550, 900),
        fadeOutMs: rand(900, 1400),
        jitter: rand(8, 18),
        noiseSeed: rand(0, Math.PI * 2),
        flowBudget: Math.floor(rand(0, 3)),
      });
    };

    const spawnCoreWave = (): void => {
      waves.push({
        id: nextId(),
        ageMs: 0,
        lifeMs: rand(1500, 2300),
        startRadius: core.radius * 1.4,
        endRadius: core.radius + rand(140, 220),
        alpha: rand(0.2, 0.32),
      });
      if (Math.random() > 0.55) {
        waves.push({
          id: nextId(),
          ageMs: -220,
          lifeMs: rand(1600, 2500),
          startRadius: core.radius * 1.6,
          endRadius: core.radius + rand(170, 250),
          alpha: rand(0.12, 0.22),
        });
      }
    };

    const spawnLinkPulse = (): void => {
      if (links.length === 0) return;
      const visibleLinks = links.filter((l) => linkVisibility(l) > 0.25);
      if (visibleLinks.length === 0) return;
      const link = visibleLinks[Math.floor(rand(0, visibleLinks.length))];
      linkPulses.push({
        id: nextId(),
        linkId: link.id,
        progress: 0,
        speed: rand(0.00022, 0.00038),
        ageMs: 0,
        lifeMs: rand(1800, 2600),
      });
    };

    const spawnFlowParticle = (link: Link): void => {
      const current = flowParticles.filter((p) => p.linkId === link.id).length;
      if (current >= link.flowBudget) return;
      flowParticles.push({
        id: nextId(),
        linkId: link.id,
        t: rand(0, 1),
        speed: rand(0.00006, 0.00014),
        size: rand(0.8, 1.7),
        alpha: rand(0.07, 0.16),
        ageMs: 0,
        lifeMs: rand(1400, 3000),
      });
    };

    const update = (dtNorm: number, dtMs: number): void => {
      const step = Math.min(dtNorm, 2.6);

      core.pulsePhase += core.pulseSpeed * step;
      core.radius = core.baseRadius * (1 + Math.sin(core.pulsePhase) * CORE_PULSE_AMP);
      core.energy = clamp(0.85 + Math.sin(core.pulsePhase * 0.6) * 0.1, 0.6, 1);

      for (let i = 0; i < satellites.length; i += 1) {
        const orb = satellites[i];
        orb.pulsePhase += orb.pulseSpeed * step;
        orb.driftPhase += 0.009 * step;
        orb.orbitAngle += orb.orbitSpeed * dtMs;
        orb.energyLevel = clamp(orb.energyLevel + Math.sin(orb.pulsePhase * 0.42) * orb.energyDrift * step, 0.3, 1);

        const driftX = Math.cos(orb.driftPhase) * orb.driftAmp;
        const driftY = Math.sin(orb.driftPhase * 1.2) * (orb.driftAmp * 0.75);
        orb.x = core.x + Math.cos(orb.orbitAngle) * orb.orbitRx + driftX;
        orb.y = core.y + Math.sin(orb.orbitAngle) * orb.orbitRy + driftY;
        orb.radius = orb.baseRadius * (0.92 + Math.sin(orb.pulsePhase) * 0.08);
      }

      for (let i = links.length - 1; i >= 0; i -= 1) {
        links[i].ageMs += dtMs;
        if (links[i].ageMs >= links[i].lifeMs) {
          const id = links[i].id;
          links.splice(i, 1);
          for (let j = flowParticles.length - 1; j >= 0; j -= 1) if (flowParticles[j].linkId === id) flowParticles.splice(j, 1);
          for (let j = linkPulses.length - 1; j >= 0; j -= 1) if (linkPulses[j].linkId === id) linkPulses.splice(j, 1);
        }
      }

      for (let i = waves.length - 1; i >= 0; i -= 1) {
        waves[i].ageMs += dtMs;
        if (waves[i].ageMs >= waves[i].lifeMs) waves.splice(i, 1);
      }

      for (let i = linkPulses.length - 1; i >= 0; i -= 1) {
        const p = linkPulses[i];
        p.ageMs += dtMs;
        p.progress = clamp(p.progress + p.speed * dtMs, 0, 1);
        if (p.ageMs >= p.lifeMs || p.progress >= 1) linkPulses.splice(i, 1);
      }

      for (let i = flowParticles.length - 1; i >= 0; i -= 1) {
        const fp = flowParticles[i];
        fp.ageMs += dtMs;
        fp.t += fp.speed * dtMs;
        if (fp.t > 1) fp.t -= 1;
        if (fp.ageMs >= fp.lifeMs) flowParticles.splice(i, 1);
      }

      for (let i = 0; i < links.length; i += 1) {
        if (Math.random() < 0.02 * step) spawnFlowParticle(links[i]);
      }

      nextLinkSpawnMs -= dtMs;
      if (nextLinkSpawnMs <= 0) {
        spawnLink();
        nextLinkSpawnMs = rand(LINK_SPAWN_MIN_MS, LINK_SPAWN_MAX_MS);
      }

      nextCoreWaveMs -= dtMs;
      if (nextCoreWaveMs <= 0) {
        spawnCoreWave();
        nextCoreWaveMs = rand(CORE_WAVE_MIN_MS, CORE_WAVE_MAX_MS);
      }

      nextLinkPulseMs -= dtMs;
      if (nextLinkPulseMs <= 0) {
        spawnLinkPulse();
        nextLinkPulseMs = rand(LINK_PULSE_MIN_MS, LINK_PULSE_MAX_MS);
      }
    };

    const drawBackground = (): void => {
      const bg = ctx.createLinearGradient(0, 0, width, height);
      bg.addColorStop(0, "rgba(5, 12, 22, 0.96)");
      bg.addColorStop(0.6, "rgba(8, 24, 38, 0.94)");
      bg.addColorStop(1, "rgba(4, 10, 18, 0.97)");
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = "rgba(140, 200, 255, 0.04)";
      for (let i = 0; i < staticSpecks.length; i += 1) {
        const s = staticSpecks[i];
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.s, 0, Math.PI * 2);
        ctx.globalAlpha = s.a;
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      const vignette = ctx.createRadialGradient(width * 0.5, height * 0.42, Math.min(width, height) * 0.16, width * 0.5, height * 0.5, Math.max(width, height) * 0.72);
      vignette.addColorStop(0, "rgba(0,0,0,0)");
      vignette.addColorStop(1, "rgba(0,0,0,0.42)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);
    };

    const renderLinks = (now: number): void => {
      if (links.length === 0) return;
      const buckets: Link[][] = [[], [], []];

      for (let i = 0; i < links.length; i += 1) {
        const link = links[i];
        const a = linkVisibility(link);
        if (a <= 0.01) continue;
        const idx = a > 0.66 ? 2 : a > 0.33 ? 1 : 0;
        buckets[idx].push(link);
      }

      const bucketAlpha = [0.07, 0.12, 0.18];
      for (let b = 0; b < buckets.length; b += 1) {
        const list = buckets[b];
        if (list.length === 0) continue;

        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = `hsla(201, 88%, 74%, ${bucketAlpha[b]})`;
        ctx.lineWidth = 0.9 + b * 0.25;
        ctx.beginPath();
        for (let i = 0; i < list.length; i += 1) {
          const link = list[i];
          const from = findNodeById(link.fromId);
          const to = findNodeById(link.toId);
          if (!from || !to) continue;
          const cp = controlPoint(from, to, link.jitter, link.noiseSeed, now);
          ctx.moveTo(from.x, from.y);
          ctx.quadraticCurveTo(cp.x, cp.y, to.x, to.y);
        }
        ctx.stroke();

        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = `hsla(202, 100%, 78%, ${bucketAlpha[b] * 0.55})`;
        ctx.lineWidth = (0.9 + b * 0.25) * 1.9;
        ctx.beginPath();
        for (let i = 0; i < list.length; i += 1) {
          const link = list[i];
          const from = findNodeById(link.fromId);
          const to = findNodeById(link.toId);
          if (!from || !to) continue;
          const cp = controlPoint(from, to, link.jitter, link.noiseSeed, now);
          ctx.moveTo(from.x, from.y);
          ctx.quadraticCurveTo(cp.x, cp.y, to.x, to.y);
        }
        ctx.stroke();
      }

      ctx.globalCompositeOperation = "source-over";
    };

    const renderFlowParticles = (now: number): void => {
      if (flowParticles.length === 0) return;
      for (let i = 0; i < flowParticles.length; i += 1) {
        const fp = flowParticles[i];
        const link = links.find((l) => l.id === fp.linkId);
        if (!link) continue;
        const from = findNodeById(link.fromId);
        const to = findNodeById(link.toId);
        if (!from || !to) continue;

        const cp = controlPoint(from, to, link.jitter, link.noiseSeed, now);
        const pos = quadraticPoint(from.x, from.y, cp.x, cp.y, to.x, to.y, fp.t);
        const lifeA = clamp(1 - fp.ageMs / fp.lifeMs, 0, 1);
        const alpha = fp.alpha * lifeA;

        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = `hsla(202, 92%, 78%, ${alpha})`;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, fp.size, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = `hsla(202, 100%, 82%, ${alpha * 0.35})`;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, fp.size * 2.1, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    };

    const renderSatellites = (): void => {
      for (let i = 0; i < satellites.length; i += 1) {
        const orb = satellites[i];
        const baseA = 0.32 + orb.energyLevel * 0.4;

        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = `hsla(${orb.hue}, 82%, 72%, ${baseA})`;
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, orb.radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = `hsla(${orb.hue}, 92%, 78%, ${0.06 + orb.energyLevel * 0.08})`;
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, orb.radius * 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    };

    const renderCore = (): void => {
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = `hsla(196, 96%, 76%, ${CORE_BASE_ALPHA + core.energy * 0.04})`;
      ctx.beginPath();
      ctx.arc(core.x, core.y, core.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = `hsla(198, 100%, 80%, ${CORE_GLOW1_ALPHA + core.energy * 0.02})`;
      ctx.beginPath();
      ctx.arc(core.x, core.y, core.radius * 2.1, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `hsla(198, 100%, 84%, ${CORE_GLOW2_ALPHA + core.energy * 0.01})`;
      ctx.beginPath();
      ctx.arc(core.x, core.y, core.radius * 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalCompositeOperation = "source-over";
    };

    const renderPulsesAndWaves = (now: number): void => {
      for (let i = 0; i < waves.length; i += 1) {
        const w = waves[i];
        if (w.ageMs < 0) continue;
        const t = clamp(w.ageMs / w.lifeMs, 0, 1);
        const radius = w.startRadius + (w.endRadius - w.startRadius) * t;
        const a = w.alpha * (1 - t);

        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = `hsla(201, 88%, 74%, ${a * 0.7})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(core.x, core.y, radius * 1.14, radius * 0.82, 0, 0, Math.PI * 2);
        ctx.stroke();

        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = `hsla(202, 100%, 80%, ${a * 0.35})`;
        ctx.lineWidth = 2.1;
        ctx.beginPath();
        ctx.ellipse(core.x, core.y, radius * 1.14, radius * 0.82, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      for (let i = 0; i < linkPulses.length; i += 1) {
        const p = linkPulses[i];
        const link = links.find((l) => l.id === p.linkId);
        if (!link) continue;
        const from = findNodeById(link.fromId);
        const to = findNodeById(link.toId);
        if (!from || !to) continue;

        const cp = controlPoint(from, to, link.jitter, link.noiseSeed, now);
        const pos = quadraticPoint(from.x, from.y, cp.x, cp.y, to.x, to.y, p.progress);
        const fade = clamp(1 - p.ageMs / p.lifeMs, 0, 1);

        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = `hsla(201, 100%, 80%, ${fade * 0.55})`;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 2.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = `hsla(202, 100%, 86%, ${fade * 0.24})`;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 5.1, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalCompositeOperation = "source-over";
    };

    const applyCenterCutout = (): void => {
      const cx = width * 0.5;
      const cy = height * CUTOUT_CY_RATIO;
      const inner = clamp(Math.min(width, height) * 0.28, CUTOUT_INNER_MIN, CUTOUT_INNER_MAX);
      const outer = clamp(Math.min(width, height) * 0.46, CUTOUT_OUTER_MIN, CUTOUT_OUTER_MAX);

      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.translate(cx, cy);
      ctx.scale(1.38, 1);
      const g = ctx.createRadialGradient(0, 0, inner, 0, 0, outer);
      g.addColorStop(0, "rgba(0,0,0,0.98)");
      g.addColorStop(0.58, "rgba(0,0,0,0.58)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, outer, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    const render = (now: number): void => {
      ctx.clearRect(0, 0, width, height);
      drawBackground();
      renderLinks(now);
      renderFlowParticles(now);
      renderSatellites();
      renderCore();
      renderPulsesAndWaves(now);
      applyCenterCutout();
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    };

    const frame = (now: number): void => {
      if (destroyed) return;
      rafId = window.requestAnimationFrame(frame);

      if (lastTickTime === 0) {
        lastTickTime = now;
        lastFrameTime = now;
      }

      const tickDelta = now - lastTickTime;
      const dtNorm = tickDelta / DT_NORMALIZER;
      lastTickTime = now;

      if (now - lastFrameTime < FRAME_MS) return;
      lastFrameTime = now;

      update(dtNorm, tickDelta);
      render(now);
    };

    const handleResize = (): void => {
      setupCanvas();
      setupScene();
      render(performance.now());
    };

    setupCanvas();
    setupScene();
    render(performance.now());

    window.addEventListener("resize", handleResize);
    rafId = window.requestAnimationFrame(frame);

    return () => {
      destroyed = true;
      window.removeEventListener("resize", handleResize);
      window.cancelAnimationFrame(rafId);
    };
  }, []);

  return <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 -z-10" aria-hidden="true" />;
}

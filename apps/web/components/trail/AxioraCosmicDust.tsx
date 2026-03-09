"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";

type QualityTier = "low" | "high";

type AxioraCosmicDustProps = {
  width: number;
  height: number;
  cameraY: number;
  quality: QualityTier;
  densityScale?: number;
};

type Dust = {
  x: number;
  y: number;
  r: number;
  driftY: number;
  phase: number;
  phaseSpeed: number;
  baseAlpha: number;
};

export type AxioraCosmicDustHandle = {
  renderFrame: (timeMs: number, cameraY: number) => void;
};

function createDust(count: number, width: number, height: number): Dust[] {
  const safeW = Math.max(1, width);
  const safeH = Math.max(1, height);
  return Array.from({ length: count }).map(() => ({
    x: Math.random() * safeW,
    y: Math.random() * safeH,
    r: 0.8 + Math.random() * 1.6,
    driftY: 2 + Math.random() * 5,
    phase: Math.random() * Math.PI * 2,
    phaseSpeed: 0.35 + Math.random() * 0.65,
    baseAlpha: 0.08 + Math.random() * 0.1,
  }));
}

const AxioraCosmicDust = forwardRef<AxioraCosmicDustHandle, AxioraCosmicDustProps>(function AxioraCosmicDust({ width, height, cameraY, quality, densityScale = 1 }, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const cameraYRef = useRef(cameraY);

  const baseCount = quality === "high" ? 40 : 22;
  const count = Math.max(8, Math.floor(baseCount * densityScale));
  const dust = useMemo(() => createDust(count, width, height), [count, height, width]);
  const dustRef = useRef<Dust[]>(dust);

  const drawFrame = useCallback((timeMs: number, cameraOffsetY: number) => {
    const ctx = ctxRef.current;
    if (!ctx) return;

    const w = Math.max(1, width);
    const h = Math.max(1, height);
    const t = timeMs / 1000;
    const parallax = cameraOffsetY * 0.1;
    const wrapH = h + 8;

    ctx.clearRect(0, 0, w, h);

    for (let i = 0; i < dustRef.current.length; i += 1) {
      const d = dustRef.current[i];
      if (!d) continue;

      const y = ((d.y + t * d.driftY + parallax) % wrapH + wrapH) % wrapH - 4;
      const x = d.x + Math.sin(t * d.phaseSpeed + d.phase) * 4;
      const alpha = d.baseAlpha + Math.sin(t * d.phaseSpeed + d.phase) * 0.025;

      ctx.beginPath();
      ctx.fillStyle = `rgba(180, 220, 255, ${Math.max(0.04, Math.min(0.14, alpha))})`;
      ctx.arc(x, y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [height, width]);

  useImperativeHandle(ref, () => ({
    renderFrame: (timeMs: number, cameraOffsetY: number) => drawFrame(timeMs, cameraOffsetY),
  }), [drawFrame]);

  useEffect(() => {
    dustRef.current = dust;
  }, [dust]);

  useEffect(() => {
    cameraYRef.current = cameraY;
  }, [cameraY]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio || 1, quality === "high" ? 3 : 1.25);
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    canvas.style.width = `${Math.max(1, width)}px`;
    canvas.style.height = `${Math.max(1, height)}px`;

    const ctx = canvas.getContext("2d", { alpha: true, desynchronized: quality === "high" });
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctxRef.current = ctx;
    drawFrame(performance.now(), cameraYRef.current);
  }, [drawFrame, height, width]);

  return <canvas ref={canvasRef} className="pointer-events-none h-full w-full" aria-hidden />;
});

export default AxioraCosmicDust;

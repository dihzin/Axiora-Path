"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";

type QualityTier = "low" | "high";

type AxioraStarFieldProps = {
  width: number;
  height: number;
  cameraY: number;
  quality: QualityTier;
  densityScale?: number;
};

type Star = {
  x: number;
  y: number;
  r: number;
  twPhase: number;
  twSpeed: number;
  twAmp: number;
  driftSpeed: number;
  baseAlpha: number;
  tint: "blue" | "violet" | "gold" | "white";
};

export type AxioraStarFieldHandle = {
  renderFrame: (timeMs: number, cameraY: number) => void;
};

function createStars(count: number, width: number, height: number): Star[] {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);

  return Array.from({ length: count }).map(() => {
    const rareLarge = Math.random() < 0.08;
    const radius = rareLarge ? 4 : 1 + Math.random() * 2;
    return {
      x: Math.random() * safeWidth,
      y: Math.random() * safeHeight,
      r: radius,
      twPhase: Math.random() * Math.PI * 2,
      twSpeed: 0.6 + Math.random() * 1.2,
      twAmp: 0.1 + Math.random() * 0.22,
      driftSpeed: 4 + Math.random() * 10,
      baseAlpha: 0.28 + Math.random() * 0.34,
      tint: rareLarge ? (Math.random() < 0.5 ? "gold" : "violet") : Math.random() < 0.12 ? "blue" : "white",
    };
  });
}

const AxioraStarField = forwardRef<AxioraStarFieldHandle, AxioraStarFieldProps>(function AxioraStarField({ width, height, cameraY, quality, densityScale = 1 }, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const dprRef = useRef(1);
  const cameraYRef = useRef(cameraY);

  const baseCount = quality === "high" ? 156 : 92;
  const starCount = Math.max(32, Math.floor(baseCount * densityScale));
  const stars = useMemo(() => createStars(starCount, width, height), [height, starCount, width]);
  const starsRef = useRef<Star[]>(stars);

  const drawFrame = useCallback((timeMs: number, cameraOffsetY: number) => {
    const ctx = ctxRef.current;
    if (!ctx) return;

    const w = Math.max(1, width);
    const h = Math.max(1, height);
    const t = timeMs / 1000;
    ctx.clearRect(0, 0, w, h);

    const parallax = cameraOffsetY * 0.05;
    const wrapHeight = h + 12;

    for (let i = 0; i < starsRef.current.length; i += 1) {
      const star = starsRef.current[i];
      if (!star) continue;

      const drift = (t * star.driftSpeed) % wrapHeight;
      const rawY = star.y + drift + parallax;
      const y = ((rawY % wrapHeight) + wrapHeight) % wrapHeight - 6;
      const twinkle = Math.sin(t * star.twSpeed + star.twPhase) * star.twAmp;
      const alpha = Math.max(0.08, Math.min(0.95, star.baseAlpha + twinkle));
      const starTint =
        star.tint === "gold"
          ? `rgba(253, 230, 138, ${Math.min(0.92, alpha)})`
          : star.tint === "violet"
            ? `rgba(221, 214, 254, ${Math.min(0.9, alpha)})`
            : star.tint === "blue"
              ? `rgba(191, 219, 254, ${Math.min(0.9, alpha)})`
              : `rgba(235, 248, 255, ${alpha})`;

      if (star.r > 2.8) {
        ctx.beginPath();
        ctx.fillStyle =
          star.tint === "gold"
            ? `rgba(251, 191, 36, ${alpha * 0.16})`
            : star.tint === "violet"
              ? `rgba(167, 139, 250, ${alpha * 0.18})`
              : `rgba(160, 220, 255, ${alpha * 0.26})`;
        ctx.arc(star.x, y, star.r * 1.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.beginPath();
      ctx.fillStyle = starTint;
      ctx.arc(star.x, y, star.r, 0, Math.PI * 2);
      ctx.fill();

      if (star.r > 2.8) {
        ctx.fillStyle = `rgba(255,255,255,${Math.min(0.95, alpha + 0.14)})`;
        ctx.fillRect(star.x - 0.6, y - 0.6, 1.2, 1.2);
        ctx.fillRect(star.x - 3.4, y - 0.25, 6.8, 0.5);
        ctx.fillRect(star.x - 0.25, y - 3.4, 0.5, 6.8);
      }
    }
  }, [height, width]);

  useImperativeHandle(ref, () => ({
    renderFrame: (timeMs: number, cameraOffsetY: number) => {
      drawFrame(timeMs, cameraOffsetY);
    },
  }), [drawFrame]);

  useEffect(() => {
    starsRef.current = stars;
  }, [stars]);

  useEffect(() => {
    cameraYRef.current = cameraY;
  }, [cameraY]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio || 1, quality === "high" ? 4 : 1.5);
    dprRef.current = dpr;
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
  }, [drawFrame, height, quality, width]);

  return <canvas ref={canvasRef} className="pointer-events-none h-full w-full" aria-hidden />;
});

export default AxioraStarField;

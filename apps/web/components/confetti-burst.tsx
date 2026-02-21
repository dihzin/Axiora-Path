"use client";

import { useEffect, useMemo, useState } from "react";

type ConfettiBurstProps = {
  trigger: number;
};

const COLORS = ["#22c55e", "#3b82f6", "#f97316", "#eab308", "#ef4444", "#a855f7"];
const PIECES_COUNT = 12;

export function ConfettiBurst({ trigger }: ConfettiBurstProps) {
  const [active, setActive] = useState(false);
  const reducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const baseAngle = useMemo(() => 70 + Math.random() * 40, []);
  const pieces = useMemo(
    () =>
      Array.from({ length: PIECES_COUNT }).map((_, index) => {
        const spread = (Math.random() - 0.5) * 40;
        const angle = ((baseAngle + spread) * Math.PI) / 180;
        const distance = 90 + Math.random() * 120;
        return {
          id: index,
          left: 40 + Math.random() * 20,
          tx: Math.cos(angle) * distance,
          ty: Math.sin(angle) * distance,
          rotate: Math.random() * 360,
          delay: Math.random() * 110,
          color: COLORS[index % COLORS.length],
        };
      }),
    [baseAngle],
  );

  useEffect(() => {
    if (trigger === 0 || reducedMotion) return;
    setActive(true);
    const t = window.setTimeout(() => setActive(false), 900);
    return () => window.clearTimeout(t);
  }, [trigger, reducedMotion]);

  if (!active) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {pieces.map((piece) => (
        <span
          key={piece.id}
          className="absolute h-2 w-1 rounded-sm opacity-90"
          style={{
            left: `${piece.left}%`,
            top: "48%",
            backgroundColor: piece.color,
            transform: "translate(-50%, -50%)",
            willChange: "transform, opacity",
            animation: `confetti-burst 780ms cubic-bezier(.2,.8,.2,1) ${piece.delay}ms forwards`,
            ["--tx" as string]: `${piece.tx}px`,
            ["--ty" as string]: `${piece.ty}px`,
            ["--rot" as string]: `${piece.rotate}deg`,
          }}
        />
      ))}
    </div>
  );
}

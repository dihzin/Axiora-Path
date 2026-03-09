"use client";

import { useEffect, useState } from "react";

import type { TugOfWarEvent } from "./useTugOfWarEngine";

type RopeProps = {
  start: { x: number; y: number };
  end: { x: number; y: number };
  ropeCenter: number;
  lastEvent?: TugOfWarEvent;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function Rope({ start, end, ropeCenter, lastEvent = "idle" }: RopeProps) {
  const [pullVibrate, setPullVibrate] = useState(false);
  const [shake, setShake] = useState(false);

  const p0 = { x: clamp(start.x, 0, 1200), y: clamp(start.y, 0, 260) };
  const p2 = { x: clamp(end.x, 0, 1200), y: clamp(end.y, 0, 260) };
  const midX = (p0.x + p2.x) / 2;
  const sag = 18 + Math.abs(ropeCenter) * 22;
  const controlY = p0.y + sag;
  const path = `M ${p0.x} ${p0.y} Q ${midX} ${controlY} ${p2.x} ${p2.y}`;
  const markerWidth = 14;
  const markerHeight = 12;

  useEffect(() => {
    const isCorrect = lastEvent === "p1_correct" || lastEvent === "p2_correct";
    if (!isCorrect) return;
    setPullVibrate(true);
    const timer = window.setTimeout(() => setPullVibrate(false), 200);
    return () => window.clearTimeout(timer);
  }, [lastEvent]);

  useEffect(() => {
    const isWrong = lastEvent === "p1_wrong" || lastEvent === "p2_wrong";
    if (!isWrong) return;
    setShake(true);
    const timer = window.setTimeout(() => setShake(false), 350);
    return () => window.clearTimeout(timer);
  }, [lastEvent]);

  return (
    <div className={`tow-rope-layer ${shake ? "tow-rope-shake" : ""}`}>
      <svg
        className={`h-full w-full ${pullVibrate ? "tow-rope-vibrate" : ""}`}
        viewBox="0 0 1200 260"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path
          d={path}
          fill="none"
          stroke="#7b4b25"
          strokeWidth="10"
          strokeLinecap="round"
        />

        <circle
          cx={midX}
          cy={controlY}
          r={8 + Math.abs(ropeCenter) * 4}
          fill="#ef4444"
          opacity={0.2 + Math.abs(ropeCenter) * 0.45}
        />
        <rect
          x={midX - markerWidth / 2}
          y={controlY - markerHeight / 2}
          width={markerWidth}
          height={markerHeight}
          rx={3}
          fill="#dc2626"
          stroke="#7f1d1d"
          strokeWidth="1.5"
        />
      </svg>

      <style jsx>{`
        .tow-rope-layer {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 9;
        }

        .tow-rope-vibrate {
          animation: rope-vibrate 200ms ease-out;
        }

        .tow-rope-shake {
          animation: rope-shake 350ms ease;
        }

        @keyframes rope-vibrate {
          0% {
            transform: scaleY(1);
          }
          20% {
            transform: scaleY(1.08);
          }
          40% {
            transform: scaleY(0.94);
          }
          60% {
            transform: scaleY(1.06);
          }
          80% {
            transform: scaleY(0.97);
          }
          100% {
            transform: scaleY(1);
          }
        }

        @keyframes rope-shake {
          0% {
            transform: translateX(0);
          }
          20% {
            transform: translateX(-8px);
          }
          40% {
            transform: translateX(6px);
          }
          60% {
            transform: translateX(-4px);
          }
          100% {
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}

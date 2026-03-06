"use client";

type RopeDynamicProps = {
  centerX: number;
  sag: number;
  tension: number;
  wavePhase: number;
  shake: number;
  width?: number;
  height?: number;
};

type Point = { x: number; y: number };

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getPointOnCubicBezier(t: number, p0: Point, p1: Point, p2: Point, p3: Point): Point {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;

  const x = mt2 * mt * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t2 * t * p3.x;
  const y = mt2 * mt * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t2 * t * p3.y;

  return { x, y };
}

export function RopeDynamic({ centerX, sag, tension, wavePhase, shake, width = 220, height = 80 }: RopeDynamicProps) {
  const clampedCenter = clamp(centerX, 0, 1);
  const midY = height * 0.55 + Math.sin(wavePhase) * shake;

  const p0 = { x: 0, y: midY };
  const p3 = { x: width, y: midY };
  const p1 = {
    x: lerp(width * 0.25, width * 0.4, clampedCenter),
    y: midY + sag,
  };
  const p2 = {
    x: lerp(width * 0.6, width * 0.75, clampedCenter),
    y: midY + sag,
  };

  const ropePath = `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} C ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}, ${p3.x.toFixed(2)} ${p3.y.toFixed(2)}`;

  const twistTicks = [0.15, 0.29, 0.43, 0.57, 0.71, 0.85].map((t, index) => {
    const point = getPointOnCubicBezier(t, p0, p1, p2, p3);
    const size = 8 - tension * 2;
    const direction = index % 2 === 0 ? 1 : -1;
    return {
      id: index,
      x1: point.x - size,
      y1: point.y - size * 0.35 * direction,
      x2: point.x + size,
      y2: point.y + size * 0.35 * direction,
    };
  });

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "220px", height: "80px", overflow: "visible" }} role="img" aria-label="dynamic rope">
      <defs>
        <linearGradient id="towRopeGradient" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#eab308" />
          <stop offset="48%" stopColor="#d97706" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
      </defs>

      <path d={ropePath} fill="none" stroke="url(#towRopeGradient)" strokeWidth="10" strokeLinecap="round" />
      <path d={ropePath} fill="none" stroke="#fff8dc" strokeWidth="4" strokeLinecap="round" opacity="0.25" />

      {twistTicks.map((segment) => (
        <line
          key={segment.id}
          x1={segment.x1}
          y1={segment.y1}
          x2={segment.x2}
          y2={segment.y2}
          stroke="#8a4b06"
          strokeWidth="1.6"
          strokeLinecap="round"
          opacity="0.72"
        />
      ))}
    </svg>
  );
}

"use client";

type PathAmbientLayerProps = {
  width: number;
  height: number;
  chapterBands?: Array<{ top: number; height: number; tone: "soft" | "alt" }>;
};

export function PathAmbientLayer({ width, height, chapterBands = [] }: PathAmbientLayerProps) {
  const w = Math.max(width, 1);
  const h = Math.max(height, 1);

  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="path-ambient-vertical" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(170,182,198,0.06)" />
          <stop offset="45%" stopColor="rgba(170,182,198,0.02)" />
          <stop offset="100%" stopColor="rgba(162,174,191,0.055)" />
        </linearGradient>
        <radialGradient id="path-ambient-blob-a" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(172,184,200,0.06)" />
          <stop offset="100%" stopColor="rgba(172,184,200,0)" />
        </radialGradient>
        <radialGradient id="path-ambient-blob-b" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(160,173,191,0.05)" />
          <stop offset="100%" stopColor="rgba(160,173,191,0)" />
        </radialGradient>
      </defs>

      <rect x="0" y="0" width={w} height={h} fill="url(#path-ambient-vertical)" />

      <circle cx={w * 0.22} cy={h * 0.17} r={w * 0.28} fill="rgba(176,188,204,0.05)" />
      <circle cx={w * 0.86} cy={h * 0.31} r={w * 0.2} fill="rgba(169,182,199,0.045)" />
      <circle cx={w * 0.14} cy={h * 0.66} r={w * 0.24} fill="rgba(168,181,197,0.04)" />
      <circle cx={w * 0.88} cy={h * 0.82} r={w * 0.26} fill="rgba(167,180,196,0.04)" />

      <ellipse cx={w * 0.54} cy={h * 0.42} rx={w * 0.28} ry={h * 0.1} fill="url(#path-ambient-blob-a)" />
      <ellipse cx={w * 0.44} cy={h * 0.78} rx={w * 0.34} ry={h * 0.11} fill="url(#path-ambient-blob-b)" />

      {chapterBands.map((band, index) => (
        <rect
          key={`chapter-band-${index}`}
          x="0"
          y={band.top}
          width={w}
          height={Math.max(0, band.height)}
          fill={band.tone === "soft" ? "rgba(172,184,200,0.018)" : "rgba(159,172,190,0.012)"}
        />
      ))}
    </svg>
  );
}

"use client";

type TrailParticlesProps = {
  count?: number;
};

const BASE_X = [8, 16, 24, 34, 44, 54, 62, 70, 78, 86, 92, 96];
const BASE_Y = [6, 14, 22, 30, 38, 46, 56, 64, 72, 80, 88, 94];
const DURATIONS = [12, 15, 18, 14, 16, 19, 13, 17, 20, 12, 16, 18];
const DELAYS = [0, 1.2, 2.4, 0.6, 1.8, 3, 0.9, 2.1, 3.3, 1.5, 2.7, 3.9];

export function TrailParticles({ count = 12 }: TrailParticlesProps) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: count }).map((_, index) => (
        <span
          key={`trail-particle-${index}`}
          className="absolute h-1.5 w-1.5 rounded-full bg-white/10"
          style={{
            left: `${BASE_X[index % BASE_X.length]}%`,
            top: `${BASE_Y[index % BASE_Y.length]}%`,
            animation: `trail-float ${DURATIONS[index % DURATIONS.length]}s ease-in-out ${DELAYS[index % DELAYS.length]}s infinite`,
          }}
        />
      ))}

      <style jsx global>{`
        @keyframes trail-float {
          0% {
            transform: translate3d(0, 0, 0);
            opacity: 0.06;
          }
          50% {
            transform: translate3d(0, -8px, 0);
            opacity: 0.12;
          }
          100% {
            transform: translate3d(0, 0, 0);
            opacity: 0.06;
          }
        }
      `}</style>
    </div>
  );
}

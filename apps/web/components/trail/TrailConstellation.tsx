"use client";

import { useEffect, useState } from "react";

type StarDot = {
  size: number;
  top: number;
  left: number;
  duration: number;
  delay: number;
};

type TrailConstellationProps = {
  isCurrent?: boolean;
};

export default function TrailConstellation({ isCurrent = false }: TrailConstellationProps) {
  const [nearStars, setNearStars] = useState<StarDot[]>([]);
  const [farStars, setFarStars] = useState<Array<{ left: string; top: string }>>([]);

  useEffect(() => {
    const generatedNearStars: StarDot[] = Array.from({ length: 30 }).map(() => {
      const size = Math.random() > 0.7 ? 4 : 2;
      return {
        size,
        top: Math.random() * 100,
        left: Math.random() * 100,
        duration: 12 + Math.random() * 8,
        delay: Math.random() * 4,
      };
    });
    const generatedFarStars = Array.from({ length: 20 }).map(() => ({
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
    }));

    setNearStars(generatedNearStars);
    setFarStars(generatedFarStars);
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 z-0">
      <div className="stars-far absolute inset-0 pointer-events-none">
        {farStars.map((star, i) => (
          <div
            key={`far-${i}`}
            className="absolute h-[1px] w-[1px] rounded-full bg-white/40 opacity-30"
            style={{ left: star.left, top: star.top }}
          />
        ))}
      </div>
      <div className="stars-near absolute inset-0 pointer-events-none">
        {nearStars.map((star, i) => (
          <div
            key={`near-${i}`}
            className="absolute rounded-full bg-white/20"
            style={{
              width: star.size,
              height: star.size,
              top: `${star.top}%`,
              left: `${star.left}%`,
              animation: `float ${star.duration}s ease-in-out ${star.delay}s infinite`,
            }}
          />
        ))}
      </div>
      {isCurrent && (
        <div className="absolute left-1/2 top-1/2">
          <div className="star-small absolute -left-5 -top-6" />
          <div className="star-small absolute -left-2 -top-10" />
          <div className="star-small absolute left-2 -top-4" />
        </div>
      )}
    </div>
  );
}

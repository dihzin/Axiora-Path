"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";

type PathSvgProps = {
  samplePathRef: RefObject<SVGPathElement | null>;
  samplePathD: string;
  visualPathD: string;
  width: number;
  height: number;
  progressRatio?: number;
  previewRatio?: number | null;
};

export function PathSvg({ samplePathRef, samplePathD, visualPathD, width, height, progressRatio = 0, previewRatio = null }: PathSvgProps) {
  const progressPathRef = useRef<SVGPathElement | null>(null);
  const [pathLength, setPathLength] = useState(0);

  useLayoutEffect(() => {
    const pathEl = progressPathRef.current;
    if (!pathEl) {
      setPathLength(0);
      return;
    }
    setPathLength(pathEl.getTotalLength());
  }, [visualPathD, width, height]);

  const clampedProgress = Math.max(0, Math.min(1, progressRatio));
  const clampedPreview = previewRatio === null ? null : Math.max(clampedProgress, Math.min(1, previewRatio));
  const progressOffset = pathLength > 0 ? pathLength * (1 - clampedProgress) : 0;
  const previewLength = clampedPreview !== null && pathLength > 0 ? pathLength * clampedPreview : 0;
  const progressLength = pathLength > 0 ? pathLength * clampedProgress : 0;
  const previewSegment = Math.max(0, previewLength - progressLength);
  const previewOffset = pathLength > 0 ? pathLength - previewLength : 0;

  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox={`0 0 ${Math.max(width, 1)} ${Math.max(height, 1)}`}
      preserveAspectRatio="none"
    >
      <path
        d={visualPathD}
        fill="none"
        stroke="rgba(151, 165, 184, 0.18)"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        ref={progressPathRef}
        d={visualPathD}
        fill="none"
        stroke="rgba(26, 188, 167, 0.45)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={pathLength > 0 ? `${pathLength}` : undefined}
        strokeDashoffset={progressOffset}
        style={{ transition: "stroke-dashoffset 250ms cubic-bezier(0.22, 0.61, 0.36, 1)" }}
      />
      {clampedPreview !== null && previewSegment > 0 ? (
        <path
          d={visualPathD}
          fill="none"
          stroke="rgba(78, 222, 200, 0.62)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={`${previewSegment} ${pathLength}`}
          strokeDashoffset={previewOffset}
          style={{ transition: "stroke-dasharray 250ms cubic-bezier(0.22, 0.61, 0.36, 1), stroke-dashoffset 250ms cubic-bezier(0.22, 0.61, 0.36, 1)" }}
        />
      ) : null}
      <path ref={samplePathRef} d={samplePathD} fill="none" stroke="transparent" strokeWidth="10" />
    </svg>
  );
}

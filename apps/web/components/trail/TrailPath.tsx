"use client";

import type { TrailLessonNode } from "@/lib/trail-types";

import { LessonNode } from "@/components/trail/LessonNode";

type TrailPathProps = {
  nodes: TrailLessonNode[];
  onNodeClick?: (node: TrailLessonNode) => void;
};

const X_MAP = {
  left: 25,
  center: 50,
  right: 75,
} as const;

const NODE_STEP = 130;
const TOP_OFFSET = 64;
const SVG_W = 360;

function toSvgX(percent: number) {
  return (percent / 100) * SVG_W;
}

function buildBezierPath(nodes: TrailLessonNode[]) {
  if (nodes.length === 0) return "";
  if (nodes.length === 1) {
    const x = toSvgX(X_MAP[nodes[0].position]);
    return `M ${x} ${TOP_OFFSET}`;
  }

  let d = "";
  nodes.forEach((node, idx) => {
    const x = toSvgX(X_MAP[node.position]);
    const y = TOP_OFFSET + idx * NODE_STEP;

    if (idx === 0) {
      d = `M ${x} ${y}`;
      return;
    }

    const prev = nodes[idx - 1];
    const px = toSvgX(X_MAP[prev.position]);
    const py = TOP_OFFSET + (idx - 1) * NODE_STEP;
    const midY = (py + y) / 2;
    d += ` C ${px} ${midY}, ${x} ${midY}, ${x} ${y}`;
  });

  return d;
}

export function TrailPath({ nodes, onNodeClick }: TrailPathProps) {
  const totalHeight = nodes.length * NODE_STEP + 80;
  const pathD = buildBezierPath(nodes);
  const lastContiguousReachedIndex = (() => {
    let idx = -1;
    for (let i = 0; i < nodes.length; i += 1) {
      if (nodes[i].type === "completed" || nodes[i].type === "active") {
        idx = i;
      } else {
        break;
      }
    }
    return idx;
  })();
  const progress = nodes.length > 1 && lastContiguousReachedIndex > 0 ? lastContiguousReachedIndex / (nodes.length - 1) : 0;

  return (
    <div className="relative w-full" style={{ height: totalHeight }}>
      <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${SVG_W} ${totalHeight}`} preserveAspectRatio="none" aria-hidden>
        <path d={pathD} fill="none" stroke="rgba(120,137,161,0.25)" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" transform="translate(0 1)" />
        <path d={pathD} fill="none" stroke="#C5D0DF" strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round" />
        {progress > 0 ? (
          <>
            <path
              d={pathD}
              fill="none"
              stroke="#B8F5E0"
              strokeWidth="10"
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              style={{
                strokeDasharray: "1",
                strokeDashoffset: `${1 - progress}`,
                transition: "stroke-dashoffset 250ms ease",
              }}
            />
            <path
              d={pathD}
              fill="none"
              stroke="#4DD9AC"
              strokeWidth="6.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              style={{
                strokeDasharray: "1",
                strokeDashoffset: `${1 - progress}`,
                transition: "stroke-dashoffset 250ms ease",
              }}
            />
          </>
        ) : null}
      </svg>

      {nodes.map((node, index) => {
        const x = X_MAP[node.position];
        const y = TOP_OFFSET + index * NODE_STEP;
        return (
          <div key={node.id} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${x}%`, top: y }}>
            <LessonNode type={node.type} title={node.title} index={index} onClick={() => onNodeClick?.(node)} />
          </div>
        );
      })}
    </div>
  );
}

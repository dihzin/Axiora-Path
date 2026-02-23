// components/trail/TrailPath.tsx
'use client'

import { LessonNode as LessonNodeComponent, NodeType } from './LessonNode'

export interface TrailNodeData {
  id: string
  type: NodeType
  title: string
  position: 'left' | 'center' | 'right'
}

interface TrailPathProps {
  nodes: TrailNodeData[]
  onNodeClick?: (node: TrailNodeData) => void
}

const NODE_HEIGHT = 130  // vertical spacing between nodes
const W = 320            // viewBox width
const PADDING_TOP = 60

const X_MAP = { left: 0.22, center: 0.5, right: 0.78 }
const toX = (pos: 'left' | 'center' | 'right') => W * X_MAP[pos]

export function TrailPath({ nodes, onNodeClick }: TrailPathProps) {
  // ── Invert: show active/recent at top, locked at bottom ──────────────────
  const ordered = [...nodes].reverse()

  const totalHeight = ordered.length * NODE_HEIGHT + PADDING_TOP + 40

  const points = ordered.map((node, i) => ({
    x: toX(node.position),
    y: PADDING_TOP + i * NODE_HEIGHT,
  }))

  // Smooth cubic bezier through all points
  const buildPath = () => {
    if (points.length < 2) return ''
    let d = `M ${points[0].x} ${points[0].y}`
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1]
      const curr = points[i]
      const cy = (prev.y + curr.y) / 2
      d += ` C ${prev.x} ${cy}, ${curr.x} ${cy}, ${curr.x} ${curr.y}`
    }
    return d
  }

  const pathD = buildPath()

  return (
    <div className="relative w-full" style={{ height: totalHeight }}>
      {/* SVG path — overflow visible so it doesn't clip at edges */}
      <svg
        className="absolute inset-0 w-full"
        style={{ height: totalHeight, overflow: 'visible' }}
        viewBox={`0 0 ${W} ${totalHeight}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Glow / halo */}
        <path d={pathD} fill="none" stroke="#B8F5E0" strokeWidth="20"
          strokeLinecap="round" strokeLinejoin="round" />
        {/* Main track */}
        <path d={pathD} fill="none" stroke="#4DD9AC" strokeWidth="11"
          strokeLinecap="round" strokeLinejoin="round" />
        {/* Inner highlight stripe */}
        <path d={pathD} fill="none" stroke="white" strokeWidth="3.5"
          strokeLinecap="round" strokeOpacity="0.45" />
      </svg>

      {/* Nodes */}
      {ordered.map((node, i) => (
        <div
          key={node.id}
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: points[i].x, top: points[i].y }}
        >
          <LessonNodeComponent
            type={node.type}
            title={node.title}
            index={i}
            onClick={() => onNodeClick?.(node)}
          />
        </div>
      ))}
    </div>
  )
}

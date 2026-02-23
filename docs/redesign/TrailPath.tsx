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

const NODE_SPACING = 130  // px between node centers
const PAD_TOP      = 80   // extra space so first node clears the banner
const W            = 320  // SVG viewBox width

const X_MAP: Record<'left' | 'center' | 'right', number> = {
  left:   W * 0.22,
  center: W * 0.50,
  right:  W * 0.78,
}

export function TrailPath({ nodes, onNodeClick }: TrailPathProps) {
  // Reverse so active appears at TOP, locked at BOTTOM
  const ordered = [...nodes].reverse()

  const pts = ordered.map((node, i) => ({
    x: X_MAP[node.position],
    y: PAD_TOP + i * NODE_SPACING,
  }))

  const totalH = PAD_TOP + ordered.length * NODE_SPACING + 60

  /* Smooth cubic-bezier path through all node centres */
  const buildPath = () => {
    if (pts.length < 2) return ''
    let d = `M ${pts[0].x} ${pts[0].y}`
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1]
      const curr = pts[i]
      const cy = (prev.y + curr.y) / 2
      d += ` C ${prev.x} ${cy}, ${curr.x} ${cy}, ${curr.x} ${curr.y}`
    }
    return d
  }

  const pathD = buildPath()

  return (
    <div className="relative w-full" style={{ height: totalH }}>

      {/* ── SVG winding trail ── */}
      <svg
        className="absolute inset-0 w-full"
        viewBox={`0 0 ${W} ${totalH}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ height: totalH, overflow: 'visible' }}   // never clips
      >
        {/* Outer glow */}
        <path d={pathD} fill="none" stroke="#B8F5E0"
          strokeWidth="22" strokeLinecap="round" strokeLinejoin="round" />
        {/* Main track */}
        <path d={pathD} fill="none" stroke="#4DD9AC"
          strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
        {/* Inner highlight */}
        <path d={pathD} fill="none" stroke="white"
          strokeWidth="4" strokeLinecap="round" strokeOpacity="0.4" />
      </svg>

      {/* ── Nodes ── */}
      {ordered.map((node, i) => (
        <div
          key={node.id}
          className="absolute"
          style={{
            left: pts[i].x,
            top:  pts[i].y,
            transform: 'translate(-50%, -50%)',
          }}
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

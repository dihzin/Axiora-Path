// components/trail/TrailScreen.tsx
'use client'

import { useState } from 'react'
import { TopStatsBar } from './TopStatsBar'
import { UnitBanner }  from './UnitBanner'
import { TrailPath, TrailNodeData } from './TrailPath'
import { BottomNav }   from './BottomNav'

// ── Mock data — replace with API fetch from FastAPI ───────────────────────────
// Order: define bottom-to-top; TrailPath.reverse() shows active at top.
const mockNodes: TrailNodeData[] = [
  { id: 'n5', type: 'locked',    title: 'Lição 5', position: 'right'  },
  { id: 'n4', type: 'locked',    title: 'Lição 4', position: 'center' },
  { id: 'n3', type: 'completed', title: 'Lição 3', position: 'left'   },
  { id: 'n2', type: 'completed', title: 'Lição 2', position: 'center' },
  { id: 'n1', type: 'active',    title: 'Lição 1', position: 'right'  },
]

const mockUnit = {
  section:  'Seção 1, Unidade 1',
  title:    'Unidade 1: Fundamentos Numéricos',
  color:    'linear-gradient(135deg, #4DD9AC 0%, #1CB0F6 100%)',
  progress: 60,
}
// ─────────────────────────────────────────────────────────────────────────────

export function TrailScreen() {
  const [nodes] = useState<TrailNodeData[]>(mockNodes)

  return (
    <div className="min-h-screen bg-[#F7F7F7]">

      {/* Sticky top stats — z-30 so nodes can overlap if needed */}
      <TopStatsBar streak={1} gems={277} xp={34} />

      {/* Scrollable content */}
      <main className="max-w-sm mx-auto px-4 pt-4 pb-32 overflow-y-auto">

        {/* Banner — z-10 so it never covers nodes */}
        <UnitBanner
          section={mockUnit.section}
          title={mockUnit.title}
          progress={mockUnit.progress}
          color={mockUnit.color}
        />

        {/* Winding trail */}
        <TrailPath
          nodes={nodes}
          onNodeClick={(node) => {
            console.log('Navigate to lesson:', node.id)
            // router.push(`/learn/${node.id}`)
          }}
        />
      </main>

      <BottomNav />
    </div>
  )
}

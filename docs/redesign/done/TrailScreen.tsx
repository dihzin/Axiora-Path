// components/trail/TrailScreen.tsx
'use client'

import { useState } from 'react'
import { UnitBanner } from './UnitBanner'
import { TrailPath, TrailNodeData } from './TrailPath'
import { BottomNav } from './BottomNav'
import { TopStatsBar } from './TopStatsBar'

// ── Mock data — swap for API fetch ────────────────────────────────────────────
// Order here is BOTTOM → TOP (TrailPath will reverse to show active on top)
const mockNodes: TrailNodeData[] = [
  { id: 'n1', type: 'locked',    title: 'Lição 5', position: 'center' },
  { id: 'n2', type: 'locked',    title: 'Lição 4', position: 'right'  },
  { id: 'n3', type: 'completed', title: 'Lição 3', position: 'center' },
  { id: 'n4', type: 'completed', title: 'Lição 2', position: 'left'   },
  { id: 'n5', type: 'active',    title: 'Lição 1', position: 'center' },
]

const mockUnit = {
  id: 'unit-1',
  section: 'Seção 1, Unidade 1',
  title: 'Unidade 1: Fundamentos Numéricos',
  color: 'linear-gradient(135deg, #4DD9AC 0%, #1CB0F6 100%)',
  progress: 60,
  nodes: mockNodes,
}
// ─────────────────────────────────────────────────────────────────────────────

export function TrailScreen() {
  const [unit] = useState(mockUnit)

  const handleNodeClick = (node: TrailNodeData) => {
    console.log('Clicked:', node)
    // router.push(`/learn/${node.id}`)
  }

  return (
    <div className="min-h-screen bg-[#F7F7F7]">
      {/* Sticky top stats */}
      <TopStatsBar streak={1} gems={277} xp={33} />

      {/* Scrollable trail */}
      <main className="max-w-sm mx-auto px-4 pt-4 pb-32 overflow-y-auto">
        <UnitBanner unit={unit} />

        <TrailPath
          nodes={unit.nodes}
          onNodeClick={handleNodeClick}
        />
      </main>

      <BottomNav />
    </div>
  )
}

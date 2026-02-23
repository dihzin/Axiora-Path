// packages/shared/types/trail.ts

export type NodeType = 'completed' | 'active' | 'locked' | 'bonus'

export interface LessonNode {
  id: string
  type: NodeType
  title: string
  description?: string
  xpReward?: number
  position: 'left' | 'center' | 'right'
}

export interface Unit {
  id: string
  title: string
  section: string
  color?: string
  progress: number // 0-100
  nodes: LessonNode[]
}

export interface TrailProps {
  units: Unit[]
  onNodePress?: (node: LessonNode) => void
}

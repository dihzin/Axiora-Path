export type TrailNodeType = "completed" | "active" | "locked" | "bonus";
export type TrailNodePosition = "left" | "center" | "right";

export interface TrailLessonNode {
  id: string;
  type: TrailNodeType;
  title: string;
  position: TrailNodePosition;
  step?: number;
}

export interface TrailUnit {
  id: string;
  title: string;
  section: string;
  progress: number;
  nodes: TrailLessonNode[];
}

export type TrailNodeType = "completed" | "active" | "current" | "locked" | "future" | "bonus";
export type TrailNodePosition = "left" | "center" | "right";

export interface TrailLessonNode {
  id: string;
  lessonId: number;
  type: TrailNodeType;
  title: string;
  order: number;
  unlocked: boolean;
  completed: boolean;
  position?: TrailNodePosition;
}

export interface TrailUnit {
  id: string;
  order: number;
  title: string;
  sectionLabel: string;
  progress: number;
  locked: boolean;
  prerequisiteText: string | null;
  nodes: TrailLessonNode[];
}

export interface TrailDomainSectionData {
  id: string;
  name: string;
  areaLabel: string;
  units: TrailUnit[];
}

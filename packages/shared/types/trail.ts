export type NodeType = "completed" | "active" | "locked" | "bonus";

export interface LessonNode {
  id: string;
  type: NodeType;
  title: string;
  position: "left" | "center" | "right";
}

export interface Unit {
  id: string;
  title: string;
  section: string;
  progress: number;
  nodes: LessonNode[];
}


import type { LearningPathResponse, MissionsCurrentResponse } from "@/lib/api/client";

export type DomainMedalTier = "none" | "bronze" | "silver" | "gold" | "diamond";

export function resolveDomainCompletion(path: LearningPathResponse | null): {
  completedLessons: number;
  totalLessons: number;
  completionPercent: number;
  medal: DomainMedalTier;
} {
  if (!path) return { completedLessons: 0, totalLessons: 0, completionPercent: 0, medal: "none" };
  let total = 0;
  let completed = 0;
  for (const unit of path.units) {
    for (const node of unit.nodes) {
      if (!node.lesson) continue;
      total += 1;
      if (node.lesson.completed) completed += 1;
    }
  }
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  let medal: DomainMedalTier = "none";
  if (percent >= 100) medal = "diamond";
  else if (percent >= 75) medal = "gold";
  else if (percent >= 50) medal = "silver";
  else if (percent >= 25) medal = "bronze";
  return { completedLessons: completed, totalLessons: total, completionPercent: percent, medal };
}

function getIsoWeek(date: Date): { week: number; year: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { week, year: d.getUTCFullYear() };
}

export function getIsoWeekLabel(date: Date = new Date()): string {
  const { week, year } = getIsoWeek(date);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export function resolveWeeklyGoalProgress(missions: MissionsCurrentResponse | null, target = 3): {
  completed: number;
  target: number;
  weekLabel: string;
} {
  const now = new Date();
  const weekLabel = getIsoWeekLabel(now);
  if (!missions) return { completed: 0, target, weekLabel };

  const lessonMission = missions.missions.find((item) => item.missionType === "LESSONS_COMPLETED");
  if (!lessonMission) return { completed: 0, target, weekLabel };

  const start = new Date(lessonMission.startDate);
  const end = new Date(lessonMission.endDate);
  const inRange = !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && now >= start && now <= end;
  if (!inRange) return { completed: 0, target, weekLabel };

  return {
    completed: Math.max(0, Math.min(target, Math.floor(lessonMission.currentValue))),
    target,
    weekLabel,
  };
}

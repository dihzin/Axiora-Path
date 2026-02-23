"use client";

import { memo } from "react";

import { UnitHeaderCardDuolingoLike } from "@/components/aprender/UnitHeaderCardDuolingoLike";
import type { LearningPathUnit } from "@/lib/api/client";

type StickySectionCardProps = {
  unit: LearningPathUnit;
  sectionOrder: number;
  completedLessons: number;
  totalLessons: number;
  active: boolean;
  animationKey: number;
  variant?: "default" | "compact";
  state?: "default" | "completed" | "locked" | "inProgress";
};

function StickySectionCardComponent({
  unit,
  sectionOrder,
  completedLessons,
  totalLessons,
  active,
  animationKey,
  variant = "default",
  state = "default",
}: StickySectionCardProps) {
  const resolvedState = state === "default" && active ? "inProgress" : state;
  const compact = variant === "compact";
  return (
    <div className={`w-full max-w-full ${compact ? "" : "px-0"}`}>
      <div key={animationKey} className="path-sticky-card-enter w-full transform-gpu will-change-[transform,opacity]">
        <UnitHeaderCardDuolingoLike
          sectionOrder={sectionOrder}
          order={unit.order}
          title={unit.title}
          completionRate={unit.completionRate}
          completedLessons={completedLessons}
          totalLessons={totalLessons}
          state={resolvedState}
        />
      </div>
    </div>
  );
}

export const StickySectionCard = memo(StickySectionCardComponent);

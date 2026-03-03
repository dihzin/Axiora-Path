"use client";

import type { TrailDomainSectionData, TrailNodeType } from "@/lib/trail-types";
import { UnitBlock } from "@/components/trail/UnitBlock";

type DomainSectionProps = {
  domain: TrailDomainSectionData;
  onLessonClick: (lessonId: number, state: TrailNodeType) => void;
};

export function DomainSection({ domain, onLessonClick }: DomainSectionProps) {
  return (
    <section className="space-y-4">
      {domain.units.map((unit, index) => (
        <UnitBlock key={unit.id} unit={unit} index={index} onLessonClick={onLessonClick} />
      ))}
    </section>
  );
}

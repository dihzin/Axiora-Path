"use client";

import type { TrailUnit } from "@axiora/shared";
import { UnitBanner } from "@/components/trail/UnitBanner";

type DesktopUnitHeaderProps = {
  unit: TrailUnit;
  rect: { left: number; width: number } | null;
};

export function DesktopUnitHeader({ unit, rect }: DesktopUnitHeaderProps) {
  if (!rect) return null;

  return (
    <div className="fixed top-5 z-30 hidden lg:block" style={{ left: rect.left, width: rect.width }}>
      <div className="bg-[#F4F7FC]/95 pb-2.5 [backdrop-filter:blur(1.5px)]">
        <UnitBanner unit={unit} />
      </div>
    </div>
  );
}

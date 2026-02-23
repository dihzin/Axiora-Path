"use client";

import { BookOpen, List } from "lucide-react";

import type { TrailUnit } from "@axiora/shared";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

type UnitBannerProps = {
  unit: TrailUnit;
};

export function UnitBanner({ unit }: UnitBannerProps) {
  return (
    <Card className="relative overflow-hidden rounded-[24px] border-0 bg-gradient-to-br from-[#42D4AE] via-[#27C4B6] to-[#27ACEB] shadow-[0_10px_22px_rgba(0,0,0,0.14)] lg:rounded-[22px] lg:shadow-[0_8px_18px_rgba(0,0,0,0.12)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-white/20 to-transparent lg:h-12" aria-hidden />
      <div className="relative px-4 pb-3 pt-2.5 lg:px-4 lg:pb-2.5 lg:pt-2">
        <div className="flex items-start justify-between gap-2.5">
          <div className="min-w-0 flex-1">
            <Badge className="bg-white/14 px-2 py-1 text-[10px] font-extrabold tracking-[0.08em] text-white/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.26)] lg:text-[9px]">
              {unit.section}
            </Badge>
            <h2 className="mt-1.5 line-clamp-2 text-[18px] font-black leading-[1.05] text-white drop-shadow-[0_1px_0_rgba(0,0,0,0.08)] lg:mt-1 lg:text-[16px] lg:leading-[1.08]">
              {unit.title}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Detalhes da unidade"
            className="inline-flex h-10 w-10 items-center justify-center rounded-[13px] border border-white/22 bg-white/14 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_2px_8px_rgba(0,0,0,0.12)] transition-colors hover:bg-white/22 lg:h-9 lg:w-9"
          >
            <List className="h-5 w-5 lg:h-4.5 lg:w-4.5" strokeWidth={2.5} />
          </button>
        </div>
        <div className="mt-2 flex items-center gap-2 lg:mt-1.5">
          <Progress
            value={unit.progress}
            className="h-1.5 flex-1 rounded-full bg-white/32 lg:h-1.5"
            indicatorClassName="bg-[linear-gradient(90deg,#FF8E66,#FFFFFF)] shadow-[0_0_0_1px_rgba(255,255,255,0.18)_inset] transition-all duration-300"
          />
          <div className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/14 shadow-[inset_0_1px_0_rgba(255,255,255,0.3)] lg:h-4.5 lg:w-4.5">
            <BookOpen className="h-3.5 w-3.5 shrink-0 text-white/90 lg:h-3 lg:w-3" strokeWidth={2.7} />
          </div>
        </div>
      </div>
    </Card>
  );
}

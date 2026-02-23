"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

type ProgressProps = React.HTMLAttributes<HTMLDivElement> & {
  value: number;
  indicatorClassName?: string;
};

export function Progress({ value, className, indicatorClassName, ...props }: ProgressProps) {
  const safe = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("relative h-2 w-full overflow-hidden rounded-full bg-white/35", className)} {...props}>
      <div
        className={cn("h-full rounded-full bg-white transition-all duration-500", indicatorClassName)}
        style={{ width: `${safe}%` }}
      />
    </div>
  );
}


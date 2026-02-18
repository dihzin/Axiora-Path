"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export type NativeSelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(({ className, children, ...props }, ref) => {
  return (
    <select ref={ref} className={cn(className)} {...props}>
      {children}
    </select>
  );
});

NativeSelect.displayName = "NativeSelect";

export { NativeSelect };

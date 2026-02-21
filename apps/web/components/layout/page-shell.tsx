import * as React from "react";

import { cn } from "@/lib/utils";

type PageShellTone = "default" | "child" | "parent" | "admin";
type PageShellWidth = "compact" | "content" | "wide" | "full";

const toneClass: Record<PageShellTone, string> = {
  default: "",
  child: "pb-52 md:pb-40",
  parent: "",
  admin: "",
};

const widthClass: Record<PageShellWidth, string> = {
  compact: "max-w-md md:max-w-2xl",
  content: "max-w-md md:max-w-4xl xl:max-w-5xl",
  wide: "max-w-md md:max-w-5xl xl:max-w-6xl",
  full: "max-w-none",
};

type PageShellProps = React.HTMLAttributes<HTMLElement> & {
  as?: "main" | "section";
  tone?: PageShellTone;
  width?: PageShellWidth;
};

export function PageShell({
  as = "main",
  tone = "default",
  width = "content",
  className,
  ...props
}: PageShellProps) {
  const Component = as;
  return (
    <Component
      className={cn(
        "safe-px safe-pb mx-auto min-h-screen w-full min-w-0 overflow-x-clip px-3 py-4 sm:px-4 md:px-6 md:py-6",
        toneClass[tone],
        widthClass[width],
        className,
      )}
      {...props}
    />
  );
}

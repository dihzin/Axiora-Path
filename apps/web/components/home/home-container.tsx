"use client";

import { ChildDesktopShell } from "@/components/child-desktop-shell";
import { PageShell } from "@/components/layout/page-shell";
import { cn } from "@/lib/utils";

type HomeContainerProps = {
  density: "dense" | "regular";
  contentScale: number;
  ultraDense: boolean;
  children: React.ReactNode;
};

export function HomeContainer({ density, contentScale, ultraDense, children }: HomeContainerProps) {
  const shouldAutoFit = contentScale < 1 || density === "dense";

  return (
    <ChildDesktopShell
      activeNav="inicio"
      menuSkin="trail"
      density={density}
      contentScale={contentScale}
    >
      <PageShell
        tone="child"
        width="full"
        className={cn(
          "axiora-luminous-bg flex flex-col",
          shouldAutoFit
            ? cn(
                "gap-4 pt-3 !pb-2 md:!pb-2 lg:!h-full lg:!min-h-0 lg:!overflow-y-auto lg:!pb-2",
                ultraDense && "gap-3 pt-2",
                density === "regular" && "gap-5 pt-4",
              )
            : "gap-6 pt-5",
        )}
      >
        {children}
      </PageShell>
    </ChildDesktopShell>
  );
}

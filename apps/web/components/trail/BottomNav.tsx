"use client";

import { ChildBottomNav } from "@/components/child-bottom-nav";
import { useIsDesktop } from "@/hooks/useIsDesktop";

type BottomNavProps = {
  forceMobile?: boolean;
};

export function BottomNav({ forceMobile = false }: BottomNavProps) {
  const isDesktop = useIsDesktop();
  const shouldShow = forceMobile || !isDesktop;
  if (!shouldShow) return null;

  return (
    <div className="lg:hidden">
      <ChildBottomNav spacer={false} />
    </div>
  );
}

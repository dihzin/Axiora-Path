"use client";

import { ChildBottomNav } from "@/components/child-bottom-nav";

export function BottomNav() {
  return (
    <div className="lg:hidden">
      <ChildBottomNav spacer={false} />
    </div>
  );
}

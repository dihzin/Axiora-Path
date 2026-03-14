"use client";

import { Suspense } from "react";

import { TrailScreen } from "@/components/trail/TrailScreen";

export default function LearningPathPage() {
  return (
    <div className="relative z-10 min-h-screen overflow-x-hidden bg-transparent">
      <Suspense fallback={null}>
        <TrailScreen />
      </Suspense>
    </div>
  );
}

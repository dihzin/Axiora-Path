"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

import { TrailScreen } from "@/components/trail/TrailScreen";

const AxioraCognitiveField = dynamic(() => import("@/components/ui/AxioraCognitiveField"), {
  ssr: false,
});

export default function LearningPathPage() {
  return (
    <>
      <AxioraCognitiveField />
      <div className="relative z-10 min-h-screen overflow-x-hidden bg-transparent">
        <Suspense fallback={null}>
          <TrailScreen />
        </Suspense>
      </div>
    </>
  );
}

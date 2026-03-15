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
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0"
          style={{
            backgroundImage: "url('/axiora/trilha/mockup.png')",
            backgroundPosition: "center top",
            backgroundSize: "cover",
            backgroundRepeat: "no-repeat",
            opacity: 0.96,
          }}
        />
        <Suspense fallback={null}>
          <div className="relative z-10">
            <TrailScreen />
          </div>
        </Suspense>
      </div>
    </>
  );
}

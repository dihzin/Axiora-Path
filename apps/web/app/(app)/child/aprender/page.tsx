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
      {/* Override html background so the scrollbar-gutter doesn't show #18312e */}
      <style>{`html { background-color: #2d5e2a !important; scrollbar-gutter: auto !important; } body { scrollbar-gutter: auto !important; }`}</style>
      <AxioraCognitiveField />
      <div className="relative z-10 min-h-screen overflow-x-hidden bg-transparent">
        <div
          aria-hidden
          className="pointer-events-none"
          style={{
            position: "fixed",
            top: 0,
            left: "-10px",
            width: "calc(100vw + 30px)",
            height: "100vh",
            zIndex: 0,
            backgroundImage: "url('/axiora/aprender/trail-bg-clean-4k.png')",
            backgroundPosition: "center top",
            backgroundSize: "cover",
            backgroundRepeat: "no-repeat",
            opacity: 0.98,
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

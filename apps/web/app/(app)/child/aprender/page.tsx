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
      <div className="relative z-10 min-h-screen overflow-x-hidden bg-transparent lg:flex lg:h-screen lg:min-h-0 lg:min-w-0 lg:flex-col">
        {/* Wallpaper — slightly desaturated so UI elements stand out */}
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
            opacity: 0.62,
            filter: "saturate(0.65) brightness(0.90)",
          }}
        />
        {/* Scrim — dark veil between wallpaper and content for visual hierarchy */}
        <div
          aria-hidden
          className="pointer-events-none"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1,
            background:
              "rgba(4,10,24,0.34)",
          }}
        />
        <Suspense fallback={null}>
          <div className="relative z-10 lg:flex lg:min-h-0 lg:min-w-0 lg:flex-1 lg:flex-col">
            <TrailScreen />
          </div>
        </Suspense>
      </div>
    </>
  );
}

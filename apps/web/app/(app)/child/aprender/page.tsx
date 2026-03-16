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
          <div className="relative z-10 lg:flex lg:min-h-0 lg:min-w-0 lg:flex-1 lg:flex-col">
            <TrailScreen />
          </div>
        </Suspense>
      </div>
    </>
  );
}

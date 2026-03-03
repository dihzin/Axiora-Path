"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

import { TrailScreen } from "@/components/trail/TrailScreen";

const AxioraNeuralField = dynamic(() => import("@/components/ui/AxioraNeuralField"), {
  ssr: false,
});

export default function LearningPathPage() {
  return (
    <>
      <AxioraNeuralField />
      <Suspense fallback={null}>
        <TrailScreen />
      </Suspense>
    </>
  );
}

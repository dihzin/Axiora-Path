import { Suspense } from "react";

import { TrailScreen } from "@/components/trail/TrailScreen";

export default function AprenderRedesignPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-white/20 border-t-white/80" aria-label="Carregando..." />
      </div>
    }>
      <TrailScreen />
    </Suspense>
  );
}

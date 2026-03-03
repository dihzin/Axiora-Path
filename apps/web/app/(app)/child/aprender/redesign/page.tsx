import { Suspense } from "react";

import { TrailScreen } from "@/components/trail/TrailScreen";

export default function AprenderRedesignPage() {
  return (
    <Suspense fallback={null}>
      <TrailScreen />
    </Suspense>
  );
}

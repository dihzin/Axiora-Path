"use client";

import { useEffect } from "react";
import { track } from "@/lib/tools/analytics";

/** Dispara `page_view` uma única vez quando a landing /tools é montada. */
export function ToolsPageTracker() {
  useEffect(() => {
    track("page_view");
  }, []);
  return null;
}

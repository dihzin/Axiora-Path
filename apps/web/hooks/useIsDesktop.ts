"use client";

import { useEffect, useState } from "react";

const DESKTOP_BREAKPOINT = 1024; // matches Tailwind `lg`

export function useIsDesktop(): boolean {
  // Start false to avoid SSR/hydration mismatch; corrected before first paint via useEffect
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT}px)`);
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return isDesktop;
}

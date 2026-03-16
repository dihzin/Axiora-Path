"use client";

import { useLayoutEffect, useState } from "react";

const DESKTOP_BREAKPOINT = 1024; // matches Tailwind `lg`

export function useIsDesktop(): boolean {
  // Start false to avoid SSR/hydration mismatch (server always renders false).
  // useLayoutEffect fires synchronously after DOM mutation and before the browser
  // paints, so desktop users never see the mobile layout flash.
  const [isDesktop, setIsDesktop] = useState(false);

  useLayoutEffect(() => {
    const mq = window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT}px)`);

    let frameId: number | null = null;
    let settleFrameId: number | null = null;
    let settleFrames = 0;
    let stableCount = 0;
    let lastValue: boolean | null = null;

    const syncDesktopState = () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        setIsDesktop(mq.matches);
      });
    };

    // Immediate on mount — avoids mobile→desktop flash on first paint.
    setIsDesktop(mq.matches);

    const handleMediaChange = () => syncDesktopState();
    const handleResize = () => syncDesktopState();

    mq.addEventListener("change", handleMediaChange);
    window.addEventListener("resize", handleResize);
    window.visualViewport?.addEventListener("resize", handleResize);

    // Some monitor/DPI transitions report an unstable viewport for a few frames
    // on first paint. Re-check for a short RAF window without using timeouts.
    const settle = () => {
      settleFrames += 1;
      const current = mq.matches;
      if (lastValue === current) {
        stableCount += 1;
      } else {
        stableCount = 0;
      }
      lastValue = current;
      setIsDesktop((prev) => (prev === current ? prev : current));

      if (stableCount >= 2 || settleFrames >= 20) {
        settleFrameId = null;
        return;
      }
      settleFrameId = window.requestAnimationFrame(settle);
    };
    settleFrameId = window.requestAnimationFrame(settle);

    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      if (settleFrameId !== null) window.cancelAnimationFrame(settleFrameId);
      mq.removeEventListener("change", handleMediaChange);
      window.removeEventListener("resize", handleResize);
      window.visualViewport?.removeEventListener("resize", handleResize);
    };
  }, []);

  return isDesktop;
}

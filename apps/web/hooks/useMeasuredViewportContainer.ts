"use client";

import { RefObject, useEffect, useState } from "react";

type MeasuredViewportSize = {
  width: number;
  height: number;
};

type UseMeasuredViewportContainerOptions = {
  initialWidth?: number;
  initialHeight?: number;
  minWidth?: number;
  minHeight?: number;
};

export function useMeasuredViewportContainer<T extends HTMLElement>(
  ref: RefObject<T | null>,
  options: UseMeasuredViewportContainerOptions = {},
): MeasuredViewportSize {
  const {
    initialWidth = 320,
    initialHeight = 700,
    minWidth = 320,
    minHeight = 1,
  } = options;

  const [size, setSize] = useState<MeasuredViewportSize>({
    width: Math.max(minWidth, Math.round(initialWidth)),
    height: Math.max(minHeight, Math.round(initialHeight)),
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    let frameId: number | null = null;
    let attachProbeFrameId: number | null = null;
    let observedElement: T | null = null;

    const commitSize = (rawWidth: number, rawHeight: number) => {
      const nextWidth = Math.max(minWidth, Math.round(rawWidth));
      const nextHeight = Math.max(minHeight, Math.round(rawHeight));
      setSize((prev) => {
        if (prev.width === nextWidth && prev.height === nextHeight) return prev;
        return { width: nextWidth, height: nextHeight };
      });
    };

    const readFromRect = () => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return;
      commitSize(rect.width, rect.height);
    };

    const scheduleRectRead = () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        readFromRect();
      });
    };

    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) {
          scheduleRectRead();
          return;
        }
        commitSize(entry.contentRect.width, entry.contentRect.height);
      });

    const attachIfNeeded = () => {
      const el = ref.current;
      if (!observer || !el || observedElement === el) return Boolean(el);
      if (observedElement) observer.unobserve(observedElement);
      observedElement = el;
      observer.observe(el);
      readFromRect();
      return true;
    };

    const probeForElement = () => {
      if (attachIfNeeded()) {
        attachProbeFrameId = null;
        return;
      }
      attachProbeFrameId = window.requestAnimationFrame(probeForElement);
    };

    if (!attachIfNeeded()) {
      attachProbeFrameId = window.requestAnimationFrame(probeForElement);
    } else {
      readFromRect();
    }

    window.addEventListener("resize", scheduleRectRead);

    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      if (attachProbeFrameId !== null) window.cancelAnimationFrame(attachProbeFrameId);
      if (observer && observedElement) observer.unobserve(observedElement);
      observer?.disconnect();
      window.removeEventListener("resize", scheduleRectRead);
    };
  }, [ref, minHeight, minWidth]);

  return size;
}

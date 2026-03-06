"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type UseSpringParams = {
  target: number;
  stiffness: number;
  damping: number;
  mass: number;
  onFrame?: (context: { dt: number; value: number; target: number; velocity: number }) => boolean | void;
};

const STOP_EPSILON = 0.001;

export function useSpring({ target, stiffness, damping, mass, onFrame }: UseSpringParams) {
  const [value, setValue] = useState(target);
  const valueRef = useRef(target);
  const velocityRef = useRef(0);
  const targetRef = useRef(target);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  const loop = useCallback((now: number) => {
    if (lastTimeRef.current === null) {
      lastTimeRef.current = now;
    }

    const rawDt = (now - lastTimeRef.current) / 1000;
    const dt = Math.min(Math.max(rawDt, 0), 0.032);
    lastTimeRef.current = now;

    const displacement = valueRef.current - targetRef.current;
    const springForce = -stiffness * displacement;
    const dampingForce = -damping * velocityRef.current;
    const acceleration = (springForce + dampingForce) / mass;

    velocityRef.current += acceleration * dt;
    valueRef.current += velocityRef.current * dt;

    const keepAlive = onFrame?.({
      dt,
      value: valueRef.current,
      target: targetRef.current,
      velocity: velocityRef.current,
    });

    const closeEnough =
      !keepAlive && Math.abs(velocityRef.current) < STOP_EPSILON && Math.abs(targetRef.current - valueRef.current) < STOP_EPSILON;

    if (closeEnough) {
      valueRef.current = targetRef.current;
      velocityRef.current = 0;
      setValue(targetRef.current);
      rafRef.current = null;
      lastTimeRef.current = null;
      return;
    }

    setValue(valueRef.current);
    rafRef.current = window.requestAnimationFrame(loop);
  }, [damping, mass, onFrame, stiffness]);

  const startLoop = useCallback(() => {
    if (rafRef.current !== null) return;
    lastTimeRef.current = null;
    rafRef.current = window.requestAnimationFrame(loop);
  }, [loop]);

  const setTarget = useCallback(
    (nextTarget: number) => {
      targetRef.current = nextTarget;
      startLoop();
    },
    [startLoop],
  );

  useEffect(() => {
    setTarget(target);
  }, [setTarget, target]);

  const nudge = useCallback(() => {
    startLoop();
  }, [startLoop]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  return { value, setTarget, nudge };
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { TugOfWarEvent } from "../useTugOfWarEngine";
import { useSpring } from "./useSpring";

type RopePhysicsParams = {
  ropePos: number;
  lastEvent: TugOfWarEvent;
  intensity?: number;
};

type RopePhysicsState = {
  centerX: number;
  tension: number;
  sag: number;
  wavePhase: number;
  shake: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function useRopePhysics({ ropePos, lastEvent, intensity = 1 }: RopePhysicsParams): RopePhysicsState {
  const sagOffsetRef = useRef(0);
  const waveAmplitudeRef = useRef(0);
  const shakeAmplitudeRef = useRef(0);
  const phaseRef = useRef(0);
  const frequencyRef = useRef(11);

  const [sag, setSag] = useState(18);
  const [wavePhase, setWavePhase] = useState(0);
  const [shake, setShake] = useState(0);

  const [centerXSnapshot, setCenterXSnapshot] = useState(ropePos);

  const { value: centerX, setTarget, nudge } = useSpring({
    target: ropePos,
    stiffness: 115,
    damping: 16,
    mass: 1,
    onFrame: ({ dt, value }) => {
      setCenterXSnapshot(value);

      phaseRef.current += frequencyRef.current * dt;
      frequencyRef.current = lerp(frequencyRef.current, 11, 0.12);

      const sagDecay = Math.exp(-8 * dt);
      const waveDecay = Math.exp(-6 * dt);
      const shakeDecay = Math.exp(-14 * dt);

      sagOffsetRef.current *= sagDecay;
      waveAmplitudeRef.current *= waveDecay;
      shakeAmplitudeRef.current *= shakeDecay;

      const liveTension = clamp(Math.abs(value - 0.5) * 2, 0, 1);
      const baseSag = lerp(22, 6, liveTension);
      const waveSagOffset = Math.sin(phaseRef.current) * waveAmplitudeRef.current * 0.12;
      const nextSag = clamp(baseSag + sagOffsetRef.current + waveSagOffset, 4, 26);
      const nextShake = shakeAmplitudeRef.current;

      setSag(nextSag);
      setWavePhase(phaseRef.current);
      setShake(nextShake);

      return Math.abs(sagOffsetRef.current) > 0.01 || waveAmplitudeRef.current > 0.01 || shakeAmplitudeRef.current > 0.01;
    },
  });

  useEffect(() => {
    setTarget(ropePos);
  }, [ropePos, setTarget]);

  useEffect(() => {
    if (lastEvent === "idle") return;

    const impulse = Math.max(0.5, intensity);
    if (lastEvent === "p1_correct" || lastEvent === "p2_correct") {
      sagOffsetRef.current -= 4 * impulse;
      waveAmplitudeRef.current += 8 * impulse;
      frequencyRef.current = 12;
      return;
    }

    sagOffsetRef.current += 6 * impulse;
    waveAmplitudeRef.current += 5 * impulse;
    shakeAmplitudeRef.current += 10 * impulse;
    frequencyRef.current = 19;
    nudge();
  }, [intensity, lastEvent, nudge]);

  const tension = useMemo(() => clamp(Math.abs(centerXSnapshot - 0.5) * 2, 0, 1), [centerXSnapshot]);

  return {
    centerX,
    tension,
    sag,
    wavePhase,
    shake,
  };
}

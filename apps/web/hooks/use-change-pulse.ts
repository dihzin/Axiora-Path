import { useEffect, useRef, useState } from "react";

export function useChangePulse(value: string | number, duration = 550): boolean {
  const [pulsing, setPulsing] = useState(false);
  const prevRef = useRef<string | number>(value);

  useEffect(() => {
    if (prevRef.current === value) return;
    prevRef.current = value;
    setPulsing(true);
    const timeoutId = window.setTimeout(() => setPulsing(false), duration);
    return () => window.clearTimeout(timeoutId);
  }, [duration, value]);

  return pulsing;
}


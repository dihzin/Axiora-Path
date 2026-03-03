export const AxioraMotion = {
  easing: {
    "axiora-ease-soft": "cubic-bezier(0.22, 1, 0.36, 1)",
    "axiora-ease-magic": "cubic-bezier(0.34, 1.56, 0.64, 1)",
  },
  duration: {
    fast: "120ms",
    base: "180ms",
    slow: "280ms",
    breathing: "4s",
  },
  breathing: {
    keyframe: {
      "0%": { transform: "scale(1)" },
      "50%": { transform: "scale(1.015)" },
      "100%": { transform: "scale(1)" },
    },
    duration: "4s",
    easing: "ease-in-out",
    iterationCount: "infinite",
  },
} as const;

export const AXIORA_MOTION = {
  hoverScale: 1.02,
  clickScale: 0.97,
  durationMs: 180,
  easing: AxioraMotion.easing["axiora-ease-soft"],
} as const;

export const axioraMotionClasses = {
  transition: `transition-transform duration-[${AxioraMotion.duration.base}] [transition-timing-function:cubic-bezier(0.22,1,0.36,1)]`,
  hoverScale: "hover:scale-[1.02]",
  clickScale: "active:scale-[0.97]",
  interactive: `transition-transform duration-[${AxioraMotion.duration.base}] [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.02] active:scale-[0.97]`,
} as const;

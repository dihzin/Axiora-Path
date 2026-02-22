import type { CSSProperties } from "react";

export const PATH_TOKENS = {
  spacing: 8,
  radius: {
    card: 24,
    pill: 9999,
    modal: 24,
  },
  touch: {
    min: 48,
  },
  motion: {
    ui: 180,
    celebration: 600,
  },
  shadow: {
    level1: "0 2px 8px rgba(0,0,0,0.08)",
  },
  colors: {
    primary: "#FF6B3D",
    secondary: "#0EA5A4",
    accent: "#FFC857",
    success: "#4DD9C0",
    muted: "#9FB0CA",
    ink: "#1A2D4A",
    surface: "#FFFFFF",
    surfaceAlt: "#F5F8FD",
    pathSurface: "#E9EEF5",
    lock: "#CBD5E1",
  },
} as const;

export const PATH_CSS_VARS: CSSProperties = {
  ["--path-space-1" as string]: `${PATH_TOKENS.spacing}px`,
  ["--path-space-2" as string]: `${PATH_TOKENS.spacing * 2}px`,
  ["--path-space-3" as string]: `${PATH_TOKENS.spacing * 3}px`,
  ["--path-space-4" as string]: `${PATH_TOKENS.spacing * 4}px`,
  ["--path-radius-card" as string]: `${PATH_TOKENS.radius.card}px`,
  ["--path-radius-pill" as string]: `${PATH_TOKENS.radius.pill}px`,
  ["--path-radius-modal" as string]: `${PATH_TOKENS.radius.modal}px`,
  ["--path-touch" as string]: `${PATH_TOKENS.touch.min}px`,
  ["--path-motion-ui" as string]: `${PATH_TOKENS.motion.ui}ms`,
  ["--path-motion-celebration" as string]: `${PATH_TOKENS.motion.celebration}ms`,
  ["--path-shadow-1" as string]: PATH_TOKENS.shadow.level1,
  ["--path-primary" as string]: PATH_TOKENS.colors.primary,
  ["--path-secondary" as string]: PATH_TOKENS.colors.secondary,
  ["--path-accent" as string]: PATH_TOKENS.colors.accent,
  ["--path-success" as string]: PATH_TOKENS.colors.success,
  ["--path-muted" as string]: PATH_TOKENS.colors.muted,
  ["--path-ink" as string]: PATH_TOKENS.colors.ink,
  ["--path-surface" as string]: PATH_TOKENS.colors.surface,
  ["--path-surface-alt" as string]: PATH_TOKENS.colors.surfaceAlt,
  ["--path-surface-track" as string]: PATH_TOKENS.colors.pathSurface,
  ["--path-lock" as string]: PATH_TOKENS.colors.lock,
};

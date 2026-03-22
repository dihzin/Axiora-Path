export const AxioraTheme = {
  colors: {
    "axiora-bg-deep": "#071427",
    "axiora-bg-mid": "#0D1F3A",
    "axiora-bg-soft": "#172E52",
    "axiora-surface-glass": "rgba(255,255,255,0.72)",
    "axiora-surface-glass-strong": "rgba(255,255,255,0.84)",
    "axiora-surface-contrast": "rgba(248,250,252,0.72)",
    "axiora-text-primary": "#0F172A",
    "axiora-text-secondary": "#475569",
    "axiora-accent": "#FB923C",
    "axiora-accent-soft": "#FFEDD5",
    "axiora-line-soft": "rgba(148,163,184,0.26)",
  },
  gradients: {
    "core-canvas":
      "radial-gradient(1200px 540px at 8% -12%, rgba(56,189,248,0.10), transparent 60%), radial-gradient(980px 520px at 92% -10%, rgba(251,146,60,0.12), transparent 58%), linear-gradient(180deg, rgba(241,245,249,0.92) 0%, rgba(226,236,250,0.84) 100%)",
    "surface-glass": "linear-gradient(160deg, rgba(255,255,255,0.84) 0%, rgba(255,255,255,0.72) 100%)",
    "accent-glow": "radial-gradient(circle, rgba(251,146,60,0.14) 0%, transparent 70%)",
  },
  radius: {
    sm: "12px",
    md: "16px",
    lg: "20px",
    xl: "24px",
  },
  spacing: {
    base: 4,
    scale: {
      0: "0px",
      1: "4px",
      2: "8px",
      3: "12px",
      4: "16px",
      5: "20px",
      6: "24px",
      7: "32px",
      8: "40px",
      9: "48px",
    },
  },
  depth: {
    "axiora-shadow-soft": "0 8px 22px rgba(15, 23, 42, 0.10)",
    "axiora-shadow-soft-lg": "0 14px 30px rgba(15, 23, 42, 0.13)",
  },
} as const;

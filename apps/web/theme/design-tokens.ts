export const AxioraTheme = {
  colors: {
    "axiora-bg-base": "#FFF6F2",
    "axiora-bg-soft": "#FFEDE5",
    "axiora-energy": "#FF6B3D",
    "axiora-energy-soft": "#FF8A63",
    "axiora-text-primary": "#1E1E1E",
    "axiora-text-secondary": "#5C5C5C",
    "axiora-accent-deep": "#2B2F42",
  },
  gradients: {
    "energy-gradient": "linear-gradient(135deg, #FF6B3D 0%, #FF8A63 100%)",
    "soft-glow": "radial-gradient(circle, rgba(255,107,61,0.15) 0%, transparent 70%)",
  },
  radius: {
    xs: "8px",
    sm: "14px",
    md: "22px",
    "organic-lg": "38px 18px 32px 24px",
  },
  spacing: {
    base: 8,
    scale: {
      0: "0px",
      1: "8px",
      2: "16px",
      3: "24px",
      4: "32px",
      5: "40px",
      6: "48px",
      7: "56px",
      8: "64px",
    },
  },
  depth: {
    "axiora-shadow-xs": "2px 2px 4px rgba(43, 47, 66, 0.06)",
    "axiora-shadow-sm": "4px 4px 10px rgba(43, 47, 66, 0.08)",
    "axiora-shadow-md": "8px 8px 20px rgba(43, 47, 66, 0.10)",
    "axiora-shadow-lg": "14px 14px 32px rgba(43, 47, 66, 0.14)",
  },
} as const;

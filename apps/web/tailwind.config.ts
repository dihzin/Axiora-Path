import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-ui)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-ui)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        border: "#D7D2C7",
        input: "#D8D3C9",
        ring: "#FF7A2F",
        background: "#F6F2EA",
        foreground: "#2E3A35",
        primary: {
          DEFAULT: "#FF7A2F",
          foreground: "#FFFFFF",
        },
        secondary: {
          DEFAULT: "#FFB170",
          foreground: "#3A2617",
        },
        accent: {
          DEFAULT: "#F1C56B",
          foreground: "#2B1C05",
        },
        muted: {
          DEFAULT: "#ECE4D8",
          foreground: "#5C685F",
        },
        destructive: {
          DEFAULT: "#FF4B4B",
          foreground: "#FFFFFF",
        },
        card: {
          DEFAULT: "#FFF9F1",
          foreground: "#2E3A35",
        },
        brand: {
          green: "#E98B4F",
          teal: "#FFB170",
          blue: "#D98E59",
          gold: "#F1C56B",
          dark: "#6F4A33",
        },
        medieval: {
          parchment:      "#FDF5E6",
          "parchment-dark": "#FAEBD7",
          "parchment-deep": "#F0DEC0",
          wood:           "#5C4033",
          "wood-dark":    "#3E2723",
          "wood-medium":  "#6D4C41",
          gold:           "#FFB703",
          "magic-blue":   "#48CAE4",
          "magic-green":  "#52B788",
          amber:          "#FB8C00",
          ink:            "#2C1E16",
          "ink-soft":     "#5C4A3A",
        },
      },
      keyframes: {
        "pop-in": {
          "0%": { transform: "scale(0.5)", opacity: "0" },
          "70%": { transform: "scale(1.15)" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(1)", opacity: "0.4" },
          "100%": { transform: "scale(1.6)", opacity: "0" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%":       { transform: "translateY(-6px)" },
        },
        "rune-glow": {
          "0%, 100%": { boxShadow: "0 0 10px rgba(255,183,3,0.35), 0 0 22px rgba(255,183,3,0.18)" },
          "50%":       { boxShadow: "0 0 20px rgba(255,183,3,0.6),  0 0 40px rgba(255,183,3,0.32)" },
        },
      },
      animation: {
        "pop-in":    "pop-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both",
        "pulse-ring":"pulse-ring 1.2s ease-out infinite",
        float:       "float 3s ease-in-out infinite",
        "rune-glow": "rune-glow 2.4s ease-in-out infinite",
      },
      boxShadow: {
        xs: "2px 2px 4px rgba(43, 47, 66, 0.06)",
        sm: "4px 4px 10px rgba(43, 47, 66, 0.08)",
        md: "8px 8px 20px rgba(43, 47, 66, 0.10)",
        lg: "14px 14px 32px rgba(43, 47, 66, 0.14)",
      },
      transitionDuration: {
        180: "180ms",
        280: "280ms",
      },
    },
  },
  plugins: [],
};

export default config;

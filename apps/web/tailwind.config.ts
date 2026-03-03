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
        border: "#CFD9F3",
        input: "#C8D4F0",
        ring: "#0EA5A4",
        background: "#F5F9FF",
        foreground: "#1A2D4A",
        primary: {
          DEFAULT: "#FF6B3D",
          foreground: "#FFFFFF",
        },
        secondary: {
          DEFAULT: "#0EA5A4",
          foreground: "#FFFFFF",
        },
        accent: {
          DEFAULT: "#FFC857",
          foreground: "#1F1300",
        },
        muted: {
          DEFAULT: "#EAF1FF",
          foreground: "#34507A",
        },
        destructive: {
          DEFAULT: "#FF4B4B",
          foreground: "#FFFFFF",
        },
        card: {
          DEFAULT: "#FFFFFF",
          foreground: "#1A2D4A",
        },
        brand: {
          green: "#58CC02",
          teal: "#4DD9AC",
          blue: "#1CB0F6",
          gold: "#FFD700",
          dark: "#3A9A00",
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
      },
      animation: {
        "pop-in": "pop-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both",
        "pulse-ring": "pulse-ring 1.2s ease-out infinite",
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

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
      },
    },
  },
  plugins: [],
};

export default config;

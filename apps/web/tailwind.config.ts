import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        border: "#DCE2E6",
        input: "#DCE2E6",
        ring: "#2F5D50",
        background: "#FFFFFF",
        foreground: "#1E2A38",
        primary: {
          DEFAULT: "#1E2A38",
          foreground: "#FFFFFF",
        },
        secondary: {
          DEFAULT: "#2F5D50",
          foreground: "#FFFFFF",
        },
        accent: {
          DEFAULT: "#D6A756",
          foreground: "#1E2A38",
        },
        muted: {
          DEFAULT: "#F4F6F8",
          foreground: "#2A3A4C",
        },
        destructive: {
          DEFAULT: "#C04444",
          foreground: "#FFFFFF",
        },
        card: {
          DEFAULT: "#FFFFFF",
          foreground: "#1E2A38",
        },
      },
    },
  },
  plugins: [],
};

export default config;

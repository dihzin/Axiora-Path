"use client";

import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";

import type { ThemeName } from "@/lib/api/client";
import { isThemeName, THEMES, THEME_STORAGE_KEY } from "@/lib/theme";

type ThemeContextValue = {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(theme: ThemeName): void {
  const root = document.documentElement;
  const selected = THEMES[theme];
  root.style.setProperty("--primary", selected.primary);
  root.style.setProperty("--secondary", selected.secondary);
  root.style.setProperty("--accent", selected.accent);
  root.style.setProperty("--theme-background-gradient", selected.backgroundGradient);
}

type ThemeProviderProps = {
  children: ReactNode;
};

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<ThemeName>("default");

  useEffect(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved && isThemeName(saved)) {
      setThemeState(saved);
      applyTheme(saved);
      return;
    }
    applyTheme("default");
  }, []);

  const setTheme = (nextTheme: ThemeName) => {
    setThemeState(nextTheme);
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    applyTheme(nextTheme);
  };

  const value = useMemo<ThemeContextValue>(() => ({ theme, setTheme }), [theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (context === null) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}

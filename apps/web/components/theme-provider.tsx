"use client";

import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";

import type { ThemeName } from "@/lib/api/client";
import { isThemeName, THEME_LIST, THEMES, THEME_STORAGE_KEY } from "@/lib/theme";

type ThemeContextValue = {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(theme: ThemeName): void {
  const root = document.documentElement;
  const body = document.body;
  const definition = THEMES[theme];
  const themeClassNames = THEME_LIST.map((name) => `theme-${name}`);
  const currentThemeClass = `theme-${theme}`;

  root.classList.remove(...themeClassNames);
  body.classList.remove(...themeClassNames);
  root.classList.add(currentThemeClass);
  body.classList.add(currentThemeClass);
  root.dataset.theme = theme;
  root.style.setProperty("--theme-primary-rgb", definition.primary);
  root.style.setProperty("--theme-secondary-rgb", definition.secondary);
  root.style.setProperty("--theme-accent-rgb", definition.accent);
  root.style.setProperty("--app-bg-gradient", "none");
  root.style.setProperty("--app-bg-color", "rgb(246 246 243)");
  root.style.setProperty("--app-fg-color", "rgb(30 42 56)");
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
    }
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = (nextTheme: ThemeName) => {
    setThemeState(nextTheme);
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
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

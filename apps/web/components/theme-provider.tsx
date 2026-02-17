"use client";

import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";

import type { ThemeName } from "@/lib/api/client";
import { isThemeName, THEME_LIST, THEME_STORAGE_KEY } from "@/lib/theme";

type ThemeContextValue = {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(theme: ThemeName): void {
  const root = document.documentElement;
  const body = document.body;
  const themeClassNames = THEME_LIST.map((name) => `theme-${name}`);
  const currentThemeClass = `theme-${theme}`;

  root.classList.remove(...themeClassNames);
  body.classList.remove(...themeClassNames);
  root.classList.add(currentThemeClass);
  body.classList.add(currentThemeClass);
  root.dataset.theme = theme;
}

type ThemeProviderProps = {
  children: ReactNode;
};

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<ThemeName>(() => {
    if (typeof window === "undefined") return "default";
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return saved && isThemeName(saved) ? saved : "default";
  });

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

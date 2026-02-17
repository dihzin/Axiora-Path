import type { ThemeName } from "@/lib/api/client";

export type ThemeDefinition = {
  primary: string;
  secondary: string;
  accent: string;
  backgroundGradient: string;
  soundKey?: string;
};

export const THEME_STORAGE_KEY = "axiora_theme";

export const THEME_LIST: ThemeName[] = ["default", "space", "jungle", "ocean", "soccer", "capybara", "dinos", "princess", "heroes"];

export const THEMES: Record<ThemeName, ThemeDefinition> = {
  default: {
    primary: "15 23 42",
    secondary: "241 245 249",
    accent: "37 99 235",
    backgroundGradient: "linear-gradient(160deg, #f8fafc 0%, #e2e8f0 100%)",
  },
  space: {
    primary: "30 27 75",
    secondary: "224 231 255",
    accent: "129 140 248",
    backgroundGradient: "linear-gradient(160deg, #0b1024 0%, #1e1b4b 55%, #312e81 100%)",
    soundKey: "space_blip",
  },
  jungle: {
    primary: "20 83 45",
    secondary: "220 252 231",
    accent: "22 163 74",
    backgroundGradient: "linear-gradient(160deg, #052e16 0%, #14532d 55%, #166534 100%)",
    soundKey: "jungle_bird",
  },
  ocean: {
    primary: "8 47 73",
    secondary: "207 250 254",
    accent: "6 182 212",
    backgroundGradient: "linear-gradient(160deg, #082f49 0%, #0e7490 55%, #155e75 100%)",
    soundKey: "ocean_wave",
  },
  soccer: {
    primary: "22 101 52",
    secondary: "220 252 231",
    accent: "250 204 21",
    backgroundGradient: "linear-gradient(160deg, #14532d 0%, #15803d 50%, #166534 100%)",
    soundKey: "stadium_whistle",
  },
  capybara: {
    primary: "120 53 15",
    secondary: "254 215 170",
    accent: "217 119 6",
    backgroundGradient: "linear-gradient(160deg, #431407 0%, #9a3412 55%, #c2410c 100%)",
    soundKey: "capybara_plop",
  },
  dinos: {
    primary: "61 92 24",
    secondary: "236 252 203",
    accent: "132 204 22",
    backgroundGradient: "linear-gradient(160deg, #1a2e05 0%, #3f6212 50%, #4d7c0f 100%)",
    soundKey: "dino_stomp",
  },
  princess: {
    primary: "131 24 67",
    secondary: "252 231 243",
    accent: "236 72 153",
    backgroundGradient: "linear-gradient(160deg, #500724 0%, #9d174d 50%, #be185d 100%)",
    soundKey: "chime_sparkle",
  },
  heroes: {
    primary: "127 29 29",
    secondary: "254 226 226",
    accent: "220 38 38",
    backgroundGradient: "linear-gradient(160deg, #450a0a 0%, #991b1b 55%, #b91c1c 100%)",
    soundKey: "hero_fanfare",
  },
};

export function isThemeName(value: string): value is ThemeName {
  return THEME_LIST.includes(value as ThemeName);
}

"use client";

import { getUserUXSettings, upsertUserUXSettings, type UserUXSettings } from "@/lib/api/client";

export const UX_SETTINGS_FALLBACK: UserUXSettings = {
  id: 0,
  userId: 0,
  soundEnabled: true,
  hapticsEnabled: true,
  reducedMotion: false,
  createdAt: "",
  updatedAt: "",
};

const UX_LOCAL_KEY = "axiora_ux_settings_v1";
const audioCache = new Map<string, HTMLAudioElement>();

export function systemPrefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function effectiveReducedMotion(settings: UserUXSettings | null): boolean {
  return Boolean(settings?.reducedMotion) || systemPrefersReducedMotion();
}

export function loadCachedUXSettings(): UserUXSettings | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(UX_LOCAL_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserUXSettings;
  } catch {
    return null;
  }
}

export function cacheUXSettings(settings: UserUXSettings): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(UX_LOCAL_KEY, JSON.stringify(settings));
}

export async function fetchUXSettings(): Promise<UserUXSettings> {
  try {
    const row = await getUserUXSettings();
    cacheUXSettings(row);
    return row;
  } catch {
    return loadCachedUXSettings() ?? UX_SETTINGS_FALLBACK;
  }
}

export async function saveUXSettings(payload: {
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  reducedMotion: boolean;
}): Promise<UserUXSettings> {
  const row = await upsertUserUXSettings(payload);
  cacheUXSettings(row);
  return row;
}

export function playSfx(path: string, enabled: boolean): void {
  if (!enabled || typeof window === "undefined") return;
  let audio = audioCache.get(path);
  if (!audio) {
    audio = new Audio(path);
    audio.preload = "auto";
    audio.volume = 0.35;
    audioCache.set(path, audio);
  }
  audio.currentTime = 0;
  void audio.play().catch(() => undefined);
}

export function hapticPress(settings: UserUXSettings | null): void {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  if (!settings?.hapticsEnabled || effectiveReducedMotion(settings)) return;
  navigator.vibrate(10);
}

export function hapticCompletion(settings: UserUXSettings | null): void {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  if (!settings?.hapticsEnabled || effectiveReducedMotion(settings)) return;
  navigator.vibrate(20);
}

export function hapticLevelUp(settings: UserUXSettings | null): void {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  if (!settings?.hapticsEnabled || effectiveReducedMotion(settings)) return;
  navigator.vibrate([10, 20, 10]);
}

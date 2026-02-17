"use client";

import type { ThemeName } from "@/lib/api/client";
import { THEMES } from "@/lib/theme";

type SoundEvent = "task_approved" | "streak_milestone" | "level_up";

const SOUND_PREF_KEY_PREFIX = "axiora_sound_enabled_";
const DEFAULT_SOUND_ENABLED = true;

let sharedAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined" || !window.AudioContext) return null;
  if (sharedAudioContext === null || sharedAudioContext.state === "closed") {
    sharedAudioContext = new window.AudioContext();
  }
  return sharedAudioContext;
}

function getPreferenceKey(childId: number): string {
  return `${SOUND_PREF_KEY_PREFIX}${childId}`;
}

function getThemeOffset(theme: ThemeName): number {
  const key = THEMES[theme].soundKey;
  if (!key) return 0;
  let hash = 0;
  for (const char of key) {
    hash += char.charCodeAt(0);
  }
  return (hash % 7) * 12;
}

function playSequence(frequencies: number[], durationMs: number): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const startAt = ctx.currentTime;
  const noteDuration = durationMs / 1000;

  frequencies.forEach((frequency, index) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const starts = startAt + index * noteDuration;
    const ends = starts + noteDuration;

    osc.type = "triangle";
    osc.frequency.setValueAtTime(frequency, starts);
    gain.gain.setValueAtTime(0.0001, starts);
    gain.gain.exponentialRampToValueAtTime(0.03, starts + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ends);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(starts);
    osc.stop(ends);
  });
}

export function getSoundEnabled(childId: number): boolean {
  if (typeof window === "undefined") return DEFAULT_SOUND_ENABLED;
  const raw = localStorage.getItem(getPreferenceKey(childId));
  if (raw === null) return DEFAULT_SOUND_ENABLED;
  return raw === "1";
}

export function setSoundEnabled(childId: number, enabled: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(getPreferenceKey(childId), enabled ? "1" : "0");
}

export function playSound(event: SoundEvent, options: { childId: number; theme: ThemeName }): void {
  const { childId, theme } = options;
  if (!getSoundEnabled(childId)) return;

  const offset = getThemeOffset(theme);
  if (event === "task_approved") {
    playSequence([740 + offset, 920 + offset], 0.06 * 1000);
    return;
  }
  if (event === "streak_milestone") {
    playSequence([520 + offset, 660 + offset, 780 + offset], 0.07 * 1000);
    return;
  }
  playSequence([620 + offset, 840 + offset, 1040 + offset], 0.09 * 1000);
}

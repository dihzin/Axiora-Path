"use client";

export type AprenderEventName =
  | "path_loaded"
  | "subject_changed"
  | "lesson_opened"
  | "event_opened"
  | "path_scrolled_to_active"
  | "mode_changed"
  | "review_cta_clicked";

export type AprenderEventPayload = Record<string, string | number | boolean | null | undefined>;

type AprenderEventEntry = {
  name: AprenderEventName;
  payload: AprenderEventPayload;
  ts: number;
};

const STORAGE_KEY = "axiora_aprender_events";
const MAX_EVENTS = 300;

function getStoredEvents(): AprenderEventEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AprenderEventEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveEvents(events: AprenderEventEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
  } catch {
    // ignore quota/storage errors in client telemetry
  }
}

export function trackAprenderEvent(name: AprenderEventName, payload: AprenderEventPayload = {}): void {
  if (typeof window === "undefined") return;
  const entry: AprenderEventEntry = {
    name,
    payload,
    ts: Date.now(),
  };
  const next = [...getStoredEvents(), entry];
  saveEvents(next);
  window.dispatchEvent(new CustomEvent("axiora:aprender:analytics", { detail: entry }));
}


"use client";

/**
 * analytics.ts — Tracking central do Axiora Tools.
 *
 * Uso:
 *   import { track } from "@/lib/tools/analytics";
 *   track("generation_success", { consumption_type: "free", free_remaining: 2 });
 *
 * Destinos (configuráveis via env vars, todos opcionais):
 *   1. Console log em desenvolvimento
 *   2. localStorage buffer — mesmo padrão de lib/learning/analytics.ts
 *   3. PostHog via HTTP API — sem npm package (NEXT_PUBLIC_POSTHOG_KEY)
 *
 * Garantias:
 *   - Nunca lança exceção (analytics nunca quebra o app)
 *   - Fire-and-forget — não bloqueia o thread principal
 *   - SSR-safe (early return se window === undefined)
 */

import { ANON_ID_KEY } from "@/lib/identity";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type ToolsEventName =
  | "page_view"
  | "click_generate"
  | "generation_success"
  | "generation_blocked"
  | "paywall_view"
  | "paywall_click_buy"
  | "checkout_started"
  | "checkout_success"
  | "checkout_failed"
  | "return_after_payment";

export type ToolsEventPayload = Record<string, string | number | boolean | null | undefined>;

type EventEntry = {
  event: ToolsEventName;
  payload: ToolsEventPayload;
  anonymous_id: string;
  url: string;
  ts: number;
};

// ── Config ────────────────────────────────────────────────────────────────────

const STORAGE_KEY = "ax_tools_events";
const MAX_STORED = 200;
const IS_DEV = process.env.NODE_ENV === "development";
const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

// ── Identidade ────────────────────────────────────────────────────────────────

function getAnonId(): string {
  if (typeof window === "undefined") return "ssr";
  return window.localStorage.getItem(ANON_ID_KEY) ?? "anonymous";
}

// ── Buffer local ──────────────────────────────────────────────────────────────

function appendToBuffer(entry: EventEntry): void {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const current: EventEntry[] = raw ? (JSON.parse(raw) as EventEntry[]) : [];
    const next = [...current, entry].slice(-MAX_STORED);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // quota error — não bloqueia
  }
}

/** Retorna todos os eventos armazenados localmente (útil para debug). */
export function getStoredEvents(): EventEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as EventEntry[]) : [];
  } catch {
    return [];
  }
}

/** Limpa o buffer local (útil após um flush para o servidor). */
export function clearStoredEvents(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

// ── PostHog HTTP API (sem npm package) ───────────────────────────────────────

function sendToPostHog(entry: EventEntry): void {
  if (!POSTHOG_KEY) return;
  // Fire-and-forget — erros são silenciosos
  void fetch(`${POSTHOG_HOST}/capture/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: POSTHOG_KEY,
      event: entry.event,
      distinct_id: entry.anonymous_id,
      timestamp: new Date(entry.ts).toISOString(),
      properties: {
        ...entry.payload,
        $current_url: entry.url,
        $lib: "axiora-tools",
      },
    }),
    // keepalive: true mantém a request mesmo após navegação (ex: checkout redirect)
    keepalive: true,
  }).catch(() => {
    // silencioso — analytics nunca quebra o app
  });
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Dispara um evento de tracking.
 *
 * @example
 * track("generation_success", { consumption_type: "free", free_remaining: 2 });
 * track("paywall_view");
 * track("checkout_success", { credits_added: 30 });
 */
export function track(event: ToolsEventName, payload: ToolsEventPayload = {}): void {
  if (typeof window === "undefined") return; // SSR-safe

  const entry: EventEntry = {
    event,
    payload,
    anonymous_id: getAnonId(),
    url: window.location.href,
    ts: Date.now(),
  };

  // 1. Log em desenvolvimento
  if (IS_DEV) {
    console.debug(`[tools:analytics] ${entry.event}`, payload, `anon=${entry.anonymous_id}`);
  }

  // 2. Buffer local (mesmo padrão do learning analytics)
  appendToBuffer(entry);

  // 3. CustomEvent — permite listeners externos sem acoplamento
  window.dispatchEvent(new CustomEvent("axiora:tools:analytics", { detail: entry }));

  // 4. PostHog (se configurado) — via requestIdleCallback para não bloquear UI
  if (POSTHOG_KEY) {
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(() => sendToPostHog(entry));
    } else {
      setTimeout(() => sendToPostHog(entry), 0);
    }
  }
}

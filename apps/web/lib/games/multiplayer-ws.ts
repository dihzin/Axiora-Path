"use client";

import { getAccessToken, getTenantSlug } from "@/lib/api/session";

type WsHandlers = {
  onOpen?: () => void;
  onClose?: () => void;
  onError?: () => void;
  onState?: (payload: unknown) => void;
};

function resolveWsBase(): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    throw new Error("NEXT_PUBLIC_API_URL is not defined");
  }
  if (apiUrl.startsWith("https://")) return apiUrl.replace("https://", "wss://");
  if (apiUrl.startsWith("http://")) return apiUrl.replace("http://", "ws://");
  return apiUrl;
}

export function connectMultiplayerWs(sessionId: string, handlers: WsHandlers): WebSocket {
  const token = getAccessToken();
  const tenant = getTenantSlug();
  if (!token || !tenant) {
    throw new Error("Missing auth token or tenant slug");
  }
  const base = resolveWsBase();
  const query = new URLSearchParams({ token, tenant }).toString();
  const ws = new WebSocket(`${base}/api/games/multiplayer/ws/${sessionId}?${query}`);

  ws.onopen = () => handlers.onOpen?.();
  ws.onclose = () => handlers.onClose?.();
  ws.onerror = () => handlers.onError?.();
  ws.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data) as unknown;
      handlers.onState?.(payload);
    } catch {
      handlers.onError?.();
    }
  };
  return ws;
}

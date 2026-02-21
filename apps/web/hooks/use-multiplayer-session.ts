"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { getMultiplayerSession, type MultiplayerStateResponse } from "@/lib/api/client";
import { connectMultiplayerWs } from "@/lib/games/multiplayer-ws";

type UseMultiplayerSessionOptions = {
  sessionId: string | null;
  enabled: boolean;
};

export function useMultiplayerSession({ sessionId, enabled }: UseMultiplayerSessionOptions) {
  const [state, setState] = useState<MultiplayerStateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!enabled || !sessionId) return;
    let mounted = true;
    setLoading(true);
    getMultiplayerSession(sessionId)
      .then((payload) => {
        if (!mounted) return;
        setState(payload);
        setError(null);
      })
      .catch(() => {
        if (!mounted) return;
        setError("Não foi possível carregar a sessão.");
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [enabled, sessionId]);

  useEffect(() => {
    if (!enabled || !sessionId) return;
    try {
      wsRef.current?.close();
      wsRef.current = connectMultiplayerWs(sessionId, {
        onOpen: () => setIsRealtimeConnected(true),
        onClose: () => setIsRealtimeConnected(false),
        onError: () => {
          setIsRealtimeConnected(false);
        },
        onState: (payload) => {
          const next = payload as MultiplayerStateResponse;
          setState(next);
          setError(null);
        },
      });
    } catch {
      setIsRealtimeConnected(false);
    }
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [enabled, sessionId]);

  useEffect(() => {
    if (!enabled || !sessionId || isRealtimeConnected) return;
    const timer = window.setInterval(async () => {
      try {
        const latest = await getMultiplayerSession(sessionId);
        setState(latest);
      } catch {
        setError("Sem conexão ao vivo. Atualizando de forma limitada.");
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [enabled, isRealtimeConnected, sessionId]);

  const statusLabel = useMemo(() => {
    if (!state) return "Conectando...";
    if (state.status === "WAITING") return "Aguardando jogador";
    if (state.status === "IN_PROGRESS") return "Partida em andamento";
    if (state.status === "FINISHED") return "Partida finalizada";
    return "Partida encerrada";
  }, [state]);

  return {
    state,
    loading,
    error,
    isRealtimeConnected,
    statusLabel,
  };
}

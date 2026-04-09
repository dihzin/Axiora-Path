"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  anonymousIdentify,
  getToolsCredits,
  getUsageStatus,
} from "@/lib/api/client";
import { getAccessToken } from "@/lib/api/session";
import {
  getOrCreateAnonId,
  getOrCreateFingerprintId,
} from "@/lib/identity";

// ── State shape ──────────────────────────────────────────────────────────────

export type ToolsIdentityState = {
  anonymousId: string;
  fingerprintId: string;
  freeGenerationsUsed: number;
  freeGenerationsRemaining: number;
  paidGenerationsAvailable: number;
  canGenerate: boolean;
  paywallRequired: boolean;
  isAnonUser: boolean;
  initializing: boolean;
};

const INITIAL_STATE: ToolsIdentityState = {
  anonymousId: "",
  fingerprintId: "",
  freeGenerationsUsed: 0,
  freeGenerationsRemaining: 0,
  paidGenerationsAvailable: 0,
  canGenerate: false,
  paywallRequired: false,
  isAnonUser: false,
  initializing: true,
};

type ContextValue = ToolsIdentityState & {
  refresh: () => Promise<void>;
};

const ToolsIdentityContext = createContext<ContextValue | null>(null);

// ── Provider ─────────────────────────────────────────────────────────────────

export function ToolsIdentityProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = useState<ToolsIdentityState>(INITIAL_STATE);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Guard against double-invocation in React StrictMode
  const didLoad = useRef(false);

  const load = useCallback(async () => {
    const anonId = getOrCreateAnonId();
    const accessToken = getAccessToken();

    // Inicia o fingerprint imediatamente em paralelo — não bloqueia o caminho auth.
    // Para usuários autenticados, o fingerprint corre junto com getToolsCredits().
    // Para anônimos, já está computando enquanto verificamos o accessToken.
    const fpPromise = getOrCreateFingerprintId();

    setState((prev) => ({ ...prev, anonymousId: anonId }));

    try {
      if (!accessToken) {
        throw new Error("NO_AUTH_SESSION");
      }
      // Usuário autenticado: fingerprint e API em paralelo
      const [result, fpId] = await Promise.all([getToolsCredits(), fpPromise]);
      const credits = Math.max(0, Number(result.credits) || 0);
      setState({
        anonymousId: anonId,
        fingerprintId: fpId,
        freeGenerationsUsed: 0,
        freeGenerationsRemaining: 0,
        paidGenerationsAvailable: credits,
        canGenerate: credits > 0,
        paywallRequired: credits <= 0,
        isAnonUser: false,
        initializing: false,
      });
    } catch {
      // Not authenticated — use anonymous identity
      if (!anonId) {
        setState((prev) => ({ ...prev, initializing: false }));
        return;
      }
      try {
        // Para anônimos o fingerprint já foi iniciado — aguarda o resultado
        const fpId = await fpPromise;
        setState((prev) => ({ ...prev, fingerprintId: fpId }));
        const res = await anonymousIdentify({
          anonymous_id: anonId,
          fingerprint_id: fpId || undefined,
          user_agent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
        });
        const { identity } = res;
        setState({
          anonymousId: anonId,
          fingerprintId: fpId,
          freeGenerationsUsed: identity.free_generations_used,
          freeGenerationsRemaining: identity.free_generations_remaining,
          paidGenerationsAvailable: identity.paid_generations_available,
          canGenerate: identity.can_generate,
          paywallRequired: !identity.can_generate,
          isAnonUser: true,
          initializing: false,
        });
      } catch {
        setState((prev) => ({ ...prev, initializing: false }));
      }
    }
  }, []);

  useEffect(() => {
    if (didLoad.current) return;
    didLoad.current = true;
    void load();
  }, [load]);

  // refresh — lightweight re-check without full fingerprint recompute
  const refresh = useCallback(async () => {
    const s = stateRef.current;
    if (!s.isAnonUser) {
      // Auth user: re-fetch credits
      try {
        const result = await getToolsCredits();
        const credits = Math.max(0, Number(result.credits) || 0);
        setState((prev) => ({
          ...prev,
          paidGenerationsAvailable: credits,
          canGenerate: credits > 0,
          paywallRequired: credits <= 0,
        }));
      } catch {
        /* silent — stale data is acceptable */
      }
    } else {
      // Anon user: lightweight usage-status query
      if (!s.anonymousId) return;
      try {
        const res = await getUsageStatus({
          anonymous_id: s.anonymousId,
          fingerprint_id: s.fingerprintId || undefined,
        });
        setState((prev) => ({
          ...prev,
          freeGenerationsUsed: res.free_generations_used,
          freeGenerationsRemaining: res.free_generations_remaining,
          paidGenerationsAvailable: res.paid_generations_available,
          canGenerate: res.can_generate,
          paywallRequired: res.paywall_required,
        }));
      } catch {
        /* silent */
      }
    }
  }, []);

  return (
    <ToolsIdentityContext.Provider value={{ ...state, refresh }}>
      {children}
    </ToolsIdentityContext.Provider>
  );
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useToolsIdentity(): ContextValue {
  const ctx = useContext(ToolsIdentityContext);
  if (!ctx) {
    throw new Error("useToolsIdentity must be used within ToolsIdentityProvider");
  }
  return ctx;
}

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
  getToolsCredits,
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
  hasAuthenticatedSession: boolean;
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
  hasAuthenticatedSession: false,
  initializing: true,
};

type ContextValue = ToolsIdentityState & {
  refresh: () => Promise<void>;
  applyPaidCredits: (credits: number) => void;
  establishAuthenticatedSession: (credits: number) => void;
  resetAuth: () => void;
};

const ToolsIdentityContext = createContext<ContextValue | null>(null);
const TOOLS_IDENTITY_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, ms = TOOLS_IDENTITY_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error("TOOLS_IDENTITY_TIMEOUT"));
    }, ms);

    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

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
    const fpId = await getOrCreateFingerprintId();
    const accessToken = getAccessToken();

    // Sync ids into state even before we know auth status
    setState((prev) => ({ ...prev, anonymousId: anonId, fingerprintId: fpId }));

    try {
      if (!accessToken) {
        throw new Error("NO_AUTH_SESSION");
      }
      // Try authenticated first ? throws if no valid session
      const result = await withTimeout(getToolsCredits(fpId || undefined));
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
        hasAuthenticatedSession: true,
        initializing: false,
      });
    } catch {
      const currentAccessToken = getAccessToken();
      if (currentAccessToken) {
        // Sess?o autenticada sem resposta de cr?ditos: mant?m usu?rio logado no fluxo tools.
        setState({
          anonymousId: anonId,
          fingerprintId: fpId,
          freeGenerationsUsed: 0,
          freeGenerationsRemaining: 0,
          paidGenerationsAvailable: 0,
          canGenerate: false,
          paywallRequired: true,
          isAnonUser: false,
          hasAuthenticatedSession: true,
          initializing: false,
        });
        return;
      }
      setState({
        anonymousId: anonId,
        fingerprintId: fpId,
        freeGenerationsUsed: 0,
        freeGenerationsRemaining: 0,
        paidGenerationsAvailable: 0,
        canGenerate: false,
        paywallRequired: false,
        isAnonUser: false,
        hasAuthenticatedSession: false,
        initializing: false,
      });
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
    if (s.hasAuthenticatedSession) {
      // Auth user: re-fetch credits
      try {
        const resolved = await withTimeout(getToolsCredits(s.fingerprintId || undefined));
        const credits = Math.max(0, Number(resolved.credits) || 0);
        setState((prev) => ({
          ...prev,
          paidGenerationsAvailable: credits,
          canGenerate: credits > 0,
          paywallRequired: credits <= 0,
          hasAuthenticatedSession: true,
        }));
      } catch {
        /* silent — stale data is acceptable */
      }
    }
  }, []);

  // Auto-sync de créditos para refletir compras/aportes externos sem F5.
  useEffect(() => {
    if (state.initializing || !state.hasAuthenticatedSession) return;
    let cancelled = false;

    const sync = async () => {
      if (cancelled) return;
      await refresh();
    };

    const interval = window.setInterval(() => {
      void sync();
    }, 10000);

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void sync();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh, state.hasAuthenticatedSession, state.initializing]);

  const applyPaidCredits = useCallback((credits: number) => {
    const normalized = Math.max(0, Number(credits) || 0);
    setState((prev) => ({
      ...prev,
      paidGenerationsAvailable: normalized,
      canGenerate: normalized > 0 || prev.freeGenerationsRemaining > 0,
      paywallRequired: normalized <= 0 && prev.freeGenerationsRemaining <= 0,
      initializing: false,
    }));
  }, []);

  const establishAuthenticatedSession = useCallback((credits: number) => {
    const normalized = Math.max(0, Number(credits) || 0);
    const anonId = getOrCreateAnonId();
    const fpId = stateRef.current.fingerprintId || "";
    setState({
      anonymousId: anonId,
      fingerprintId: fpId,
      freeGenerationsUsed: 0,
      freeGenerationsRemaining: 0,
      paidGenerationsAvailable: normalized,
      canGenerate: normalized > 0,
      paywallRequired: normalized <= 0,
      isAnonUser: false,
      hasAuthenticatedSession: true,
      initializing: false,
    });
  }, []);

  const resetAuth = useCallback(() => {
    const anonId = getOrCreateAnonId();
    const fpId = stateRef.current.fingerprintId || "";
    setState({
      anonymousId: anonId,
      fingerprintId: fpId,
      freeGenerationsUsed: 0,
      freeGenerationsRemaining: 0,
      paidGenerationsAvailable: 0,
      canGenerate: false,
      paywallRequired: false,
      isAnonUser: false,
      hasAuthenticatedSession: false,
      initializing: false,
    });
  }, []);

  return (
    <ToolsIdentityContext.Provider value={{ ...state, refresh, applyPaidCredits, establishAuthenticatedSession, resetAuth }}>
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

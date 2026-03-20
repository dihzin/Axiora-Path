"use client";

import { useEffect, useRef, useState } from "react";

import { createToolsCheckoutSession, getApiErrorMessage } from "@/lib/api/client";

type ToolsCheckoutRedirectProps = {
  planCode: "credits_30";
};

function getOrCreateToolsSessionToken(): string {
  const key = "axiora_tools_session_token";
  const existing = window.localStorage.getItem(key);
  if (existing && existing.length > 10) return existing;
  const token = (window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replaceAll("-", "");
  window.localStorage.setItem(key, token);
  return token;
}

export function ToolsCheckoutRedirect({ planCode }: ToolsCheckoutRedirectProps) {
  const startedRef = useRef(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    async function runCheckoutRedirect() {
      setLoading(true);
      setErrorMessage(null);
      try {
        const sessionToken = getOrCreateToolsSessionToken();
        const response = await createToolsCheckoutSession({
          plan_code: planCode,
          session_token: sessionToken,
        });
        window.location.assign(response.checkout_url);
      } catch (error) {
        setErrorMessage(getApiErrorMessage(error, "Nao foi possivel abrir o checkout agora."));
      } finally {
        setLoading(false);
      }
    }

    void runCheckoutRedirect();
  }, [planCode]);

  if (!errorMessage && !loading) return null;

  return (
    <div className="rounded-xl border border-[rgba(238,135,72,0.35)] bg-[rgba(238,135,72,0.12)] p-3 text-xs text-[#fde68a]">
      {loading ? (
        <p>Abrindo checkout seguro...</p>
      ) : (
        <div className="space-y-2">
          <p>{errorMessage}</p>
          <button
            type="button"
            onClick={() => {
              startedRef.current = false;
              setErrorMessage(null);
            }}
            className="rounded-md bg-[linear-gradient(180deg,#ee8748,#db6728)] px-2.5 py-1.5 font-bold text-white"
          >
            Tentar novamente
          </button>
        </div>
      )}
    </div>
  );
}


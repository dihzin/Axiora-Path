"use client";

import { useState } from "react";

import { createToolsCheckoutSession, getApiErrorMessage } from "@/lib/api/client";

function getOrCreateToolsSessionToken(): string {
  const key = "axiora_tools_session_token";
  const existing = window.localStorage.getItem(key);
  if (existing && existing.length > 10) return existing;
  const token = (window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replaceAll("-", "");
  window.localStorage.setItem(key, token);
  return token;
}

export function BuyPackButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckout() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const sessionToken = getOrCreateToolsSessionToken();
      const response = await createToolsCheckoutSession({
        plan_code: "credits_30",
        session_token: sessionToken,
      });
      window.location.assign(response.checkout_url);
    } catch (err) {
      setError(getApiErrorMessage(err, "Nao foi possivel abrir o checkout."));
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleCheckout}
        disabled={loading}
        className="axiora-chunky-btn axiora-chunky-btn--secondary block w-full px-4 py-3.5 text-center text-sm font-black"
      >
        {loading ? "Abrindo checkout..." : "Comprar pacote"}
      </button>
      {error ? <p className="text-xs text-[#fde68a]">{error}</p> : null}
    </div>
  );
}

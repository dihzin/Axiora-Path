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
        className="block w-full rounded-xl bg-[linear-gradient(180deg,#ee8748_0%,#db6728_100%)] px-4 py-3.5 text-center text-sm font-extrabold text-white shadow-[inset_0_1px_0_rgba(255,219,190,0.35),0_5px_0_rgba(158,74,30,0.55),0_14px_28px_rgba(93,48,22,0.28)] transition hover:brightness-110 disabled:opacity-70 disabled:shadow-none"
      >
        {loading ? "Abrindo checkout..." : "Comprar pacote"}
      </button>
      {error ? <p className="text-xs text-[#fde68a]">{error}</p> : null}
    </div>
  );
}


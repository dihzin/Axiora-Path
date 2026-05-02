"use client";

import { FormEvent, useState } from "react";

type WaitlistCaptureProps = {
  context: "app" | "roadmap" | "tools_coming_soon";
  title?: string;
  description?: string;
  compact?: boolean;
};

export function WaitlistCapture({ context, title, description, compact = false }: WaitlistCaptureProps) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      setError("Informe seu e-mail para entrar na lista.");
      return;
    }
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalized, context }),
      });
      const payload = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        throw new Error(payload.message || "Nao foi possivel registrar seu interesse agora.");
      }
      setMessage(payload.message || "Perfeito. Avisaremos quando abrir.");
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel registrar seu interesse agora.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.04)] ${compact ? "p-4" : "p-5"}`}>
      {title ? <p className="text-sm font-bold text-white">{title}</p> : null}
      {description ? <p className="mt-1 text-xs text-white/60">{description}</p> : null}
      <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={submit}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="seuemail@dominio.com"
          autoComplete="email"
          className="h-10 w-full rounded-xl border border-white/20 bg-[rgba(12,16,22,0.72)] px-3 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-[#ee8748]"
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="inline-flex h-10 items-center justify-center rounded-xl bg-[linear-gradient(180deg,#ee8748_0%,#db6728_100%)] px-4 text-sm font-extrabold text-white shadow-[0_4px_0_rgba(158,74,30,0.45)] transition hover:brightness-110 disabled:opacity-70"
        >
          {loading ? "Enviando..." : "Avise-me"}
        </button>
      </form>
      {message ? <p className="mt-2 text-xs font-semibold text-emerald-300">{message}</p> : null}
      {error ? <p className="mt-2 text-xs font-semibold text-rose-300">{error}</p> : null}
    </div>
  );
}


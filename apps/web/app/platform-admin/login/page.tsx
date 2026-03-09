"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { getApiErrorMessage, platformLogin } from "@/lib/api/client";
import { setAccessToken, setTenantSlug } from "@/lib/api/session";

export default function PlatformAdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nextPath, setNextPath] = useState("/platform-admin/axion-studio");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next");
    if (next && next.startsWith("/")) {
      setNextPath(next);
    }
  }, []);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const tokens = await platformLogin(email, password);
      setTenantSlug("platform-admin");
      setAccessToken(tokens.access_token);
      router.push(nextPath);
    } catch (err) {
      setError(getApiErrorMessage(err, "Não foi possível autenticar. Verifique e-mail e senha."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="axiora-brand-page mx-auto flex min-h-screen w-full items-center justify-center px-4 py-8">
      <div className="axiora-brand-content axiora-glass-card w-full max-w-md rounded-3xl p-6 text-slate-100">
        <h1 className="text-2xl font-black text-slate-100">Platform Admin</h1>
        <p className="mt-1 text-sm font-semibold text-slate-300">Acesso administrativo do Axion Studio.</p>

        <form className="mt-5 space-y-3" onSubmit={onSubmit}>
          <input
            className="w-full rounded-xl border border-sky-200/30 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400"
            type="email"
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <input
            className="w-full rounded-xl border border-sky-200/30 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400"
            type="password"
            placeholder="Senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          {error ? <p className="text-sm font-semibold text-rose-300">{error}</p> : null}
          <button
            className="w-full rounded-xl bg-[#FF6B3D] px-3 py-2 text-sm font-black text-white shadow-[0_5px_0_rgba(190,89,52,0.45)] disabled:opacity-60"
            type="submit"
            disabled={loading}
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </main>
  );
}

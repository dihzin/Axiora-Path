"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { platformLogin } from "@/lib/api/client";
import { setAccessToken, setRefreshToken, setTenantSlug } from "@/lib/api/session";

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
      setRefreshToken(tokens.refresh_token);
      router.push(nextPath);
    } catch {
      setError("Não foi possível autenticar. Verifique e-mail e senha.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      className="mx-auto flex min-h-screen w-full items-center justify-center bg-[#f6f6f3] bg-cover bg-center bg-no-repeat px-4 py-8"
      style={{ backgroundImage: "url('/axiora/home/login-background.svg')" }}
    >
      <div className="w-full max-w-md rounded-3xl border border-white/60 bg-white/95 p-6 shadow-[0_-4px_40px_rgba(13,25,41,0.25),0_8px_32px_rgba(0,0,0,0.15)]">
        <h1 className="text-2xl font-black text-[#17345E]">Platform Admin</h1>
        <p className="mt-1 text-sm font-semibold text-[#5A7AA4]">Acesso administrativo do Axion Studio.</p>

        <form className="mt-5 space-y-3" onSubmit={onSubmit}>
          <input
            className="w-full rounded-xl border border-[#C9D8EF] px-3 py-2 text-sm"
            type="email"
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <input
            className="w-full rounded-xl border border-[#C9D8EF] px-3 py-2 text-sm"
            type="password"
            placeholder="Senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          {error ? <p className="text-sm font-semibold text-[#B54C47]">{error}</p> : null}
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

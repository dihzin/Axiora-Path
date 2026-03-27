"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { AxioraLogo } from "@/components/brand/axiora-logo";
import { AuthWallpaper } from "@/components/layout/auth-wallpaper";
import { Button } from "@/components/ui/button";
import { getApiErrorMessage, platformLogin } from "@/lib/api/client";
import { setAccessToken, setTenantSlug } from "@/lib/api/session";
import { platformAdminLoginSchema } from "@/lib/schemas";

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
    const validation = platformAdminLoginSchema.safeParse({ email, password });
    if (!validation.success) {
      setError(validation.error.errors[0].message);
      return;
    }
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
    <main className="axiora-brand-page relative isolate mx-auto flex min-h-screen w-full items-center justify-center px-4 py-8">
      <AuthWallpaper />
      <div className="axiora-brand-content axiora-auth-panel w-full max-w-md rounded-3xl p-6">
        <AxioraLogo size="sm" className="mb-4 w-[150px] border-[rgba(223,204,183,0.88)] bg-[rgba(255,250,244,0.82)] shadow-[0_16px_32px_rgba(164,132,101,0.16)]" alt="Axiora Educação Digital" />
        <h1 className="text-2xl font-black text-[#22352f]">Platform Admin</h1>
        <p className="axiora-auth-muted mt-1 text-sm font-semibold">Acesso administrativo do Axion Studio.</p>

        <form className="mt-5 space-y-3" onSubmit={onSubmit}>
          <input
            className="axiora-auth-field w-full rounded-xl px-3 py-2 text-sm"
            type="email"
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <input
            className="axiora-auth-field w-full rounded-xl px-3 py-2 text-sm"
            type="password"
            placeholder="Senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          {error ? <p className="text-sm font-semibold text-rose-700">{error}</p> : null}
          <Button className="w-full bg-[linear-gradient(180deg,#ee8748_0%,#db6728_100%)] shadow-[inset_0_1px_0_rgba(255,219,190,0.46),0_6px_0_rgba(158,74,30,0.42),0_16px_24px_rgba(93,48,22,0.18)]" type="submit" disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </Button>
        </form>
      </div>
    </main>
  );
}

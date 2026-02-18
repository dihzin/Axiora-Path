"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { login } from "@/lib/api/client";
import { getTenantSlug, setAccessToken, setRefreshToken, setTenantSlug } from "@/lib/api/session";

export default function LoginPage() {
  const router = useRouter();
  const [tenantSlug, setTenantSlugValue] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const savedTenantSlug = getTenantSlug();
    if (savedTenantSlug) {
      setTenantSlugValue(savedTenantSlug);
    }
  }, []);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (!tenantSlug.trim()) {
        setError("Informe a organização.");
        return;
      }
      setTenantSlug(tenantSlug);
      const tokens = await login(email, password);
      setAccessToken(tokens.access_token);
      setRefreshToken(tokens.refresh_token);
      router.push("/select-tenant");
    } catch {
      setError("Não foi possível autenticar. Verifique organização, email e senha.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="safe-px safe-pb mx-auto flex min-h-screen w-full max-w-md items-center p-4 md:p-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Entrar</CardTitle>
          <CardDescription>Use sua organização e credenciais para acessar o MVP.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={onSubmit}>
            <Input placeholder="Organização" value={tenantSlug} onChange={(e) => setTenantSlugValue(e.target.value)} required />
            <Input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Input
              placeholder="Senha"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button className="w-full" type="submit" disabled={loading}>
              {loading ? "Entrando..." : "Entrar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

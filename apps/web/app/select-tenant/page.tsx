"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getApiErrorMessage, getMe } from "@/lib/api/client";
import { getTenantSlug, setTenantSlug } from "@/lib/api/session";

export default function SelectTenantPage() {
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const current = getTenantSlug();
    if (current) setSlug(current);
  }, []);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const previousSlug = getTenantSlug();
    setTenantSlug(slug);
    try {
      const me = await getMe();
      if (!me.membership.onboarding_completed) {
        router.push("/onboarding");
        return;
      }
      router.push("/select-child");
    } catch (err) {
      if (previousSlug) {
        setTenantSlug(previousSlug);
      }
      setError(getApiErrorMessage(err, "Nao foi possivel validar tenant. Confira login e credenciais."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="safe-px safe-pb mx-auto flex min-h-screen w-full max-w-md items-center">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Selecionar tenant</CardTitle>
          <CardDescription>Confirme o tenant ativo antes de escolher o perfil infantil.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={onSubmit}>
            <Input placeholder="ex: familia-silva" value={slug} onChange={(e) => setSlug(e.target.value)} required disabled={loading} />
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <Button className="w-full" type="submit" disabled={loading}>
              {loading ? "Validando..." : "Continuar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { getApiErrorMessage, getMe, listMemberships, type OrganizationMembership } from "@/lib/api/client";
import { getTenantSlug, setTenantSlug } from "@/lib/api/session";

export default function SelectTenantPage() {
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [memberships, setMemberships] = useState<OrganizationMembership[]>([]);
  const [loadingMemberships, setLoadingMemberships] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const proceedWithSlug = async (selectedSlug: string) => {
    setError(null);
    if (!selectedSlug.trim()) {
      setError("Selecione uma organização.");
      return;
    }

    setLoading(true);
    const previousSlug = getTenantSlug();
    setTenantSlug(selectedSlug);
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
      setError(getApiErrorMessage(err, "Não foi possível validar organização. Confira login e credenciais."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const loadMemberships = async () => {
      const current = getTenantSlug();
      if (current) setSlug(current);

      try {
        const items = await listMemberships();
        if (cancelled) return;
        setMemberships(items);

        if (!items.length) return;

        const selectedSlug = current && items.some((item) => item.tenant_slug === current) ? current : items[0].tenant_slug;
        setSlug(selectedSlug);
      } catch {
        if (!cancelled) {
          setMemberships([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingMemberships(false);
        }
      }
    };

    void loadMemberships();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await proceedWithSlug(slug);
  };

  return (
    <main className="safe-px safe-pb mx-auto flex min-h-screen w-full max-w-md items-center p-4 md:p-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Selecionar organização</CardTitle>
          <CardDescription>Confirme a organização ativa antes de escolher o perfil infantil.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={onSubmit}>
            {loadingMemberships ? (
              <p className="text-sm text-muted-foreground">Carregando organizações...</p>
            ) : memberships.length > 0 ? (
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="organization-select">
                  Organização
                </label>
                <NativeSelect
                  id="organization-select"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  required
                  disabled={loading}
                >
                  {memberships.map((item) => (
                    <option key={item.tenant_id} value={item.tenant_slug}>
                      {item.tenant_name} ({item.tenant_type}) - {item.tenant_slug}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            ) : (
              <Input placeholder="ex: familia-silva" value={slug} onChange={(e) => setSlug(e.target.value)} required disabled={loading} />
            )}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button className="w-full" type="submit" disabled={loading || loadingMemberships}>
              {loading ? "Continuando..." : "Continuar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

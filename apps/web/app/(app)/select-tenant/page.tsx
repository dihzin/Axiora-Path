"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { getApiErrorMessage, getLegalStatus, getMe, listMemberships, type OrganizationMembership } from "@/lib/api/client";
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
      if (me.membership.tenant_type === "FAMILY") {
        const legal = await getLegalStatus();
        if (legal.consent_required) {
          router.push("/onboarding");
          return;
        }
      }
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
    <div className="axiora-brand-page">
      <main className="axiora-brand-content safe-px safe-pb mx-auto flex min-h-screen w-full max-w-md items-center overflow-x-clip p-4 md:p-6">
        <Card className="axiora-glass-card w-full text-slate-100">
          <CardHeader>
            <CardTitle className="text-slate-100">Selecionar organização</CardTitle>
            <CardDescription className="text-slate-300">Confirme a organização ativa antes de escolher o perfil infantil.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={onSubmit}>
              {loadingMemberships ? (
                <p role="status" aria-live="polite" className="text-sm text-slate-300">Carregando organizações...</p>
              ) : memberships.length > 0 ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-200" htmlFor="organization-select">
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
                <>
                  <label className="text-sm font-medium text-slate-200" htmlFor="slug">Organização</label>
                  <Input
                    id="slug"
                    placeholder="ex: familia-silva"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? "tenant-error" : undefined}
                    required
                    disabled={loading}
                  />
                </>
              )}
              {error ? <p id="tenant-error" role="alert" aria-live="polite" className="text-sm text-rose-300">{error}</p> : null}
              <Button className="w-full" type="submit" disabled={loading || loadingMemberships}>
                {loading ? "Continuando..." : "Continuar"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

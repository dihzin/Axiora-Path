"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { getApiErrorMessage, listMemberships, selectTenant, type OrganizationMembership } from "@/lib/api/client";
import { clearTenantSlug, getTenantSlug, setAccessToken, setTenantSlug } from "@/lib/api/session";

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
    try {
      const activation = await selectTenant(selectedSlug);
      setTenantSlug(activation.tenant_slug);
      setAccessToken(activation.access_token);
      router.push("/parent");
    } catch (err) {
      if (previousSlug) {
        setTenantSlug(previousSlug);
      } else {
        clearTenantSlug();
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
        <Card className="axiora-glass-card w-full text-[#FFF4E7]">
          <CardHeader>
            <CardTitle className="text-[#FFF4E7]">Selecionar organização</CardTitle>
            <CardDescription className="text-[#E6D8C7]">Confirme a organização ativa antes de escolher o perfil infantil.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={onSubmit}>
              {loadingMemberships ? (
                <p role="status" aria-live="polite" className="text-sm text-[#E6D8C7]">Carregando organizações...</p>
              ) : memberships.length > 0 ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-[#F0E5D8]" htmlFor="organization-select">
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
                <p role="status" aria-live="polite" className="text-sm text-[#E6D8C7]">
                  Nenhuma organização disponível para esta conta.
                </p>
              )}
              {error ? <p id="tenant-error" role="alert" aria-live="polite" className="text-sm text-rose-300">{error}</p> : null}
              <Button className="w-full" type="submit" disabled={loading || loadingMemberships || memberships.length === 0}>
                {loading ? "Continuando..." : "Continuar"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

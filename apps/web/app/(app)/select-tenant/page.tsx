"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { AxioraLogo } from "@/components/brand/axiora-logo";
import { AuthWallpaper } from "@/components/layout/auth-wallpaper";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { getApiErrorMessage, listMemberships, selectTenant, type OrganizationMembership } from "@/lib/api/client";
import { clearTenantSlug, getTenantSlug, setAccessToken, setTenantSlug } from "@/lib/api/session";
import { selectTenantSchema } from "@/lib/schemas";

export default function SelectTenantPage() {
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [memberships, setMemberships] = useState<OrganizationMembership[]>([]);
  const [loadingMemberships, setLoadingMemberships] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const proceedWithSlug = async (selectedSlug: string) => {
    const validation = selectTenantSchema.safeParse({ slug: selectedSlug });
    if (!validation.success) {
      setError(validation.error.errors[0].message);
      return;
    }
    setError(null);
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
    <div className="axiora-brand-page relative isolate">
      <AuthWallpaper />
      <main className="axiora-brand-content safe-px safe-pb mx-auto flex min-h-screen w-full max-w-md items-center overflow-x-clip p-4 md:p-6">
        <Card className="axiora-auth-panel w-full">
          <CardHeader>
            <AxioraLogo size="sm" className="mb-4 w-[150px] border-[rgba(223,204,183,0.88)] bg-[rgba(255,250,244,0.82)] shadow-[0_16px_32px_rgba(164,132,101,0.16)]" alt="Axiora Educação Digital" />
            <CardTitle className="text-[#22352f]">Selecionar organização</CardTitle>
            <CardDescription className="axiora-auth-muted">Confirme a organização ativa antes de escolher o perfil infantil.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={onSubmit}>
              {loadingMemberships ? (
                <p role="status" aria-live="polite" className="axiora-auth-muted text-sm">Carregando organizações...</p>
              ) : memberships.length > 0 ? (
                <div className="space-y-2">
                  <label className="text-sm font-black uppercase tracking-[0.14em] text-[#816b57]" htmlFor="organization-select">
                    Organização
                  </label>
                  <NativeSelect
                    id="organization-select"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    required
                    disabled={loading}
                    className="axiora-auth-field h-12 rounded-[1.15rem]"
                  >
                    {memberships.map((item) => (
                      <option key={item.tenant_id} value={item.tenant_slug}>
                        {item.tenant_name} ({item.tenant_type}) - {item.tenant_slug}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              ) : (
                <p role="status" aria-live="polite" className="axiora-auth-muted text-sm">
                  Nenhuma organização disponível para esta conta.
                </p>
              )}
              {error ? <p id="tenant-error" role="alert" aria-live="polite" className="text-sm text-rose-300">{error}</p> : null}
              <Button className="w-full bg-[linear-gradient(180deg,#ee8748_0%,#db6728_100%)] shadow-[inset_0_1px_0_rgba(255,219,190,0.46),0_6px_0_rgba(158,74,30,0.42),0_16px_24px_rgba(93,48,22,0.18)]" type="submit" disabled={loading || loadingMemberships || memberships.length === 0}>
                {loading ? "Continuando..." : "Continuar"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

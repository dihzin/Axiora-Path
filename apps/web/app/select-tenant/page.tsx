"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getMe } from "@/lib/api/client";
import { getTenantSlug, setTenantSlug } from "@/lib/api/session";

export default function SelectTenantPage() {
  const router = useRouter();
  const [slug, setSlug] = useState("");

  useEffect(() => {
    const current = getTenantSlug();
    if (current) setSlug(current);
  }, []);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setTenantSlug(slug);
    try {
      const me = await getMe();
      if (!me.membership.onboarding_completed) {
        router.push("/onboarding");
        return;
      }
      router.push("/select-child");
    } catch {
      router.push("/select-child");
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
            <Input placeholder="ex: familia-silva" value={slug} onChange={(e) => setSlug(e.target.value)} required />
            <Button className="w-full" type="submit">
              Continuar
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

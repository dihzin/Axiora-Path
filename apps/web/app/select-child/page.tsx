"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getMe } from "@/lib/api/client";

type ChildProfile = {
  id: number;
  display_name: string;
  avatar_key: string | null;
  birth_year: number | null;
};

export default function SelectChildPage() {
  const router = useRouter();
  const [children, setChildren] = useState<ChildProfile[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMe()
      .then((data) => setChildren(data.child_profiles))
      .catch(() => setError("Nao foi possivel carregar perfis. Faca login novamente."));
  }, []);

  const chooseChild = (childId: number) => {
    localStorage.setItem("axiora_child_id", String(childId));
    router.push("/child");
  };

  return (
    <main className="safe-px safe-pb mx-auto min-h-screen w-full max-w-md py-6">
      <Card>
        <CardHeader>
          <CardTitle>Selecionar perfil</CardTitle>
          <CardDescription>Pais entram e escolhem qual perfil infantil acompanhar.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {children.map((child) => (
            <button
              key={child.id}
              type="button"
              className="w-full rounded-md border border-border px-3 py-3 text-left text-sm"
              onClick={() => chooseChild(child.id)}
            >
              {child.display_name}
            </button>
          ))}
          <Button className="w-full" variant="secondary" onClick={() => router.push("/parent-pin")}>
            Ir para area de pais
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

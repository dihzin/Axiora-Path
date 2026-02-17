"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ThemeName } from "@/lib/api/client";
import { getMe } from "@/lib/api/client";

type ChildProfile = {
  id: number;
  display_name: string;
  avatar_key: string | null;
  birth_year: number | null;
  theme: ThemeName;
};

export default function SelectChildPage() {
  const router = useRouter();
  const { setTheme } = useTheme();
  const [children, setChildren] = useState<ChildProfile[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMe()
      .then((data) => setChildren(data.child_profiles))
      .catch(() => setError("Nao foi possivel carregar perfis. Faca login novamente."));
  }, []);

  const chooseChild = (child: ChildProfile) => {
    const allowed = children.some((item) => item.id === child.id);
    if (!allowed) {
      setError("Perfil invalido para este usuario.");
      return;
    }
    localStorage.setItem("axiora_child_id", String(child.id));
    setTheme(child.theme);
    router.push("/child");
  };

  return (
    <main className="safe-px safe-pb mx-auto min-h-screen w-full max-w-md p-4 md:p-6">
      <Card>
        <CardHeader>
          <CardTitle>Selecionar perfil</CardTitle>
          <CardDescription>Pais entram e escolhem qual perfil infantil acompanhar.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {children.map((child) => (
            <button
              key={child.id}
              type="button"
              className="w-full rounded-xl border border-border px-3 py-3 text-left text-sm shadow-sm"
              onClick={() => chooseChild(child)}
            >
              <div className="flex items-center justify-between">
                <span>{child.display_name}</span>
                <span className="text-xs text-muted-foreground">{child.theme}</span>
              </div>
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

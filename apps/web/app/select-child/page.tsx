"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";

import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ThemeName } from "@/lib/api/client";
import { getMe } from "@/lib/api/client";
import { cn } from "@/lib/utils";

type ChildProfile = {
  id: number;
  display_name: string;
  avatar_key: string | null;
  birth_year: number | null;
  theme: ThemeName;
};

const THEME_LABELS: Record<ThemeName, string> = {
  default: "Padrão",
  space: "Espaço",
  jungle: "Selva",
  ocean: "Oceano",
  soccer: "Futebol",
  capybara: "Capivara",
  dinos: "Dinossauros",
  princess: "Princesa",
  heroes: "Heróis",
};

export default function SelectChildPage() {
  const router = useRouter();
  const { setTheme } = useTheme();
  const [children, setChildren] = useState<ChildProfile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectingChildId, setSelectingChildId] = useState<number | null>(null);

  useEffect(() => {
    getMe()
      .then((data) => setChildren(data.child_profiles))
      .catch(() => setError("Não foi possível carregar perfis. Faça login novamente."));
  }, []);

  const chooseChild = (child: ChildProfile) => {
    if (selectingChildId !== null) return;
    const allowed = children.some((item) => item.id === child.id);
    if (!allowed) {
      setError("Perfil inválido para este usuário.");
      return;
    }
    setSelectingChildId(child.id);
    localStorage.setItem("axiora_child_id", String(child.id));
    localStorage.setItem("axiora_child_name", child.display_name);
    setTheme(child.theme);
    router.push("/child");
  };

  return (
    <div
      className="min-h-screen bg-[#f6f6f3] bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: "url('/axiora/home/login-background.svg')" }}
    >
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
                className={cn(
                  "w-full rounded-2xl border px-3 py-3 text-left text-sm shadow-sm transition-all duration-150 hover:-translate-y-0.5",
                  selectingChildId === child.id ? "border-secondary bg-secondary/10" : "border-border hover:bg-muted",
                )}
                onClick={() => chooseChild(child)}
                disabled={selectingChildId !== null}
              >
                <div className="flex items-center justify-between">
                  <span>{child.display_name}</span>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    {selectingChildId === child.id ? <CheckCircle2 className="h-3.5 w-3.5 text-secondary" /> : null}
                    {selectingChildId === child.id ? "Abrindo..." : THEME_LABELS[child.theme]}
                  </span>
                </div>
              </button>
            ))}
            <Button className="w-full" variant="secondary" onClick={() => router.push("/parent-pin")} disabled={selectingChildId !== null}>
              Ir para área dos pais
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

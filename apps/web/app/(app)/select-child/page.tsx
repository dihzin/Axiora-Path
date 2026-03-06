"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";

import { useTheme } from "@/components/theme-provider";
import { ChildAvatar } from "@/components/child-avatar";
import { PageShell } from "@/components/layout/page-shell";
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
    <div className="axiora-brand-page">
      <PageShell width="content" className="axiora-brand-content">
        <Card className="axiora-glass-card text-slate-100">
          <CardHeader>
            <CardTitle className="text-slate-100">Selecionar perfil</CardTitle>
            <CardDescription className="text-slate-300">Pais entram e escolhem qual perfil infantil acompanhar.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {error ? <p role="alert" aria-live="polite" className="text-sm text-rose-300">{error}</p> : null}
            {children.length === 0 ? (
              <div className="rounded-2xl border border-sky-200/25 bg-slate-950/25 px-4 py-4 text-sm text-slate-200">
                Nenhum perfil infantil disponível nesta organização. Complete o onboarding dos pais para criar o primeiro perfil.
              </div>
            ) : null}
            {children.map((child) => (
              <button
                key={child.id}
                type="button"
                className={cn(
                  "w-full rounded-2xl border px-3 py-3 text-left text-sm shadow-sm transition-transform transition-shadow transition-opacity duration-150 hover:-translate-y-0.5",
                  selectingChildId === child.id
                    ? "border-sky-300/60 bg-sky-500/15 text-slate-100"
                    : "border-sky-200/25 bg-slate-950/25 text-slate-100 hover:bg-white/10",
                )}
                onClick={() => chooseChild(child)}
                disabled={selectingChildId !== null}
                aria-label={`Selecionar perfil ${child.display_name}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <ChildAvatar name={child.display_name} avatarKey={child.avatar_key} size={36} />
                    <span>{child.display_name}</span>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs text-slate-300">
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
      </PageShell>
    </div>
  );
}


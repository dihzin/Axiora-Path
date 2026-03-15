"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";

import { useTheme } from "@/components/theme-provider";
import { ChildAvatar } from "@/components/child-avatar";
import { AuthWallpaper } from "@/components/layout/auth-wallpaper";
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
    <div className="axiora-brand-page relative isolate">
      <AuthWallpaper />
      <PageShell width="content" className="axiora-brand-content">
        <Card className="axiora-auth-panel">
          <CardHeader>
            <CardTitle className="text-[#22352f]">Selecionar perfil</CardTitle>
            <CardDescription className="axiora-auth-muted">Pais entram e escolhem qual perfil infantil acompanhar.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {error ? <p role="alert" aria-live="polite" className="text-sm text-rose-700">{error}</p> : null}
            {children.length === 0 ? (
              <div className="axiora-auth-option rounded-2xl px-4 py-4 text-sm">
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
                    ? "border-[#f3bf96] bg-[linear-gradient(160deg,rgba(255,245,232,0.95),rgba(255,236,214,0.86))] text-[#203846] shadow-[0_12px_24px_rgba(194,170,144,0.2)]"
                    : "border-[rgba(233,217,200,0.9)] bg-[rgba(255,255,255,0.82)] text-[#203846] shadow-[inset_0_1px_0_rgba(255,255,255,0.94),0_10px_20px_rgba(194,170,144,0.12)] hover:bg-white",
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
                  <span className="inline-flex items-center gap-1 text-xs text-[#6f665d]">
                    {selectingChildId === child.id ? <CheckCircle2 className="h-3.5 w-3.5 text-[#F1C56B]" /> : null}
                    {selectingChildId === child.id ? "Abrindo..." : THEME_LABELS[child.theme]}
                  </span>
                </div>
              </button>
            ))}
            <Button className="w-full bg-[linear-gradient(180deg,#ffb170_0%,#ff8a45_100%)] text-[#fff9f2] shadow-[inset_0_1px_0_rgba(255,231,205,0.56),0_6px_0_rgba(158,74,30,0.42),0_16px_24px_rgba(93,48,22,0.18)]" variant="secondary" onClick={() => router.push("/parent-pin")} disabled={selectingChildId !== null}>
              Ir para área dos pais
            </Button>
          </CardContent>
        </Card>
      </PageShell>
    </div>
  );
}


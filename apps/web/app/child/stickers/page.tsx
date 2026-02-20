"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Sparkles } from "lucide-react";

import { AxioraAvatar } from "@/components/axiora/AxioraAvatar";
import { ChildBottomNav } from "@/components/child-bottom-nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, getAchievements, getApiErrorMessage, type AchievementItem } from "@/lib/api/client";
import type { Mood } from "@/lib/types/mood";

const ICON_MAP: Record<string, Mood> = {
  flame_7: "angry",
  approved_10: "happy",
  goal_1: "neutral",
};

function toStorageKey(childId: number): string {
  return `axiora_unlocked_achievements_${childId}`;
}

export default function StickerGalleryPage() {
  const [childId, setChildId] = useState<number | null>(null);
  const [items, setItems] = useState<AchievementItem[]>([]);
  const [newlyUnlocked, setNewlyUnlocked] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const rawChildId = localStorage.getItem("axiora_child_id");
    if (!rawChildId) {
      setLoading(false);
      return;
    }
    const parsedChildId = Number(rawChildId);
    if (!Number.isFinite(parsedChildId)) {
      setLoading(false);
      return;
    }
    setChildId(parsedChildId);

    getAchievements(parsedChildId)
      .then((data) => {
        const storageKey = toStorageKey(parsedChildId);
        const previousRaw = localStorage.getItem(storageKey);
        const previousIds = new Set<number>(previousRaw ? (JSON.parse(previousRaw) as number[]) : []);
        const currentUnlocked = data.achievements.filter((item) => item.unlocked).map((item) => item.id);
        const newly = new Set<number>(currentUnlocked.filter((id) => !previousIds.has(id)));
        setNewlyUnlocked(newly);
        setItems(data.achievements);
        localStorage.setItem(storageKey, JSON.stringify(currentUnlocked));
      })
      .catch((err: unknown) => {
        setItems([]);
        if (err instanceof ApiError && err.status === 403) {
          setError(getApiErrorMessage(err, "Acesso bloqueado no momento. Peça para um responsável concluir o consentimento."));
          return;
        }
        setError(getApiErrorMessage(err, "Não foi possível carregar as figurinhas agora."));
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  return (
    <main className="safe-px safe-pb mx-auto min-h-screen w-full max-w-md overflow-x-clip p-4 pb-52 md:max-w-4xl md:p-6 md:pb-40 xl:max-w-5xl">
      <div className="mb-3">
        <Link
          className="inline-flex items-center gap-1.5 rounded-2xl border-2 border-border bg-white px-2.5 py-1.5 text-sm font-semibold text-muted-foreground shadow-[0_2px_0_rgba(184,200,239,0.7)] transition hover:bg-muted"
          href="/child"
        >
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-lg bg-muted">
            <ArrowLeft className="h-4 w-4 stroke-[2.6]" />
          </span>
          Voltar
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Galeria de figurinhas</CardTitle>
        </CardHeader>
        <CardContent>
          {childId === null ? <p className="text-sm text-muted-foreground">Selecione uma criança primeiro.</p> : null}
          {loading ? <p className="mb-3 text-sm text-muted-foreground">Carregando figurinhas...</p> : null}
          {error ? (
            <div className="mb-3 rounded-xl border border-[#F4C5C2] bg-[#FFF2F1] px-3 py-2 text-sm font-semibold text-[#B54C47]">
              {error}
            </div>
          ) : null}
          {!loading && !error && childId !== null && items.length === 0 ? <p className="mb-3 text-sm text-muted-foreground">Nenhuma figurinha disponível para este perfil ainda.</p> : null}

          <div className="grid grid-cols-3 gap-3">
            {items.map((item) => {
              const unlocked = item.unlocked;
              const isNew = newlyUnlocked.has(item.id);
              return (
                <div
                  key={item.id}
                  className={`rounded-2xl border p-3 text-center shadow-sm transition ${
                    unlocked ? "border-primary/40 bg-primary/10" : "border-border bg-background grayscale"
                  } ${isNew ? "sticker-unlock-pop" : ""}`}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg border border-border bg-white shadow-[0_2px_0_rgba(184,200,239,0.6)]">
                      <Sparkles className="h-3.5 w-3.5 stroke-[2.6] text-secondary" />
                    </span>
                    {unlocked ? <span className="rounded-full bg-secondary/15 px-2 py-0.5 text-[10px] font-semibold text-secondary">ativa</span> : null}
                  </div>
                  <div className="flex justify-center rounded-2xl border border-border/60 bg-white/90 py-2">
                    <AxioraAvatar mood={ICON_MAP[item.icon_key] ?? "neutral"} size={40} />
                  </div>
                  <p className="mt-2 text-xs font-semibold">{item.title}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">{unlocked ? item.description : "Bloqueada"}</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
      <ChildBottomNav />
    </main>
  );
}

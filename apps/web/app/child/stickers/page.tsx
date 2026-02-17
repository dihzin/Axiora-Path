"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAchievements, type AchievementItem } from "@/lib/api/client";

const ICON_MAP: Record<string, string> = {
  flame_7: "🔥",
  approved_10: "✅",
  goal_1: "🏆",
};

function toStorageKey(childId: number): string {
  return `axiora_unlocked_achievements_${childId}`;
}

export default function StickerGalleryPage() {
  const [childId, setChildId] = useState<number | null>(null);
  const [items, setItems] = useState<AchievementItem[]>([]);
  const [newlyUnlocked, setNewlyUnlocked] = useState<Set<number>>(new Set());

  useEffect(() => {
    const rawChildId = localStorage.getItem("axiora_child_id");
    if (!rawChildId) return;
    const parsedChildId = Number(rawChildId);
    if (!Number.isFinite(parsedChildId)) return;
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
      .catch(() => {
        setItems([]);
      });
  }, []);

  return (
    <main className="safe-px safe-pb mx-auto min-h-screen w-full max-w-md py-5">
      <div className="mb-3">
        <Link className="inline-flex items-center gap-1 text-sm text-muted-foreground" href="/child">
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sticker Gallery</CardTitle>
        </CardHeader>
        <CardContent>
          {childId === null ? <p className="text-sm text-muted-foreground">Selecione uma crianca primeiro.</p> : null}

          <div className="grid grid-cols-3 gap-3">
            {items.map((item) => {
              const unlocked = item.unlocked;
              const isNew = newlyUnlocked.has(item.id);
              return (
                <div
                  key={item.id}
                  className={`rounded-lg border p-3 text-center transition ${
                    unlocked ? "border-primary/40 bg-primary/10" : "border-border bg-background grayscale"
                  } ${isNew ? "sticker-unlock-pop" : ""}`}
                >
                  <div className="text-3xl">{ICON_MAP[item.icon_key] ?? "⭐"}</div>
                  <p className="mt-2 text-xs font-semibold">{item.title}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">{unlocked ? item.description : "Locked"}</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

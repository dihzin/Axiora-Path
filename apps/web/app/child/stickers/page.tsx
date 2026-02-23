"use client";

import { ArrowLeft, Lock, Sparkles, Trophy } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { AxioraAvatar } from "@/components/axiora/AxioraAvatar";
import { ChildBottomNav } from "@/components/child-bottom-nav";
import { ChildDesktopShell } from "@/components/child-desktop-shell";
import { PageShell } from "@/components/layout/page-shell";
import { ApiError, getAchievements, getApiErrorMessage, type AchievementItem } from "@/lib/api/client";
import type { Mood } from "@/lib/types/mood";

const ICON_MAP: Record<string, Mood> = {
  flame_7: "angry",
  approved_10: "happy",
  goal_1: "neutral",
};

type StickerFilter = "all" | "unlocked" | "locked" | "new";

function toStorageKey(childId: number): string {
  return `axiora_unlocked_achievements_${childId}`;
}

function inferTier(item: AchievementItem): "legend" | "epic" | "rare" | "common" {
  const reward = (item.xp_reward ?? 0) + (item.coin_reward ?? 0) * 2;
  if (reward >= 120) return "legend";
  if (reward >= 80) return "epic";
  if (reward >= 40) return "rare";
  return "common";
}

function tierLabel(tier: ReturnType<typeof inferTier>): string {
  if (tier === "legend") return "Lendaria";
  if (tier === "epic") return "Epica";
  if (tier === "rare") return "Rara";
  return "Comum";
}

export default function StickerGalleryPage() {
  const [childId, setChildId] = useState<number | null>(null);
  const [items, setItems] = useState<AchievementItem[]>([]);
  const [newlyUnlocked, setNewlyUnlocked] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState<StickerFilter>("all");
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
        setError(getApiErrorMessage(err, "Nao foi possivel carregar as figurinhas agora."));
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const unlockedCount = useMemo(() => items.filter((item) => item.unlocked).length, [items]);
  const newCount = useMemo(() => items.filter((item) => newlyUnlocked.has(item.id)).length, [items, newlyUnlocked]);
  const lockedCount = Math.max(0, items.length - unlockedCount);
  const completion = items.length > 0 ? Math.round((unlockedCount / items.length) * 100) : 0;

  const visibleItems = useMemo(() => {
    const list = [...items].sort((a, b) => {
      if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
      return a.title.localeCompare(b.title);
    });
    if (filter === "unlocked") return list.filter((item) => item.unlocked);
    if (filter === "locked") return list.filter((item) => !item.unlocked);
    if (filter === "new") return list.filter((item) => newlyUnlocked.has(item.id));
    return list;
  }, [filter, items, newlyUnlocked]);

  return (
    <ChildDesktopShell activeNav="figurinhas">
      <PageShell tone="child" width="content" className="relative overflow-hidden pb-32">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-[-12%] top-20 h-64 w-64 rounded-full bg-[#6FD9CA]/12 blur-2xl" />
          <div className="absolute right-[-10%] top-[32%] h-72 w-72 rounded-full bg-[#B2C7FF]/11 blur-3xl" />
          <div className="absolute bottom-24 left-[18%] h-56 w-56 rounded-full bg-[#FFD28A]/10 blur-3xl" />
        </div>

      <header className="space-y-3">
        <Link
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-[#C9D8EF] bg-white/95 px-3 py-1.5 text-sm font-black text-[#4A5E7D] shadow-[0_2px_8px_rgba(0,0,0,0.08)]"
          href="/child"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>

        <section className="rounded-[28px] border border-[#CFE6F3] bg-[linear-gradient(140deg,#FFFFFF_0%,#F4FBFF_52%,#EFF8FF_100%)] p-4 shadow-[0_14px_32px_rgba(65,98,151,0.10)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.08em] text-[#6B87AC]">Colecao Axiora</p>
              <h1 className="text-2xl font-black leading-tight text-[#20406A]">Figurinhas</h1>
            </div>
            <div className="grid h-14 w-14 place-items-center rounded-2xl border border-[#BFE8E0] bg-[#E9FBF8] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
              <Trophy className="h-6 w-6 text-[#18A796]" aria-hidden />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="rounded-2xl border border-[#D5E4F6] bg-white/95 px-3 py-2 text-center">
              <p className="text-xs font-black text-[#18A796]">{unlockedCount}</p>
              <p className="text-[10px] font-black uppercase tracking-[0.05em] text-[#7891B2]">Ativas</p>
            </div>
            <div className="rounded-2xl border border-[#D5E4F6] bg-white/95 px-3 py-2 text-center">
              <p className="text-xs font-black text-[#5D6F8D]">{lockedCount}</p>
              <p className="text-[10px] font-black uppercase tracking-[0.05em] text-[#7891B2]">Bloqueadas</p>
            </div>
            <div className="rounded-2xl border border-[#D5E4F6] bg-white/95 px-3 py-2 text-center">
              <p className="text-xs font-black text-[#F08744]">{newCount}</p>
              <p className="text-[10px] font-black uppercase tracking-[0.05em] text-[#7891B2]">Novas</p>
            </div>
          </div>

          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-[0.05em] text-[#6E88A9]">Progresso</span>
              <span className="text-xs font-black text-[#1E3F67]">{completion}%</span>
            </div>
            <div className="h-3 rounded-full bg-[#DCE8F6]">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#1FB7A5_0%,#51D5C3_100%)] transition-all duration-300"
                style={{ width: `${completion}%` }}
              />
            </div>
          </div>
        </section>

        <section className="flex gap-2 overflow-x-auto pb-1">
          {([
            { id: "all", label: "Todas" },
            { id: "unlocked", label: "Ativas" },
            { id: "locked", label: "Bloqueadas" },
            { id: "new", label: "Novas" },
          ] as const).map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setFilter(option.id)}
              className={`min-h-[40px] rounded-full border px-3 text-xs font-black transition ${
                filter === option.id ? "border-[#36C8B5] bg-[#E8FBF8] text-[#129A8A]" : "border-[#D6E0EE] bg-white text-[#6A7F9D]"
              }`}
            >
              {option.label}
            </button>
          ))}
        </section>
      </header>

      <section className="mt-4">
        {childId === null ? <p className="text-sm font-semibold text-[#6F809A]">Selecione uma criança primeiro.</p> : null}
        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-3xl border border-[#D6E0EE] bg-white/85" />
            ))}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-2xl border border-[#F4C5C2] bg-[#FFF2F1] px-3 py-2 text-sm font-semibold text-[#B54C47]">
            {error}
          </div>
        ) : null}
        {!loading && !error && childId !== null && visibleItems.length === 0 ? (
          <div className="rounded-2xl border border-[#D5E0EE] bg-white px-4 py-5 text-center">
            <p className="text-sm font-black text-[#4A5E7D]">Nada por aqui ainda</p>
            <p className="mt-1 text-xs font-semibold text-[#7E90A9]">Conclua licoes para desbloquear novas figurinhas.</p>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {visibleItems.map((item, index) => {
            const unlocked = item.unlocked;
            const isNew = newlyUnlocked.has(item.id);
            const tier = inferTier(item);
            return (
              <article
                key={item.id}
                className={`group relative overflow-hidden rounded-3xl border p-3 shadow-[0_8px_20px_rgba(48,74,117,0.10)] transition-all duration-200 ${
                  unlocked
                    ? "border-[#BAEADF] bg-[linear-gradient(160deg,#FCFFFE_0%,#EBFBF8_100%)] hover:-translate-y-0.5"
                    : "border-[#D5DDE8] bg-[linear-gradient(160deg,#FFFFFF_0%,#F4F7FB_100%)]"
                }`}
                style={{ animationDelay: `${index * 24}ms` }}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 rounded-full border border-[#D5E4F6] bg-white px-2 py-0.5 text-[10px] font-black text-[#6D84A3]">
                    <Sparkles className="h-3 w-3 text-[#1DB8A6]" aria-hidden />
                    {tierLabel(tier)}
                  </span>
                  {isNew ? <span className="rounded-full bg-[#FFF0D8] px-2 py-0.5 text-[10px] font-black text-[#D26B1D]">Nova</span> : null}
                </div>

                <div className={`grid place-items-center rounded-2xl border py-3 ${unlocked ? "border-[#BFE8E0] bg-white" : "border-[#D6DEEA] bg-[#EEF2F8]"}`}>
                  <div className={!unlocked ? "grayscale" : ""}>
                    <AxioraAvatar mood={ICON_MAP[item.icon_key] ?? "neutral"} size={44} />
                  </div>
                  {!unlocked ? (
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[#DCE4F1] px-2 py-0.5 text-[10px] font-black text-[#6A7F9D]">
                      <Lock className="h-3 w-3" aria-hidden />
                      Bloqueada
                    </span>
                  ) : null}
                </div>

                <h2 className="mt-2 line-clamp-2 text-xs font-black text-[#294A72]">{item.title}</h2>
                <p className="mt-1 line-clamp-2 text-[10px] font-semibold text-[#6C829F]">{unlocked ? item.description : "Continue aprendendo para liberar."}</p>
              </article>
            );
          })}
        </div>
      </section>

        <ChildBottomNav />
      </PageShell>
    </ChildDesktopShell>
  );
}

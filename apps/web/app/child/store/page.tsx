"use client";

import { ArrowLeft, Lock, ShoppingBag, Sparkles, Star } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { ChildBottomNav } from "@/components/child-bottom-nav";
import { ChildDesktopShell } from "@/components/child-desktop-shell";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { equipStoreItem, getApiErrorMessage, getStoreItems, purchaseStoreItem, type StoreCatalogItem } from "@/lib/api/client";

type StoreFilter = "all" | "owned" | "buyable" | "locked";
type StoreTypeFilter = "all" | StoreCatalogItem["type"];

function rarityLabel(rarity: StoreCatalogItem["rarity"]): string {
  if (rarity === "LEGENDARY") return "Lendaria";
  if (rarity === "EPIC") return "Epica";
  if (rarity === "RARE") return "Rara";
  return "Comum";
}

function itemTypeLabel(type: StoreCatalogItem["type"]): string {
  if (type === "AVATAR_SKIN") return "Skins";
  if (type === "BACKGROUND_THEME") return "Temas";
  if (type === "CELEBRATION_ANIMATION") return "Celebracoes";
  return "Molduras";
}

function rarityTone(rarity: StoreCatalogItem["rarity"]): string {
  if (rarity === "LEGENDARY") return "border-[#F6CE7A] bg-[#FFF7E8] text-[#B07017]";
  if (rarity === "EPIC") return "border-[#DAB9FF] bg-[#F7F0FF] text-[#7A4CB6]";
  if (rarity === "RARE") return "border-[#BFE7FF] bg-[#ECF7FF] text-[#2A6A9B]";
  return "border-[#D7E0EE] bg-[#F8FAFD] text-[#6880A0]";
}

function typeOrder(type: StoreCatalogItem["type"]): number {
  if (type === "AVATAR_SKIN") return 1;
  if (type === "BACKGROUND_THEME") return 2;
  if (type === "CELEBRATION_ANIMATION") return 3;
  return 4;
}

export default function ChildStorePage() {
  const [coins, setCoins] = useState(0);
  const [items, setItems] = useState<StoreCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyItemId, setBusyItemId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [filter, setFilter] = useState<StoreFilter>("all");
  const [typeFilter, setTypeFilter] = useState<StoreTypeFilter>("all");

  const loadCatalog = async () => {
    setLoading(true);
    try {
      const data = await getStoreItems();
      setCoins(data.coins);
      setItems(data.items);
      setFeedback(null);
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Nao foi possivel carregar a Loja agora."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCatalog();
  }, []);

  const onBuy = async (itemId: number) => {
    setBusyItemId(itemId);
    try {
      const result = await purchaseStoreItem(itemId);
      setCoins(result.coins);
      await loadCatalog();
      setFeedback("Item comprado com sucesso.");
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Nao foi possivel comprar este item."));
    } finally {
      setBusyItemId(null);
    }
  };

  const onEquip = async (itemId: number) => {
    setBusyItemId(itemId);
    try {
      await equipStoreItem(itemId);
      await loadCatalog();
      setFeedback("Item equipado.");
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Nao foi possivel equipar este item."));
    } finally {
      setBusyItemId(null);
    }
  };

  const ownedCount = useMemo(() => items.filter((item) => item.owned).length, [items]);
  const buyableCount = useMemo(() => items.filter((item) => !item.owned && coins >= item.price).length, [coins, items]);
  const lockedCount = Math.max(0, items.length - ownedCount);

  const visibleItems = useMemo(() => {
    const sorted = [...items].sort((a, b) => {
      if (a.owned !== b.owned) return a.owned ? -1 : 1;
      if (a.equipped !== b.equipped) return a.equipped ? -1 : 1;
      return typeOrder(a.type) - typeOrder(b.type) || a.price - b.price;
    });
    return sorted.filter((item) => {
      if (typeFilter !== "all" && item.type !== typeFilter) return false;
      if (filter === "owned") return item.owned;
      if (filter === "buyable") return !item.owned && coins >= item.price;
      if (filter === "locked") return !item.owned;
      return true;
    });
  }, [coins, filter, items, typeFilter]);

  return (
    <ChildDesktopShell activeNav="loja">
      <PageShell tone="child" width="content" className="relative overflow-hidden pb-32">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-[-14%] top-16 h-64 w-64 rounded-full bg-[#6FD9CA]/10 blur-2xl" />
          <div className="absolute right-[-12%] top-[28%] h-72 w-72 rounded-full bg-[#B2C7FF]/11 blur-3xl" />
          <div className="absolute bottom-24 left-[20%] h-52 w-52 rounded-full bg-[#FFD28A]/10 blur-3xl" />
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
              <p className="text-[11px] font-black uppercase tracking-[0.08em] text-[#6B87AC]">Loja Axiora</p>
              <h1 className="text-2xl font-black leading-tight text-[#20406A]">Loja</h1>
            </div>
            <div className="grid h-14 w-14 place-items-center rounded-2xl border border-[#BFE8E0] bg-[#E9FBF8] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
              <ShoppingBag className="h-6 w-6 text-[#18A796]" aria-hidden />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="rounded-2xl border border-[#D5E4F6] bg-white/95 px-3 py-2 text-center">
              <p className="text-xs font-black text-[#18A796]">{ownedCount}</p>
              <p className="text-[10px] font-black uppercase tracking-[0.05em] text-[#7891B2]">Meus itens</p>
            </div>
            <div className="rounded-2xl border border-[#D5E4F6] bg-white/95 px-3 py-2 text-center">
              <p className="text-xs font-black text-[#5D6F8D]">{lockedCount}</p>
              <p className="text-[10px] font-black uppercase tracking-[0.05em] text-[#7891B2]">Bloqueados</p>
            </div>
            <div className="rounded-2xl border border-[#D5E4F6] bg-white/95 px-3 py-2 text-center">
              <p className="text-xs font-black text-[#F08744]">{coins}</p>
              <p className="text-[10px] font-black uppercase tracking-[0.05em] text-[#7891B2]">AxionCoins</p>
            </div>
          </div>
          {feedback ? <p className="mt-3 rounded-xl border border-[#D5E4F6] bg-white/90 px-3 py-2 text-xs font-semibold text-[#5F6F88]">{feedback}</p> : null}
        </section>

        <section className="flex gap-2 overflow-x-auto pb-1">
          {([
            { id: "all", label: "Todos" },
            { id: "owned", label: "Meus" },
            { id: "buyable", label: `Compraveis ${buyableCount}` },
            { id: "locked", label: "Bloqueados" },
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

        <section className="flex gap-2 overflow-x-auto pb-1">
          {([
            { id: "all", label: "Categorias" },
            { id: "AVATAR_SKIN", label: "Skins" },
            { id: "BACKGROUND_THEME", label: "Temas" },
            { id: "CELEBRATION_ANIMATION", label: "Celebracao" },
            { id: "BADGE_FRAME", label: "Molduras" },
          ] as const).map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setTypeFilter(option.id)}
              className={`min-h-[36px] rounded-full border px-3 text-[11px] font-black transition ${
                typeFilter === option.id ? "border-[#BDD2EC] bg-[#EEF4FF] text-[#3A5A85]" : "border-[#D7E0EE] bg-white text-[#7B8CA4]"
              }`}
            >
              {option.label}
            </button>
          ))}
        </section>
      </header>

      <section className="mt-4">
        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-44 animate-pulse rounded-3xl border border-[#D6E0EE] bg-white/85" />
            ))}
          </div>
        ) : null}

        {!loading && visibleItems.length === 0 ? (
          <div className="rounded-2xl border border-[#D5E0EE] bg-white px-4 py-5 text-center">
            <p className="text-sm font-black text-[#4A5E7D]">Nenhum item nesta visão</p>
            <p className="mt-1 text-xs font-semibold text-[#7E90A9]">Troque o filtro para ver outras recompensas.</p>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {visibleItems.map((item, index) => {
            const locked = !item.owned;
            const canBuy = coins >= item.price;
            return (
              <article
                key={item.id}
                className={`group relative overflow-hidden rounded-3xl border p-3 shadow-[0_8px_20px_rgba(48,74,117,0.10)] transition-all duration-200 ${
                  item.equipped
                    ? "border-[#BDEEE6] bg-[linear-gradient(160deg,#FCFFFE_0%,#EAFBF8_100%)]"
                    : locked
                      ? "border-[#D5DDE8] bg-[linear-gradient(160deg,#FFFFFF_0%,#F4F7FB_100%)]"
                      : "border-[#CFE0F6] bg-[linear-gradient(160deg,#FCFFFF_0%,#EEF6FF_100%)]"
                }`}
                style={{ animationDelay: `${index * 24}ms` }}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black ${rarityTone(item.rarity)}`}>{rarityLabel(item.rarity)}</span>
                  <span className="text-[10px] font-black uppercase tracking-[0.05em] text-[#6F85A5]">{itemTypeLabel(item.type)}</span>
                </div>

                <div className={`grid place-items-center rounded-2xl border py-3 ${locked ? "border-[#D6DEEA] bg-[#EEF2F8]" : "border-[#BFE8E0] bg-white"}`}>
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.imageUrl} alt={item.name} className={`h-12 w-12 object-contain ${locked ? "grayscale" : ""}`} />
                  ) : (
                    <Sparkles className={`h-5 w-5 ${locked ? "text-[#95A4BB]" : "text-[#1DB8A6]"}`} aria-hidden />
                  )}
                </div>

                <h2 className="mt-2 line-clamp-2 text-xs font-black text-[#294A72]">{item.name}</h2>
                <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-black text-[#587295]">
                  <Star className="h-3 w-3 text-[#F2B84A]" aria-hidden />
                  {item.price} AxionCoins
                </div>

                <div className="mt-2">
                  {item.equipped ? (
                    <span className="inline-flex w-full items-center justify-center rounded-full border border-[#AEE4DC] bg-[#E9FBF8] px-2 py-1 text-xs font-black text-[#159685]">
                      Equipado
                    </span>
                  ) : item.owned ? (
                    <Button size="sm" variant="secondary" className="w-full rounded-full" onClick={() => void onEquip(item.id)} disabled={busyItemId === item.id}>
                      {busyItemId === item.id ? "..." : "Equipar"}
                    </Button>
                  ) : (
                    <Button size="sm" className="w-full rounded-full" onClick={() => void onBuy(item.id)} disabled={busyItemId === item.id || !canBuy}>
                      {busyItemId === item.id ? "..." : canBuy ? "Comprar" : "Sem saldo"}
                    </Button>
                  )}
                </div>

                {locked ? (
                  <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-[#DCE4F1] px-2 py-0.5 text-[10px] font-black text-[#6A7F9D]">
                    <Lock className="h-3 w-3" aria-hidden />
                    Bloqueado
                  </span>
                ) : null}
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

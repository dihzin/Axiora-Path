"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Lock, ShoppingBag, Sparkles } from "lucide-react";

import { ChildBottomNav } from "@/components/child-bottom-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { equipStoreItem, getApiErrorMessage, getStoreItems, purchaseStoreItem, type StoreCatalogItem } from "@/lib/api/client";

function rarityGlowClass(rarity: StoreCatalogItem["rarity"]): string {
  if (rarity === "LEGENDARY") return "store-glow-legendary";
  if (rarity === "EPIC") return "store-glow-epic";
  if (rarity === "RARE") return "store-glow-rare";
  return "store-glow-common";
}

function rarityLabel(rarity: StoreCatalogItem["rarity"]): string {
  if (rarity === "LEGENDARY") return "Lendário";
  if (rarity === "EPIC") return "Épico";
  if (rarity === "RARE") return "Raro";
  return "Comum";
}

function itemTypeLabel(type: StoreCatalogItem["type"]): string {
  if (type === "AVATAR_SKIN") return "Skin de avatar";
  if (type === "BACKGROUND_THEME") return "Tema de fundo";
  if (type === "CELEBRATION_ANIMATION") return "Animação de celebração";
  return "Moldura de badge";
}

export default function ChildStorePage() {
  const [coins, setCoins] = useState(0);
  const [items, setItems] = useState<StoreCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyItemId, setBusyItemId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const grouped = useMemo(() => {
    return {
      avatar: items.filter((item) => item.type === "AVATAR_SKIN"),
      background: items.filter((item) => item.type === "BACKGROUND_THEME"),
      celebration: items.filter((item) => item.type === "CELEBRATION_ANIMATION"),
      frame: items.filter((item) => item.type === "BADGE_FRAME"),
    };
  }, [items]);

  const loadCatalog = async () => {
    setLoading(true);
    try {
      const data = await getStoreItems();
      setCoins(data.coins);
      setItems(data.items);
      setFeedback(null);
    } catch (error) {
      setFeedback(getApiErrorMessage(error, "Não foi possível carregar a Loja agora."));
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
      setFeedback(getApiErrorMessage(error, "Não foi possível comprar este item."));
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
      setFeedback(getApiErrorMessage(error, "Não foi possível equipar este item."));
    } finally {
      setBusyItemId(null);
    }
  };

  const renderSection = (title: string, list: StoreCatalogItem[]) => (
    <Card className="mb-3">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {list.length === 0 ? <p className="text-sm text-muted-foreground">Sem itens nesta categoria.</p> : null}
        {list.map((item) => {
          const locked = !item.owned;
          const canBuy = coins >= item.price;
          return (
            <div
              key={item.id}
              className={`store-card-animated rounded-2xl border p-3 transition ${rarityGlowClass(item.rarity)} ${
                item.equipped ? "border-secondary bg-secondary/10" : "border-border bg-card"
              } ${
                locked ? "store-locked-pulse" : ""
              }`}
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{itemTypeLabel(item.type)}</p>
                </div>
                <span className="rounded-full border border-border bg-white px-2 py-0.5 text-[10px] font-semibold">
                  {rarityLabel(item.rarity)}
                </span>
              </div>

              <div className="mb-2 flex h-16 items-center justify-center rounded-xl border border-border bg-muted/40">
                {item.imageUrl ? <img src={item.imageUrl} alt={item.name} className="h-10 w-10" /> : <Sparkles className="h-5 w-5 text-muted-foreground" />}
              </div>

              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-foreground">{item.price} AxionCoins</p>
                {item.equipped ? (
                  <span className="rounded-full bg-secondary/15 px-2 py-0.5 text-xs font-semibold text-secondary">Equipado</span>
                ) : item.owned ? (
                  <Button size="sm" variant="secondary" onClick={() => void onEquip(item.id)} disabled={busyItemId === item.id}>
                    {busyItemId === item.id ? "..." : "Equipar"}
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => void onBuy(item.id)} disabled={busyItemId === item.id || !canBuy}>
                    {busyItemId === item.id ? "..." : canBuy ? "Comprar" : "Sem saldo"}
                  </Button>
                )}
              </div>

              {locked ? (
                <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  <Lock className="h-3 w-3" />
                  Bloqueado
                </div>
              ) : null}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );

  return (
    <main className="safe-px safe-pb mx-auto min-h-screen w-full max-w-md p-4 pb-52 md:p-6 md:pb-40">
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

      <Card className="mb-3">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-secondary" />
            Loja Axiora
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <p className="font-semibold text-foreground">Saldo: {coins} AxionCoins</p>
          <p className="text-muted-foreground">Compre upgrades cosméticos com moedas do jogo.</p>
          {loading ? <p className="mt-2 text-muted-foreground">Carregando itens...</p> : null}
          {feedback ? <p className="mt-2 text-xs text-muted-foreground">{feedback}</p> : null}
        </CardContent>
      </Card>

      {renderSection("Skins de Avatar", grouped.avatar)}
      {renderSection("Temas de Fundo", grouped.background)}
      {renderSection("Animações de Celebração", grouped.celebration)}
      {renderSection("Molduras de Badge", grouped.frame)}

      <ChildBottomNav />
    </main>
  );
}

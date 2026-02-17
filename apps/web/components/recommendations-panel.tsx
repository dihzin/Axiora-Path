"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { dismissRecommendation, getRecommendations, type RecommendationOut } from "@/lib/api/client";

type RecommendationsPanelProps = {
  childId: number;
};

function severityClass(severity: string): string {
  const value = severity.toLowerCase();
  if (value === "high") return "bg-destructive/15 text-destructive";
  if (value === "medium") return "bg-accent/20 text-accent-foreground";
  return "bg-secondary/15 text-secondary";
}

export function RecommendationsPanel({ childId }: RecommendationsPanelProps) {
  const [items, setItems] = useState<RecommendationOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissError, setDismissError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dismissingId, setDismissingId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getRecommendations(childId);
      setItems(data.filter((item) => item.dismissed_at === null));
    } catch {
      setItems([]);
      setLoadError("Nao foi possivel carregar recomendacoes agora.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [childId]);

  const onDismiss = async (id: number) => {
    setDismissError(null);
    setDismissingId(id);
    try {
      await dismissRecommendation(id);
      setItems((current) => current.filter((item) => item.id !== id));
    } catch {
      setDismissError("Nao foi possível dispensar recomendacao.");
    } finally {
      setDismissingId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recomendações</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? <p className="text-sm text-muted-foreground">Carregando...</p> : null}
        {loadError ? <p className="text-sm text-muted-foreground">{loadError}</p> : null}
        {dismissError ? <p className="text-sm text-destructive">{dismissError}</p> : null}
        {!loading && !loadError && items.length === 0 ? <p className="text-sm text-muted-foreground">Sem recomendações ativas.</p> : null}
        {items.map((item) => (
          <div key={item.id} className="rounded-xl border border-border p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{item.title}</p>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${severityClass(item.severity)}`}>
                {item.severity.toLowerCase()}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{item.body}</p>
            <Button className="mt-3" size="sm" variant="outline" onClick={() => void onDismiss(item.id)} disabled={dismissingId === item.id}>
              {dismissingId === item.id ? "..." : "Dismiss"}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

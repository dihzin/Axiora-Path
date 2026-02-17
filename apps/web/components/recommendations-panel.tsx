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
  if (value === "high") return "bg-red-100 text-red-700";
  if (value === "medium") return "bg-orange-100 text-orange-700";
  return "bg-blue-100 text-blue-700";
}

export function RecommendationsPanel({ childId }: RecommendationsPanelProps) {
  const [items, setItems] = useState<RecommendationOut[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await getRecommendations(childId);
      setItems(data.filter((item) => item.dismissed_at === null));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [childId]);

  const onDismiss = async (id: number) => {
    await dismissRecommendation(id);
    setItems((current) => current.filter((item) => item.id !== id));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recomendaes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? <p className="text-sm text-muted-foreground">Carregando...</p> : null}
        {!loading && items.length === 0 ? <p className="text-sm text-muted-foreground">Sem recomendaes ativas.</p> : null}
        {items.map((item) => (
          <div key={item.id} className="rounded-lg border border-border p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{item.title}</p>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${severityClass(item.severity)}`}>
                {item.severity.toLowerCase()}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{item.body}</p>
            <Button className="mt-3" size="sm" variant="outline" onClick={() => void onDismiss(item.id)}>
              Dismiss
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}


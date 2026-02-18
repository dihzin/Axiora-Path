"use client";

import { useEffect, useState } from "react";
import { MessageCircle, Sparkles } from "lucide-react";

import { AxioraAvatar } from "@/components/axiora/AxioraAvatar";
import { ChildBottomNav } from "@/components/child-bottom-nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAiCoach as requestAiCoach } from "@/lib/api/client";

export default function ChildCoachPage() {
  const [message, setMessage] = useState<string>("Carregando mensagem do Axion...");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const rawChildId = localStorage.getItem("axiora_child_id");
    const parsedChildId = Number(rawChildId);
    if (!rawChildId || !Number.isFinite(parsedChildId)) {
      setMessage("Selecione uma criança para usar o Axion.");
      setLoading(false);
      return;
    }

    requestAiCoach(parsedChildId, "CHILD", "context:child_tab")
      .then((data) => {
        setMessage(data.reply);
      })
      .catch(() => {
        setMessage("Não foi possível carregar o Axion agora.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  return (
    <main className="safe-px safe-pb mx-auto min-h-screen w-full max-w-md p-4 pb-24 md:p-6 md:pb-24">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>Axion</CardTitle>
            <span className="inline-flex items-center gap-1 rounded-full border border-secondary/35 bg-secondary/12 px-2 py-0.5 text-xs font-semibold text-secondary">
              <Sparkles className="h-3.5 w-3.5 stroke-[2.6]" />
              Coach
            </span>
          </div>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <div className="mb-3 flex items-center gap-2 rounded-2xl border border-border bg-muted/50 p-2">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-white shadow-[0_2px_0_rgba(184,200,239,0.6)]">
              <AxioraAvatar mood="happy" size={28} />
            </div>
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-white shadow-[0_2px_0_rgba(184,200,239,0.6)]">
              <MessageCircle className="h-4 w-4 stroke-[2.6]" />
            </div>
            <p className="text-xs font-medium text-foreground">Mensagem personalizada do Axion</p>
          </div>
          <p>{message}</p>
          {loading ? <p className="mt-2 text-xs">Aguarde...</p> : null}
        </CardContent>
      </Card>
      <ChildBottomNav />
    </main>
  );
}

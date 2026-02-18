"use client";

import { useEffect, useState } from "react";

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
          <CardTitle>Axion</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>{message}</p>
          {loading ? <p className="mt-2 text-xs">Aguarde...</p> : null}
        </CardContent>
      </Card>
      <ChildBottomNav />
    </main>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ParentPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const ok = sessionStorage.getItem("axiora_parent_pin_ok");
    if (ok === "1") {
      setAllowed(true);
      return;
    }
    router.replace("/parent-pin");
  }, [router]);

  if (!allowed) {
    return null;
  }

  return (
    <main className="safe-px safe-pb mx-auto min-h-screen w-full max-w-md py-5">
      <h1 className="mb-3 text-lg font-semibold">Area dos pais</h1>
      <Tabs defaultValue="routine">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="routine">Rotina</TabsTrigger>
          <TabsTrigger value="wallet">Carteira</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
        </TabsList>

        <TabsContent value="routine">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Gestao de tarefas</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">Cadastro e revisao no fluxo MVP.</CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="wallet">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Economia</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">Saldo e metas por perfil infantil.</CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="insights">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recomendacoes</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">Alertas e sugestoes de rotina.</CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </main>
  );
}

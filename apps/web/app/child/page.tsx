"use client";

import Link from "next/link";
import { Home, Sparkles, Star } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ChildPage() {
  return (
    <main className="safe-px safe-pb mx-auto flex min-h-screen w-full max-w-md flex-col pb-24 pt-5">
      <section className="space-y-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Area da crianca</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            MVP mobile com navegao inferior. Conteudo funcional sera ligado aos endpoints na proxima etapa.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resumo rapido</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Tarefas e progresso do dia.</CardContent>
        </Card>
      </section>

      <nav className="safe-px safe-pb fixed inset-x-0 bottom-0 border-t border-border bg-background/95 py-2 backdrop-blur">
        <div className="mx-auto grid w-full max-w-md grid-cols-3 gap-1">
          <Link className="flex flex-col items-center gap-1 rounded-md py-2 text-xs font-medium text-primary" href="/child">
            <Home className="h-4 w-4" />
            Inicio
          </Link>
          <Link className="flex flex-col items-center gap-1 rounded-md py-2 text-xs text-muted-foreground" href="/child">
            <Star className="h-4 w-4" />
            Rotina
          </Link>
          <Link className="flex flex-col items-center gap-1 rounded-md py-2 text-xs text-muted-foreground" href="/child">
            <Sparkles className="h-4 w-4" />
            Coach
          </Link>
        </div>
      </nav>
    </main>
  );
}


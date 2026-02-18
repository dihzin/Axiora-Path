"use client";

import { Brain, Grid2x2, SpellCheck2, Swords, Timer } from "lucide-react";
import type { ComponentType } from "react";

import { ChildBottomNav } from "@/components/child-bottom-nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type GameItem = {
  id: string;
  title: string;
  description: string;
  skill: string;
  level: string;
  icon: ComponentType<{ className?: string }>;
};

const GAMES: GameItem[] = [
  {
    id: "tic-tac-toe",
    title: "Jogo da Velha",
    description: "Treine lógica, antecipação e tomada de decisão em partidas rápidas.",
    skill: "Lógica e estratégia",
    level: "Fácil",
    icon: Grid2x2,
  },
  {
    id: "word-search",
    title: "Caça-palavras",
    description: "Encontre palavras por tema para fortalecer leitura e atenção.",
    skill: "Vocabulário",
    level: "Fácil",
    icon: SpellCheck2,
  },
  {
    id: "crossword",
    title: "Palavra Cruzada",
    description: "Resolva pistas e complete o quadro com novas palavras.",
    skill: "Interpretação",
    level: "Médio",
    icon: Brain,
  },
  {
    id: "hangman",
    title: "Forca",
    description: "Descubra a palavra secreta com o menor número de tentativas.",
    skill: "Ortografia",
    level: "Médio",
    icon: Swords,
  },
];

export default function ChildGamesPage() {
  return (
    <main className="safe-px safe-pb mx-auto min-h-screen w-full max-w-md p-4 pb-24 md:p-6 md:pb-24">
      <Card className="mb-4">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>Jogos educativos</CardTitle>
            <span className="inline-flex items-center gap-1 rounded-full border border-accent/35 bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent-foreground">
              <Timer className="h-3.5 w-3.5 stroke-[2.6]" />
              Em breve
            </span>
          </div>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Escolha um jogo para praticar habilidades importantes de forma divertida.
        </CardContent>
      </Card>

      <section className="space-y-3 pb-3">
        {GAMES.map((game) => {
          const Icon = game.icon;
          return (
            <Card key={game.id}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border bg-white shadow-[0_2px_0_rgba(184,200,239,0.7)]">
                    <Icon className="h-5 w-5 stroke-[2.6] text-secondary" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-foreground">{game.title}</p>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{game.level}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{game.description}</p>
                    <p className="mt-1 text-xs font-medium text-foreground/80">{game.skill}</p>
                    <Button className="mt-3" size="sm" variant="outline" disabled>
                      Em breve
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <ChildBottomNav />
    </main>
  );
}
